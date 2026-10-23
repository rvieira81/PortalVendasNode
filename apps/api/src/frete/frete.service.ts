import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { ErroNegocio } from '../comum/erros';
import { Banco, BANCO } from '../db/db';
import { configuracao, faixaFrete } from '../db/schema';
import { somenteDigitos } from '../dominio/cpf';
import { Centavos, paraCentavos } from '../dominio/dinheiro';
import { ProvedorFrete, VolumeFrete } from './provedor-frete';

export interface OpcaoFrete {
  codigo: string; // "me-1" (Melhor Envio) ou "faixa-3" (contingência)
  servicoId: number | null;
  descricao: string;
  valor: Centavos;
  prazoDias: number;
  gratis: boolean;
}

export interface ConfigFrete {
  cepOrigem: string;
  diasManuseio: number;
  gratisAPartirDe: Centavos;
}

@Injectable()
export class FreteService {
  private readonly logger = new Logger('Frete');

  constructor(
    @Inject(BANCO) private readonly db: Banco,
    private readonly provedor: ProvedorFrete,
  ) {}

  async configuracao(): Promise<ConfigFrete> {
    const linhas = await this.db
      .select()
      .from(configuracao)
      .where(inArray(configuracao.chave, ['frete.cep_origem', 'frete.dias_manuseio', 'frete.gratis_a_partir_de']));
    const m = new Map(linhas.map((l) => [l.chave, l.valor]));
    return {
      cepOrigem: m.get('frete.cep_origem') ?? '01001000',
      diasManuseio: Number(m.get('frete.dias_manuseio') ?? 0),
      gratisAPartirDe: paraCentavos(m.get('frete.gratis_a_partir_de') ?? '0'),
    };
  }

  /**
   * RF08 — cota no Melhor Envio; se falhar, estiver sem token ou sem opções, usa a tabela de contingência.
   * Soma os dias de manuseio e aplica o frete grátis na opção mais barata.
   */
  async cotar(cepInformado: string, volumes: VolumeFrete[], subtotal: Centavos): Promise<OpcaoFrete[]> {
    const cep = somenteDigitos(cepInformado);
    if (cep.length !== 8) throw new ErroNegocio('CEP inválido.');
    if (!volumes.length) throw new ErroNegocio('O carrinho está vazio.');
    const cfg = await this.configuracao();

    let opcoes: OpcaoFrete[] = [];
    if (this.provedor.disponivel()) {
      try {
        const cotacoes = await this.provedor.cotar(cfg.cepOrigem, cep, volumes);
        opcoes = cotacoes.map((c) => ({ codigo: `me-${c.servicoId}`, servicoId: c.servicoId, descricao: c.descricao, valor: c.valor, prazoDias: c.prazoDias, gratis: false }));
      } catch (erro) {
        this.logger.warn(`Melhor Envio indisponível, usando a tabela de contingência: ${(erro as Error).message}`);
      }
    }
    if (!opcoes.length) opcoes = await this.contingencia(cep);
    if (!opcoes.length) throw new ErroNegocio('Não entregamos neste CEP.');

    opcoes = opcoes
      .map((o) => ({ ...o, prazoDias: o.prazoDias + cfg.diasManuseio }))
      .sort((a, b) => a.valor - b.valor || a.prazoDias - b.prazoDias);
    if (cfg.gratisAPartirDe > 0 && subtotal >= cfg.gratisAPartirDe) {
      opcoes[0] = { ...opcoes[0], valor: 0, gratis: true };
    }
    return opcoes;
  }

  private async contingencia(cep: string): Promise<OpcaoFrete[]> {
    const faixas = await this.db
      .select()
      .from(faixaFrete)
      .where(and(eq(faixaFrete.ativa, true), lte(faixaFrete.cepInicio, cep), gte(faixaFrete.cepFim, cep)))
      .orderBy(asc(faixaFrete.valor))
      .limit(1);
    if (faixas.length) this.logger.warn(`Frete pela tabela de contingência para o CEP ${cep.slice(0, 5)}-***`);
    return faixas.map((f) => ({
      codigo: `faixa-${f.id}`,
      servicoId: null,
      descricao: `Entrega padrão (${f.descricao})`,
      valor: paraCentavos(f.valor),
      prazoDias: f.prazoDias,
      gratis: false,
    }));
  }
}
