import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { api, mensagemDeErro } from '../api/cliente';
import { useSessao } from '../api/consultas';
import { StatusPedido, type DadosEndereco, type Endereco, type Pedido, type PedidoResumo } from '../api/tipos';
import { Alerta, Campo, Carregando, SeloStatus } from '../componentes/Basicos';
import { EnderecoForm } from '../componentes/EnderecoForm';
import { formatarData, formatarDataHora, formatarMoeda, mascaraCep } from '../util/formato';

interface Perfil {
  nome: string;
  email: string;
  emailConfirmado: boolean;
  cpf: string | null;
  telefone: string | null;
  criadoEm: string;
}

export function MinhaConta() {
  const local = useLocation();
  const { data: usuario } = useSessao();
  const perfil = useQuery({ queryKey: ['perfil'], queryFn: () => api<Perfil>('/conta') });
  const reenviar = useMutation({ mutationFn: () => api<{ mensagem: string }>('/auth/reenviar-confirmacao', 'POST') });
  const mensagem = (local.state as { mensagem?: string } | null)?.mensagem;

  if (perfil.isLoading) return <Carregando />;
  const p = perfil.data;
  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Minha conta</h1>
          <p>Olá, {usuario?.nome}</p>
        </div>
        <Link to="/conta/pedidos" className="btn btn-primario">
          Meus pedidos
        </Link>
      </div>
      {mensagem ? <Alerta tipo="sucesso">{mensagem}</Alerta> : null}
      {p && !p.emailConfirmado ? (
        <Alerta tipo="aviso">
          Seu e-mail ainda não foi confirmado.{' '}
          <button type="button" className="btn-link" onClick={() => reenviar.mutate()} disabled={reenviar.isPending}>
            Reenviar link
          </button>
          {reenviar.data ? ` ${reenviar.data.mensagem}` : null}
        </Alerta>
      ) : null}
      {p ? (
        <section className="painel">
          <h2>Dados pessoais</h2>
          <table className="ficha">
            <tbody>
              <tr><td>Nome</td><td>{p.nome}</td></tr>
              <tr><td>E-mail</td><td>{p.email}</td></tr>
              <tr><td>CPF</td><td>{p.cpf ?? '—'}</td></tr>
              <tr><td>Telefone</td><td>{p.telefone ?? '—'}</td></tr>
              <tr><td>Cliente desde</td><td>{formatarData(p.criadoEm)}</td></tr>
            </tbody>
          </table>
        </section>
      ) : null}
      <Enderecos />
      <Privacidade />
    </>
  );
}

