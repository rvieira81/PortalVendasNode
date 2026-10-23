import { Relogio } from '../../src/comum/relogio';
import { EnderecoCep, ServicoCep } from '../../src/contas/cep.service';
import { Mensagem, EnvioEmail } from '../../src/email/email.service';
import { CotacaoProvedor, ProvedorFrete } from '../../src/frete/provedor-frete';
import { GatewayPagamento, PagamentoGateway, PedidoPagamentoGateway } from '../../src/pagamentos/gateway';

export class RelogioFalso extends Relogio {
  deslocamentoMs = 0;
  agora() {
    return new Date(Date.now() + this.deslocamentoMs);
  }
  avancarMinutos(min: number) {
    this.deslocamentoMs += min * 60_000;
  }
}

export class EmailMemoria extends EnvioEmail {
  enviados: Mensagem[] = [];
  async enviar(m: Mensagem) {
    this.enviados.push(m);
  }
  /** Token do último link enviado para o e-mail (confirmação ou redefinição). */
  ultimoToken(para: string) {
    const msg = [...this.enviados].reverse().find((m) => m.para === para && /token=/.test(m.html));
    return msg ? decodeURIComponent(/token=([^"&]+)/.exec(msg.html)![1]) : null;
  }
}

export class CepFalso extends ServicoCep {
  async consultar(cep: string): Promise<EnderecoCep | null> {
    if (cep.replace(/\D/g, '') === '00000000') return null;
    return { cep, logradouro: 'Rua das Flores', bairro: 'Centro', cidade: 'Valinhos', uf: 'SP' };
  }
}

export class FreteFalso extends ProvedorFrete {
  ativo = true;
  falhar = false;
  cotacoes: CotacaoProvedor[] = [
    { servicoId: 1, descricao: 'Correios — PAC', valor: 2490, prazoDias: 6 },
    { servicoId: 2, descricao: 'Correios — SEDEX', valor: 4590, prazoDias: 2 },
  ];
  disponivel() {
    return this.ativo;
  }
  async cotar(): Promise<CotacaoProvedor[]> {
    if (this.falhar) throw new Error('Melhor Envio fora do ar');
    return this.cotacoes;
  }
}

/**
 * Gateway em memória. `proximo` define o status devolvido na criação; `definirStatus` simula
 * a mudança no Mercado Pago (o webhook só traz o id — a API consulta aqui).
 */
export class GatewayFalso extends GatewayPagamento {
  pagamentos = new Map<number, PagamentoGateway>();
  estornos: number[] = [];
  criados: PedidoPagamentoGateway[] = [];
  proximo: { status: string; detalhe?: string } = { status: 'pending' };
  falharCriacao = false;
  private sequencia = 9_000_000;

  configurado() {
    return true;
  }

  async criar(p: PedidoPagamentoGateway): Promise<PagamentoGateway> {
    if (this.falharCriacao) throw new Error('fora do ar');
    this.criados.push(p);
    const id = ++this.sequencia;
    const pg: PagamentoGateway = {
      id,
      status: this.proximo.status,
      statusDetalhe: this.proximo.detalhe ?? null,
      valor: p.valor,
      referenciaExterna: String(p.pedidoId),
      parcelas: p.cartao?.parcelas ?? null,
      bandeira: p.cartao?.paymentMethodId ?? (p.metodo === 'pix' ? 'pix' : 'bolbradesco'),
      ultimosDigitos: p.cartao ? '4242' : null,
      pixQrCode: p.metodo === 'pix' ? `00020126PIX${id}` : null,
      pixQrCodeBase64: p.metodo === 'pix' ? 'iVBORw0KGgo=' : null,
      boletoUrl: p.metodo === 'boleto' ? `https://mp.teste/boleto/${id}` : null,
      boletoLinhaDigitavel: p.metodo === 'boleto' ? '23790.00000 00000.000000 00000.000000 1 00000000000000' : null,
      expiraEm: p.expiraEm ?? null,
    };
    this.pagamentos.set(id, pg);
    return { ...pg };
  }

  async consultar(id: number) {
    const p = this.pagamentos.get(id);
    if (!p) throw new Error('pagamento inexistente');
    return { ...p };
  }

  async estornar(id: number) {
    this.estornos.push(id);
    const p = this.pagamentos.get(id);
    if (p) p.status = 'refunded';
    return { status: 'approved' };
  }

  definirStatus(id: number, status: string, detalhe?: string, valor?: number) {
    const p = this.pagamentos.get(id)!;
    p.status = status;
    p.statusDetalhe = detalhe ?? null;
    if (valor !== undefined) p.valor = valor;
  }

  ultimoId() {
    return this.sequencia;
  }
}
