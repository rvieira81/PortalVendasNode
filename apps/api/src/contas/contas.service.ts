import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { ErroNegocio, NaoEncontrado } from '../comum/erros';
import { Relogio } from '../comum/relogio';
import { Banco, BANCO } from '../db/db';
import { carrinho, endereco, pagamento, pedido, pedidoItem, usuario } from '../db/schema';
import { mascararCpf, mascararTelefone, somenteDigitos } from '../dominio/cpf';
import { verificarSenha } from '../dominio/seguranca';

export interface DadosEndereco {
  apelido: string;
  destinatario: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  padrao: boolean;
}

@Injectable()
export class ContasService {
  constructor(
    @Inject(BANCO) private readonly db: Banco,
    private readonly relogio: Relogio,
  ) {}

  async perfil(usuarioId: number) {
    const [u] = await this.db.select().from(usuario).where(eq(usuario.id, usuarioId));
    if (!u) throw new NaoEncontrado();
    return {
      nome: u.nome,
      email: u.email,
      emailConfirmado: u.emailConfirmado,
      cpf: mascararCpf(u.cpf),
      telefone: mascararTelefone(u.telefone),
      criadoEm: u.criadoEm,
    };
  }

  async atualizarPerfil(usuarioId: number, dados: { nome: string; telefone?: string }) {
    await this.db
      .update(usuario)
      .set({ nome: dados.nome, ...(dados.telefone ? { telefone: somenteDigitos(dados.telefone) } : {}), alteradoEm: this.relogio.agora() })
      .where(eq(usuario.id, usuarioId));
    return this.perfil(usuarioId);
  }

  /* ---------------- Endereços (RF07) ---------------- */

  enderecos(usuarioId: number) {
    return this.db
      .select()
      .from(endereco)
      .where(eq(endereco.usuarioId, usuarioId))
      .orderBy(desc(endereco.padrao), desc(endereco.id));
  }

  async endereco(usuarioId: number, id: number) {
    // Sempre filtrado pelo dono: o endereço de outro cliente é 404 (IDOR)
    const [e] = await this.db.select().from(endereco).where(and(eq(endereco.id, id), eq(endereco.usuarioId, usuarioId)));
    if (!e) throw new NaoEncontrado('Endereço não encontrado.');
    return e;
  }

  async salvarEndereco(usuarioId: number, dados: DadosEndereco, id?: number) {
    return this.db.transaction(async (tx) => {
      const [{ quantidade }] = await tx
        .select({ quantidade: sql<number>`count(*)::int` })
        .from(endereco)
        .where(eq(endereco.usuarioId, usuarioId));
      if (!id && quantidade >= 10) throw new ErroNegocio('Limite de 10 endereços por conta.');
      const padrao = dados.padrao || quantidade === 0;
      if (padrao) {
        await tx
          .update(endereco)
          .set({ padrao: false })
          .where(and(eq(endereco.usuarioId, usuarioId), id ? ne(endereco.id, id) : sql`true`));
      }
      const valores = { ...dados, cep: somenteDigitos(dados.cep), uf: dados.uf.toUpperCase(), padrao };
      if (id) {
        const [alterado] = await tx
          .update(endereco)
          .set({ ...valores, alteradoEm: this.relogio.agora() })
          .where(and(eq(endereco.id, id), eq(endereco.usuarioId, usuarioId)))
          .returning();
        if (!alterado) throw new NaoEncontrado('Endereço não encontrado.');
        return alterado;
      }
      const [novo] = await tx.insert(endereco).values({ ...valores, usuarioId }).returning();
      return novo;
    });
  }

  async excluirEndereco(usuarioId: number, id: number) {
    const [removido] = await this.db
      .delete(endereco)
      .where(and(eq(endereco.id, id), eq(endereco.usuarioId, usuarioId)))
      .returning();
    if (!removido) throw new NaoEncontrado('Endereço não encontrado.');
    if (removido.padrao) {
      const [outro] = await this.db.select().from(endereco).where(eq(endereco.usuarioId, usuarioId)).orderBy(desc(endereco.id)).limit(1);
      if (outro) await this.db.update(endereco).set({ padrao: true }).where(eq(endereco.id, outro.id));
    }
  }

  /* ---------------- LGPD (RNF07) ---------------- */

  async exportarDados(usuarioId: number) {
    const [u] = await this.db.select().from(usuario).where(eq(usuario.id, usuarioId));
    if (!u) throw new NaoEncontrado();
    const pedidos = await this.db.select().from(pedido).where(eq(pedido.usuarioId, usuarioId)).orderBy(desc(pedido.id));
    const itens = pedidos.length
      ? await this.db
          .select()
          .from(pedidoItem)
          .where(sql`${pedidoItem.pedidoId} IN (SELECT id FROM pedido WHERE usuario_id = ${usuarioId})`)
      : [];
    const pagamentos = pedidos.length
      ? await this.db
          .select({ pedidoId: pagamento.pedidoId, metodo: pagamento.metodo, status: pagamento.status, valor: pagamento.valor, criadoEm: pagamento.criadoEm, bandeira: pagamento.bandeira, ultimosDigitos: pagamento.ultimosDigitos })
          .from(pagamento)
          .where(sql`${pagamento.pedidoId} IN (SELECT id FROM pedido WHERE usuario_id = ${usuarioId})`)
      : [];
    return {
      geradoEm: this.relogio.agora(),
      conta: {
        nome: u.nome,
        email: u.email,
        cpf: u.cpf,
        telefone: u.telefone,
        criadoEm: u.criadoEm,
        aceitouTermosEm: u.aceitouTermosEm,
        ultimoLoginEm: u.ultimoLoginEm,
      },
      enderecos: await this.enderecos(usuarioId),
      pedidos: pedidos.map((p) => ({ ...p, itens: itens.filter((i) => i.pedidoId === p.id), pagamentos: pagamentos.filter((g) => g.pedidoId === p.id) })),
    };
  }

  /**
   * Exclusão a pedido do titular: anonimiza a conta e mantém os pedidos (obrigação fiscal).
   * Pedidos em andamento impedem a exclusão.
   */
  async anonimizar(usuarioId: number, senha: string) {
    const [u] = await this.db.select().from(usuario).where(eq(usuario.id, usuarioId));
    if (!u) throw new NaoEncontrado();
    if (!(await verificarSenha(senha, u.senhaHash))) throw new ErroNegocio('Senha incorreta.', HttpStatus.UNAUTHORIZED);
    const [emAndamento] = await this.db
      .select({ id: pedido.id })
      .from(pedido)
      .where(and(eq(pedido.usuarioId, usuarioId), sql`${pedido.status} IN (1, 2, 3, 4, 5)`))
      .limit(1);
    if (emAndamento) throw new ErroNegocio('Você tem pedidos em andamento. A conta pode ser excluída depois que eles forem concluídos ou cancelados.');
    await this.db.transaction(async (tx) => {
      await tx.delete(endereco).where(eq(endereco.usuarioId, usuarioId));
      await tx.delete(carrinho).where(eq(carrinho.usuarioId, usuarioId));
      await tx
        .update(usuario)
        .set({
          nome: 'Cliente removido',
          email: `removido-${usuarioId}@anonimo.invalid`,
          cpf: null,
          telefone: null,
          senhaHash: 'removido',
          anonimizado: true,
          emailConfirmado: false,
          carimboSeguranca: sql`gen_random_uuid()`,
          alteradoEm: this.relogio.agora(),
        })
        .where(eq(usuario.id, usuarioId));
    });
  }
}
