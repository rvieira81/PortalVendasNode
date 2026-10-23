import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { and, isNull, lt } from 'drizzle-orm';
import { Pool } from 'pg';
import { Config, CONFIG } from '../config/config';
import { Relogio } from '../comum/relogio';
import { Banco, BANCO, POOL } from '../db/db';
import { carrinho, notificacaoGateway, tokenUsuario } from '../db/schema';
import { PagamentosService } from '../pagamentos/pagamentos.service';

const BLOQUEIO_JOB = 727001;
const DIA = 86_400_000;

/**
 * Job de manutenção (ADR-007): concilia pagamentos, expira pedidos e limpa dados vencidos.
 * pg_try_advisory_lock garante uma execução por vez mesmo com várias réplicas da API.
 */
@Injectable()
export class ManutencaoService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Manutencao');
  private timer?: NodeJS.Timeout;
  private primeira?: NodeJS.Timeout;
  private rodando = false;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(BANCO) private readonly db: Banco,
    @Inject(POOL) private readonly pool: Pool,
    private readonly relogio: Relogio,
    private readonly pagamentos: PagamentosService,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.manutencaoAtiva) return;
    const intervalo = Math.max(1, this.config.MANUTENCAO_INTERVALO_MIN) * 60_000;
    this.primeira = setTimeout(() => void this.executar(), 30_000);
    this.timer = setInterval(() => void this.executar(), intervalo);
    this.logger.log(`Manutenção a cada ${intervalo / 60_000} min`);
  }

  onApplicationShutdown() {
    clearTimeout(this.primeira);
    clearInterval(this.timer);
  }

  async executar() {
    if (this.rodando) return null;
    this.rodando = true;
    const cliente = await this.pool.connect();
    try {
      const { rows } = await cliente.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [BLOQUEIO_JOB]);
      if (!rows[0]?.ok) return null; // outra réplica está executando
      try {
        const conciliados = await this.pagamentos.conciliarPendentes();
        const expirados = await this.pagamentos.expirarPedidos();
        const limpos = await this.limpar();
        if (conciliados || expirados || limpos) this.logger.log(`Manutenção: ${conciliados} conciliado(s), ${expirados} expirado(s), ${limpos} registro(s) limpos`);
        return { conciliados, expirados, limpos };
      } finally {
        await cliente.query('SELECT pg_advisory_unlock($1)', [BLOQUEIO_JOB]);
      }
    } catch (erro) {
      this.logger.error({ err: erro }, 'Falha na manutenção');
      return null;
    } finally {
      cliente.release();
      this.rodando = false;
    }
  }

  /** Retenção (docs/03-banco.md §6). */
  private async limpar() {
    const agora = this.relogio.agora().getTime();
    const carrinhos = await this.db
      .delete(carrinho)
      .where(and(isNull(carrinho.usuarioId), lt(carrinho.atualizadoEm, new Date(agora - 30 * DIA))))
      .returning({ id: carrinho.id });
    const tokens = await this.db.delete(tokenUsuario).where(lt(tokenUsuario.expiraEm, new Date(agora - 7 * DIA))).returning({ id: tokenUsuario.id });
    const notificacoes = await this.db
      .delete(notificacaoGateway)
      .where(lt(notificacaoGateway.recebidaEm, new Date(agora - 90 * DIA)))
      .returning({ id: notificacaoGateway.id });
    return carrinhos.length + tokens.length + notificacoes.length;
  }
}
