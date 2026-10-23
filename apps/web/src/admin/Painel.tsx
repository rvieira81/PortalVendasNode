import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/cliente';
import { Carregando } from '../componentes/Basicos';
import { formatarMoeda } from '../util/formato';

interface DadosPainel {
  faturamento: number;
  pedidos: number;
  ticketMedio: number;
  porStatus: { status: number; quantidade: number; descricao: string }[];
  maisVendidos: { produtoId: number; nome: string; quantidade: number; receita: number }[];
}

const hoje = () => new Date().toISOString().slice(0, 10);
const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export function Painel() {
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(hoje());
  const { data, isLoading } = useQuery({ queryKey: ['painel', de, ate], queryFn: () => api<DadosPainel>(`/admin/painel?de=${de}&ate=${ate}`) });
  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Visão geral</h1>
        <div className="filtros">
          <label className="sr-only" htmlFor="de">De</label>
          <input id="de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          <label className="sr-only" htmlFor="ate">Até</label>
          <input id="ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </div>
      {isLoading || !data ? (
        <Carregando />
      ) : (
        <>
          <div className="cards-numeros">
            <div className="numero"><span>Faturamento</span><strong>{formatarMoeda(data.faturamento)}</strong></div>
            <div className="numero"><span>Pedidos pagos</span><strong>{data.pedidos}</strong></div>
            <div className="numero"><span>Ticket médio</span><strong>{formatarMoeda(data.ticketMedio)}</strong></div>
          </div>
          <div className="duas-colunas">
            <section className="painel tabela-rolagem">
              <h2>Mais vendidos</h2>
              {data.maisVendidos.length ? (
                <table className="tabela">
                  <thead><tr><th>Produto</th><th className="num">Qtd.</th><th className="num">Receita</th></tr></thead>
                  <tbody>
                    {data.maisVendidos.map((m) => (
                      <tr key={m.produtoId}><td>{m.nome}</td><td className="num">{m.quantidade}</td><td className="num">{formatarMoeda(m.receita)}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="suave">Nenhuma venda no período.</p>}
            </section>
            <section className="painel">
              <h2>Pedidos por status</h2>
              {data.porStatus.length ? (
                <table className="tabela">
                  <tbody>
                    {data.porStatus.map((s) => (
                      <tr key={s.status}><td>{s.descricao}</td><td className="num">{s.quantidade}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="suave">Sem pedidos no período.</p>}
            </section>
          </div>
        </>
      )}
    </>
  );
}
