import { Inject, Injectable } from '@nestjs/common';
import { Config, CONFIG } from '../config/config';
import { Centavos, paraCentavos } from '../dominio/dinheiro';

export interface VolumeFrete {
  id: string;
  pesoKg: number;
  alturaCm: number;
  larguraCm: number;
  comprimentoCm: number;
  valorUnitario: Centavos;
  quantidade: number;
}

export interface CotacaoProvedor {
  servicoId: number;
  descricao: string;
  valor: Centavos;
  prazoDias: number;
}

/** Porta de saída para cotação de frete (ADR-006). */
export abstract class ProvedorFrete {
  abstract disponivel(): boolean;
  abstract cotar(cepOrigem: string, cepDestino: string, volumes: VolumeFrete[]): Promise<CotacaoProvedor[]>;
}

interface RespostaMelhorEnvio {
  id: number;
  name: string;
  price?: string;
  custom_price?: string;
  delivery_time?: number;
  custom_delivery_time?: number;
  error?: string;
  company?: { name: string };
}

@Injectable()
export class MelhorEnvioProvedor extends ProvedorFrete {

  constructor(@Inject(CONFIG) private readonly config: Config) {
    super();
  }

  disponivel() {
    return Boolean(this.config.ME_TOKEN);
  }

  async cotar(cepOrigem: string, cepDestino: string, volumes: VolumeFrete[]): Promise<CotacaoProvedor[]> {
    const corpo = {
      from: { postal_code: cepOrigem },
      to: { postal_code: cepDestino },
      products: volumes.map((v) => ({
        id: v.id,
        width: v.larguraCm,
        height: v.alturaCm,
        length: v.comprimentoCm,
        weight: v.pesoKg,
        insurance_value: v.valorUnitario / 100,
        quantity: v.quantidade,
      })),
      options: { receipt: false, own_hand: false },
      ...(this.config.ME_SERVICOS ? { services: this.config.ME_SERVICOS } : {}),
    };
    const url = new URL('/api/v2/me/shipment/calculate', this.config.ME_URL_API);
    const resposta = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.ME_TOKEN}`,
        'User-Agent': `${this.config.NOME_LOJA} (${this.config.ME_EMAIL_CONTATO})`,
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(5000),
    });
    if (!resposta.ok) throw new Error(`Melhor Envio respondeu ${resposta.status}`);
    const dados = (await resposta.json()) as RespostaMelhorEnvio[];
    return dados
      .filter((s) => !s.error && (s.custom_price ?? s.price))
      .map((s) => ({
        servicoId: s.id,
        descricao: s.company?.name ? `${s.company.name} — ${s.name}` : s.name,
        valor: paraCentavos(Number(s.custom_price ?? s.price).toFixed(2)),
        prazoDias: Number(s.custom_delivery_time ?? s.delivery_time ?? 0),
      }))
      .sort((a, b) => a.valor - b.valor);
  }

}
