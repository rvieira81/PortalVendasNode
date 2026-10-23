import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { api, mensagemDeErro } from '../api/cliente';
import { StatusPedido, type Pagina, type Pedido } from '../api/tipos';
import { Alerta, Campo, Carregando, Paginacao, SeloStatus } from '../componentes/Basicos';
import { DetalhePedido } from '../paginas/Conta';
import { formatarDataHora, formatarMoeda } from '../util/formato';

interface LinhaPedido {
  id: number;
  status: StatusPedido;
  statusDescricao: string;
  total: number;
  criadoEm: string;
  cliente: string;
  email: string;
  cidade: string;
  uf: string;
}

const STATUS = [
  [1, 'Aguardando pagamento'],
  [2, 'Pagamento em análise'],
  [3, 'Pago'],
  [4, 'Em separação'],
  [5, 'Enviado'],
  [6, 'Entregue'],
  [9, 'Cancelado'],
] as const;

export function PedidosAdmin() {
  const [params, setParams] = useSearchParams();
  const consulta = new URLSearchParams(params);
  if (!consulta.get('pagina')) consulta.set('pagina', '1');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-pedidos', consulta.toString()],
    queryFn: () => api<Pagina<LinhaPedido>>(`/admin/pedidos?${consulta}`),
    placeholderData: (a) => a,
  });
  const mudar = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    if (k !== 'pagina') n.delete('pagina');
    setParams(n);
  };
  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Pedidos</h1>
        <div className="filtros">
          <label className="sr-only" htmlFor="f-status">Status</label>
          <select id="f-status" value={params.get('status') ?? ''} onChange={(e) => mudar('status', e.target.value)}>
            <option value="">Todos os status</option>
            {STATUS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          <label className="sr-only" htmlFor="f-de">De</label>
          <input id="f-de" type="date" value={params.get('de') ?? ''} onChange={(e) => mudar('de', e.target.value)} />
          <label className="sr-only" htmlFor="f-ate">Até</label>
          <input id="f-ate" type="date" value={params.get('ate') ?? ''} onChange={(e) => mudar('ate', e.target.value)} />
          <label className="sr-only" htmlFor="f-busca">Buscar</label>
          <input id="f-busca" type="search" placeholder="Nº ou e-mail" defaultValue={params.get('busca') ?? ''} onKeyDown={(e) => e.key === 'Enter' && mudar('busca', e.currentTarget.value)} />
        </div>
      </div>
      {isLoading || !data ? <Carregando /> : (
        <div className="painel tabela-rolagem">
          <table className="tabela">
            <thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Destino</th><th>Status</th><th className="num">Total</th></tr></thead>
            <tbody>
              {data.itens.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/admin/pedidos/${p.id}`}>#{p.id}</Link></td>
                  <td>{formatarDataHora(p.criadoEm)}</td>
                  <td>{p.cliente}<div className="suave pequeno">{p.email}</div></td>
                  <td>{p.cidade}/{p.uf}</td>
                  <td><SeloStatus status={p.status} texto={p.statusDescricao} /></td>
                  <td className="num">{formatarMoeda(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.itens.length ? <p className="suave centro">Nenhum pedido encontrado.</p> : null}
          <Paginacao pagina={data.pagina} paginas={data.paginas} aoMudar={(n) => mudar('pagina', String(n))} />
        </div>
      )}
    </>
  );
}

export function PedidoAdmin() {
  const { id } = useParams();
  const cliente = useQueryClient();
  const chave = ['admin-pedido', id];
  const pedido = useQuery({ queryKey: chave, queryFn: () => api<Pedido>(`/admin/pedidos/${id}`) });
  const [rastreio, setRastreio] = useState('');
  const [motivo, setMotivo] = useState('');
  const atualizar = (p: Pedido) => cliente.setQueryData(chave, p);
  const status = useMutation({
    mutationFn: (s: StatusPedido) => api<Pedido>(`/admin/pedidos/${id}/status`, 'POST', { status: s, codigoRastreio: rastreio || undefined }),
    onSuccess: atualizar,
  });
  const cancelar = useMutation({ mutationFn: () => api<Pedido>(`/admin/pedidos/${id}/cancelar`, 'POST', { motivo }), onSuccess: atualizar });

  if (pedido.isLoading) return <Carregando />;
  if (!pedido.data) return <Alerta tipo="erro">{mensagemDeErro(pedido.error)}</Alerta>;
  const p = pedido.data;
  const erro = status.error ?? cancelar.error;
  return (
    <>
      <p><Link to="/admin/pedidos">‹ Pedidos</Link></p>
      {p.cliente ? <p className="suave">Cliente: <strong>{p.cliente.nome}</strong> · {p.cliente.email}</p> : null}
      {erro ? <Alerta tipo="erro">{mensagemDeErro(erro)}</Alerta> : null}
      <section className="painel" aria-label="Ações do pedido">
        <h2>Andamento</h2>
        <div className="acoes" style={{ marginTop: 0 }}>
          {p.status === StatusPedido.Pago ? (
            <button type="button" className="btn btn-primario" onClick={() => status.mutate(StatusPedido.EmSeparacao)}>Marcar em separação</button>
          ) : null}
          {p.status === StatusPedido.EmSeparacao ? (
            <>
              <label className="sr-only" htmlFor="rastreio">Código de rastreio</label>
              <input id="rastreio" type="text" placeholder="Código de rastreio" value={rastreio} onChange={(e) => setRastreio(e.target.value)} style={{ maxWidth: 240 }} />
              <button type="button" className="btn btn-primario" disabled={!rastreio} onClick={() => status.mutate(StatusPedido.Enviado)}>Marcar como enviado</button>
            </>
          ) : null}
          {p.status === StatusPedido.Enviado ? (
            <button type="button" className="btn btn-primario" onClick={() => status.mutate(StatusPedido.Entregue)}>Marcar como entregue</button>
          ) : null}
          {[1, 2, 3, 4].includes(p.status) ? null : <span className="suave">Nenhuma ação disponível para este status.</span>}
        </div>
        {[1, 2, 3, 4].includes(p.status) ? (
          <details style={{ marginTop: '1rem' }}>
            <summary>Cancelar pedido</summary>
            <Campo rotulo="Motivo (aparece para o cliente)" nome="motivo">
              <input id="motivo" type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
            </Campo>
            <button type="button" className="btn btn-perigo" disabled={!motivo || cancelar.isPending} onClick={() => cancelar.mutate()}>
              Cancelar e estornar
            </button>
          </details>
        ) : null}
      </section>
      <DetalhePedido pedido={p} />
    </>
  );
}