function Enderecos() {
  const cliente = useQueryClient();
  const lista = useQuery({ queryKey: ['enderecos'], queryFn: () => api<Endereco[]>('/conta/enderecos') });
  const [editando, setEditando] = useState<Endereco | 'novo' | null>(null);
  const excluir = useMutation({
    mutationFn: (id: number) => api(`/conta/enderecos/${id}`, 'DELETE'),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['enderecos'] }),
  });

  async function salvar(d: DadosEndereco) {
    if (editando && editando !== 'novo') await api(`/conta/enderecos/${editando.id}`, 'PUT', d);
    else await api('/conta/enderecos', 'POST', d);
    await cliente.invalidateQueries({ queryKey: ['enderecos'] });
    setEditando(null);
  }

  return (
    <section className="painel">
      <div className="cabecalho-pagina" style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Endereços</h2>
        {!editando ? (
          <button type="button" className="btn btn-contorno btn-pequeno" onClick={() => setEditando('novo')}>
            + Novo endereço
          </button>
        ) : null}
      </div>
      {editando ? (
        <EnderecoForm inicial={editando === 'novo' ? undefined : editando} aoSalvar={salvar} aoCancelar={() => setEditando(null)} />
      ) : lista.data?.length ? (
        <div className="enderecos">
          {lista.data.map((e) => (
            <div key={e.id} className="endereco-card">
              <p>
                <strong>{e.apelido}</strong> {e.padrao ? <span className="selo">Padrão</span> : null}
              </p>
              <p>{e.destinatario}</p>
              <p className="suave pequeno">
                {e.logradouro}, {e.numero}
                {e.complemento ? ` – ${e.complemento}` : ''}
                <br />
                {e.bairro} · {e.cidade}/{e.uf} · {mascaraCep(e.cep)}
              </p>
              <div className="acoes" style={{ marginTop: '0.5rem' }}>
                <button type="button" className="btn-link" onClick={() => setEditando(e)}>
                  Editar
                </button>
                <button type="button" className="btn-link" onClick={() => window.confirm('Excluir este endereço?') && excluir.mutate(e.id)}>
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="suave">Nenhum endereço cadastrado.</p>
      )}
    </section>
  );
}

/** LGPD (RNF07): baixar os dados e excluir a conta. */
function Privacidade() {
  const cliente = useQueryClient();
  const navegar = useNavigate();
  const [senha, setSenha] = useState('');
  const [aberto, setAberto] = useState(false);
  const excluir = useMutation({
    mutationFn: () => api<{ mensagem: string }>('/conta/excluir', 'POST', { senha }),
    onSuccess: (r) => {
      cliente.clear();
      navegar('/', { replace: true, state: { mensagem: r.mensagem } });
    },
  });
  return (
    <section className="painel">
      <h2>Privacidade e dados</h2>
      <p className="suave">Você pode baixar uma cópia dos seus dados ou excluir a conta. Os pedidos ficam guardados apenas pelo prazo exigido pela legislação fiscal.</p>
      <div className="acoes">
        <a className="btn btn-contorno" href="/api/conta/dados" download="meus-dados.json">
          Baixar meus dados
        </a>
        <button type="button" className="btn btn-perigo" onClick={() => setAberto(!aberto)}>
          Excluir minha conta
        </button>
      </div>
      {aberto ? (
        <form
          style={{ marginTop: '1rem', maxWidth: 380 }}
          onSubmit={(e) => {
            e.preventDefault();
            excluir.mutate();
          }}
        >
          <Alerta tipo="erro">{excluir.error ? mensagemDeErro(excluir.error) : ''}</Alerta>
          <Campo rotulo="Confirme com sua senha" nome="senha-exclusao">
            <input id="senha-exclusao" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </Campo>
          <button type="submit" className="btn btn-perigo" disabled={excluir.isPending}>
            Excluir definitivamente
          </button>
        </form>
      ) : null}
    </section>
  );
}

export function MeusPedidos() {
  const pedidos = useQuery({ queryKey: ['pedidos'], queryFn: () => api<PedidoResumo[]>('/pedidos') });
  if (pedidos.isLoading) return <Carregando />;
  return (
    <>
      <h1>Meus pedidos</h1>
      {!pedidos.data?.length ? (
        <div className="vazio painel">
          <p>Você ainda não fez nenhum pedido.</p>
          <Link to="/" className="btn btn-comprar">
            Ver produtos
          </Link>
        </div>
      ) : (
        <div className="painel tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Data</th>
                <th>Itens</th>
                <th>Status</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.data.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/conta/pedidos/${p.id}`}>#{p.id}</Link>
                  </td>
                  <td>{formatarData(p.criadoEm)}</td>
                  <td>{p.itens}</td>
                  <td>
                    <SeloStatus status={p.status} texto={p.statusDescricao} />
                  </td>
                  <td className="num">{formatarMoeda(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function PedidoDetalhe() {
  const { id } = useParams();
  const cliente = useQueryClient();
  const pedido = useQuery({ queryKey: ['pedido', id], queryFn: () => api<Pedido>(`/pedidos/${id}`) });
  const cancelar = useMutation({
    mutationFn: () => api<Pedido>(`/pedidos/${id}/cancelar`, 'POST'),
    onSuccess: (p) => cliente.setQueryData(['pedido', id], p),
  });
  if (pedido.isLoading) return <Carregando />;
  if (!pedido.data) return <Alerta tipo="erro">{mensagemDeErro(pedido.error)}</Alerta>;
  return <DetalhePedido pedido={pedido.data} acoes={
    <>
      {pedido.data.podePagar ? (
        <Link to={`/pedidos/${pedido.data.id}/pagamento`} className="btn btn-comprar">
          {pedido.data.pagamento ? 'Ver pagamento' : 'Pagar agora'}
        </Link>
      ) : null}
      {pedido.data.podeCancelar ? (
        <button
          type="button"
          className="btn btn-perigo"
          disabled={cancelar.isPending}
          onClick={() => window.confirm('Cancelar este pedido? Se já foi pago, o estorno será solicitado.') && cancelar.mutate()}
        >
          Cancelar pedido
        </button>
      ) : null}
      {cancelar.error ? <Alerta tipo="erro">{mensagemDeErro(cancelar.error)}</Alerta> : null}
    </>
  } />;
}

/** Detalhe compartilhado entre o cliente e o painel administrativo. */
export function DetalhePedido({ pedido: p, acoes }: { pedido: Pedido; acoes?: React.ReactNode }) {
  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Pedido #{p.id}</h1>
          <p>
            Feito em {formatarDataHora(p.criadoEm)} · <SeloStatus status={p.status} texto={p.statusDescricao} />
          </p>
        </div>
        <div className="acoes" style={{ marginTop: 0 }}>{acoes}</div>
      </div>
      {p.status === StatusPedido.Cancelado && p.motivoCancelamento ? <Alerta tipo="aviso">Cancelado: {p.motivoCancelamento}</Alerta> : null}
      <div className="duas-colunas">
        <div>
          <section className="painel">
            <h2>Itens</h2>
            <ul className="lista-itens">
              {p.itens.map((i) => (
                <li key={i.produtoId}>
                  <div className="mini">{i.imagem ? <img src={i.imagem} alt="" /> : null}</div>
                  <div>
                    <span className="nome">{i.nome}</span>
                    <div className="suave pequeno">
                      {i.quantidade} × {formatarMoeda(i.precoUnitario)} · {i.sku}
                    </div>
                  </div>
                  <div className="valor">{formatarMoeda(i.total)}</div>
                </li>
              ))}
            </ul>
          </section>
          <section className="painel">
            <h2>Acompanhamento</h2>
            <ol className="linha-tempo">
              {p.historico.map((h, i) => (
                <li key={i}>
                  <strong>{h.descricao}</strong> <span className="suave pequeno">{formatarDataHora(h.criadoEm)}</span>
                  {h.observacao ? <div className="suave pequeno">{h.observacao}</div> : null}
                  {h.autor ? <div className="suave pequeno">por {h.autor}</div> : null}
                </li>
              ))}
            </ol>
            {p.codigoRastreio ? (
              <p>
                Código de rastreio: <strong>{p.codigoRastreio}</strong>
              </p>
            ) : null}
          </section>
        </div>
        <aside className="painel resumo">
          <h2>Resumo</h2>
          <dl>
            <dt>Produtos</dt>
            <dd>{formatarMoeda(p.subtotal)}</dd>
            <dt>Frete</dt>
            <dd>{p.frete === 0 ? 'Grátis' : formatarMoeda(p.frete)}</dd>
            {p.desconto ? (
              <>
                <dt>Desconto</dt>
                <dd>−{formatarMoeda(p.desconto)}</dd>
              </>
            ) : null}
            <dt className="total">Total</dt>
            <dd className="total">{formatarMoeda(p.total)}</dd>
          </dl>
          <h3>Entrega</h3>
          <p className="pequeno">
            {p.entrega.destinatario}
            <br />
            {p.entrega.logradouro}, {p.entrega.numero}
            {p.entrega.complemento ? ` – ${p.entrega.complemento}` : ''}
            <br />
            {p.entrega.bairro} · {p.entrega.cidade}/{p.entrega.uf} · {mascaraCep(p.entrega.cep)}
            <br />
            {p.freteDescricao} · até {p.fretePrazoDias} dias úteis
          </p>
          {p.pagamento ? (
            <>
              <h3>Pagamento</h3>
              <p className="pequeno">
                {p.pagamento.metodo === 1 ? 'Pix' : p.pagamento.metodo === 2 ? `Cartão ${p.pagamento.bandeira ?? ''} final ${p.pagamento.ultimosDigitos ?? '—'} em ${p.pagamento.parcelas ?? 1}x` : 'Boleto'}
              </p>
            </>
          ) : null}
        </aside>
      </div>
    </>
  );
}
