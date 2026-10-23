import { Injectable, Logger } from '@nestjs/common';
import { somenteDigitos } from '../dominio/cpf';

export interface EnderecoCep {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export abstract class ServicoCep {
  /** null = CEP não existe; lança erro se o serviço estiver fora. */
  abstract consultar(cep: string): Promise<EnderecoCep | null>;
}

@Injectable()
export class ViaCepService extends ServicoCep {
  private readonly logger = new Logger('ViaCEP');
  private readonly cache = new Map<string, { valor: EnderecoCep | null; ate: number }>();

  async consultar(cepInformado: string): Promise<EnderecoCep | null> {
    const cep = somenteDigitos(cepInformado);
    if (cep.length !== 8) return null;
    const emCache = this.cache.get(cep);
    if (emCache && emCache.ate > Date.now()) return emCache.valor;

    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(4000) });
    if (!resposta.ok) {
      this.logger.warn(`ViaCEP respondeu ${resposta.status}`);
      throw new Error('Serviço de CEP indisponível');
    }
    const dados = (await resposta.json()) as Record<string, string | boolean>;
    const valor: EnderecoCep | null = dados.erro
      ? null
      : {
          cep,
          logradouro: String(dados.logradouro ?? ''),
          bairro: String(dados.bairro ?? ''),
          cidade: String(dados.localidade ?? ''),
          uf: String(dados.uf ?? ''),
        };
    if (this.cache.size > 5000) this.cache.clear();
    this.cache.set(cep, { valor, ate: Date.now() + 24 * 3_600_000 });
    return valor;
  }
}
