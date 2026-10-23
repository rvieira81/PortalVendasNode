import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { Config, CONFIG } from '../config/config';
import { Centavos, paraCentavos } from '../dominio/dinheiro';

export type MetodoGateway = 'pix' | 'boleto' | 'cartao';

export interface PedidoPagamentoGateway {
  chaveIdempotencia: string;
  pedidoId: number;
  valor: Centavos;
  descricao: string;
  metodo: MetodoGateway;
  expiraEm?: Date;
  pagador: { email: string; nome: string; cpf: string; cep?: string; logradouro?: string; numero?: string; bairro?: string; cidade?: string; uf?: string };
  cartao?: { token: string; parcelas: number; paymentMethodId: string; issuerId?: string };
}

export interface PagamentoGateway {
  id: number;
  status: string;
  statusDetalhe: string | null;
  valor: Centavos;
  referenciaExterna: string | null;
  parcelas: number | null;
  bandeira: string | null;
  ultimosDigitos: string | null;
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  boletoUrl: string | null;
  boletoLinhaDigitavel: string | null;
  expiraEm: Date | null;
}

/** Porta de saída para o gateway de pagamento (ADR-005). Nos testes entra um gateway falso. */
export abstract class GatewayPagamento {
  abstract configurado(): boolean;
  abstract criar(pedido: PedidoPagamentoGateway): Promise<PagamentoGateway>;
  abstract consultar(id: number): Promise<PagamentoGateway>;
  abstract estornar(id: number, chaveIdempotencia: string): Promise<{ status: string }>;
}

export class ErroGateway extends Error {
  constructor(mensagem: string, readonly status?: number, readonly detalhe?: unknown) {
    super(mensagem);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
@Injectable()
export class MercadoPagoGateway extends GatewayPagamento {
  constructor(@Inject(CONFIG) private readonly config: Config) {
    super();
  }

  configurado() {
    return Boolean(this.config.MP_ACCESS_TOKEN);
  }

  private async chamar(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown, chaveIdempotencia?: string): Promise<any> {
    if (!this.configurado()) throw new ErroGateway('Mercado Pago não configurado (MP_ACCESS_TOKEN)');
    const resposta = await fetch(new URL(caminho, this.config.MP_URL_API), {
      method: metodo,
      headers: {
        Authorization: `Bearer ${this.config.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        ...(chaveIdempotencia ? { 'X-Idempotency-Key': chaveIdempotencia } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const texto = await resposta.text();
    const dados = texto ? JSON.parse(texto) : {};
    if (!resposta.ok) throw new ErroGateway(`Mercado Pago respondeu ${resposta.status}: ${dados?.message ?? texto.slice(0, 200)}`, resposta.status, dados);
    return dados;
  }

  async criar(p: PedidoPagamentoGateway): Promise<PagamentoGateway> {
    const [primeiroNome, ...resto] = p.pagador.nome.trim().split(/\s+/);
    const corpo: Record<string, unknown> = {
      transaction_amount: p.valor / 100,
      description: p.descricao,
      external_reference: String(p.pedidoId),
      statement_descriptor: this.config.NOME_LOJA.slice(0, 13),
      ...(this.config.MP_URL_NOTIFICACAO ? { notification_url: this.config.MP_URL_NOTIFICACAO } : {}),
      payer: {
        email: p.pagador.email,
        first_name: primeiroNome,
        last_name: resto.join(' ') || primeiroNome,
        identification: { type: 'CPF', number: p.pagador.cpf },
        ...(p.metodo === 'boleto'
          ? {
              address: {
                zip_code: p.pagador.cep,
                street_name: p.pagador.logradouro,
                street_number: p.pagador.numero,
                neighborhood: p.pagador.bairro,
                city: p.pagador.cidade,
                federal_unit: p.pagador.uf,
              },
            }
          : {}),
      },
    };
    if (p.metodo === 'pix') {
      corpo.payment_method_id = 'pix';
      if (p.expiraEm) corpo.date_of_expiration = p.expiraEm.toISOString().replace('Z', '-00:00');
    } else if (p.metodo === 'boleto') {
      corpo.payment_method_id = 'bolbradesco';
      if (p.expiraEm) corpo.date_of_expiration = p.expiraEm.toISOString().replace('Z', '-00:00');
    } else if (p.cartao) {
      corpo.token = p.cartao.token;
      corpo.installments = p.cartao.parcelas;
      corpo.payment_method_id = p.cartao.paymentMethodId;
      if (p.cartao.issuerId) corpo.issuer_id = Number(p.cartao.issuerId);
    }
    return this.converter(await this.chamar('POST', '/v1/payments', corpo, p.chaveIdempotencia));
  }

  async consultar(id: number): Promise<PagamentoGateway> {
    return this.converter(await this.chamar('GET', `/v1/payments/${id}`));
  }

  async estornar(id: number, chaveIdempotencia: string) {
    const r = await this.chamar('POST', `/v1/payments/${id}/refunds`, {}, chaveIdempotencia);
    return { status: String(r.status ?? 'approved') };
  }

  private converter(d: any): PagamentoGateway {
    const transacao = d.point_of_interaction?.transaction_data ?? {};
    return {
      id: Number(d.id),
      status: String(d.status),
      statusDetalhe: d.status_detail ?? null,
      valor: paraCentavos(Number(d.transaction_amount ?? 0).toFixed(2)),
      referenciaExterna: d.external_reference ?? null,
      parcelas: d.installments ?? null,
      bandeira: d.payment_method_id ?? null,
      ultimosDigitos: d.card?.last_four_digits ?? null,
      pixQrCode: transacao.qr_code ?? null,
      pixQrCodeBase64: transacao.qr_code_base64 ?? null,
      boletoUrl: d.transaction_details?.external_resource_url ?? null,
      boletoLinhaDigitavel: d.transaction_details?.digitable_line ?? d.barcode?.content ?? null,
      expiraEm: d.date_of_expiration ? new Date(d.date_of_expiration) : null,
    };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

@Global()
@Module({
  providers: [{ provide: GatewayPagamento, useClass: MercadoPagoGateway }],
  exports: [GatewayPagamento],
})
export class GatewayModule {}
