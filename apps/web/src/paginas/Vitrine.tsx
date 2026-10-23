import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router';
import { api, mensagemDeErro } from '../api/cliente';
import { useCategorias } from '../api/consultas';
import type { Pagina, ProdutoResumo } from '../api/tipos';
import { Alerta, Carregando, Paginacao } from '../componentes/Basicos';
import { CardProduto } from '../componentes/CardProduto';
import { plural } from '../util/formato';

export function Vitrine() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const { data: categorias } = useCategorias();
  const busca = params.get('busca') ?? '';
  const ordem = params.get('ordem') ?? 'recentes';
  const pagina = Number(params.get('pagina') ?? 1);
  const precoMax = params.get('precoMax') ?? '';

  const consulta = new URLSearchParams();
  if (busca) consulta.set('busca', busca);
  if (slug) consulta.set('categoria', slug);
  if (ordem) consulta.set('ordem', ordem);
  if (precoMax) consulta.set('precoMax', precoMax);
  consulta.set('pagina', String(pagina));

  const { data, isLoading, error } = useQuery({
    queryKey: ['vitrine', consulta.toString()],
    queryFn: () => api<Pagina<ProdutoResumo>>(`/produtos?${consulta}`),
    placeholderData: (anterior) => anterior,
  });

  const mudar = (chave: string, valor: string) => {
    const novo = new URLSearchParams(params);
    if (valor) novo.set(chave, valor);
    else novo.delete(chave);
    if (chave !== 'pagina') novo.delete('pagina');
    setParams(novo);
  };

  const categoria = categorias?.find((c) => c.slug === slug);
  const titulo = busca ? `Resultados para "${busca}"` : categoria ? categoria.nome : 'Ofertas da semana';

  return (
    <>
      {!busca && !slug && pagina === 1 ? (
        <section className="destaque" aria-label="Boas-vindas">
          <h1>Tudo o que você precisa, entregue na sua porta</h1>
          <p>Eletrônicos, casa, esporte e papelaria com preço justo e frete calculado na hora para o seu CEP.</p>
          <div className="vantagens">
            <span>Pix com aprovação na hora</span>
            <span>Cartão em até 12x</span>
            <span>Compra segura</span>
          </div>
        </section>
      ) : null}

      <div className="vitrine-topo">
        <div>
          <h2 style={{ margin: 0 }}>{titulo}</h2>
          {data ? <span className="suave pequeno">{plural(data.total, 'produto')}</span> : null}
        </div>
        <div className="filtros">
          <label className="sr-only" htmlFor="ordem">
            Ordenar por
          </label>
          <select id="ordem" value={ordem} onChange={(e) => mudar('ordem', e.target.value)}>
            <option value="recentes">Mais recentes</option>
            <option value="menor-preco">Menor preço</option>
            <option value="maior-preco">Maior preço</option>
            <option value="nome">Nome (A–Z)</option>
          </select>
          <label className="sr-only" htmlFor="precoMax">
            Preço até
          </label>
          <select id="precoMax" value={precoMax} onChange={(e) => mudar('precoMax', e.target.value)}>
            <option value="">Qualquer preço</option>
            <option value="50">Até R$ 50</option>
            <option value="100">Até R$ 100</option>
            <option value="200">Até R$ 200</option>
            <option value="500">Até R$ 500</option>
          </select>
        </div>
      </div>

      {error ? <Alerta tipo="erro">{mensagemDeErro(error)}</Alerta> : null}
      {isLoading ? <Carregando /> : null}
      {data && data.itens.length === 0 ? (
        <div className="vazio painel">
          <h3>Nada encontrado</h3>
          <p>Tente outro termo ou remova os filtros.</p>
        </div>
      ) : null}
      {data ? (
        <>
          <div className="grade-produtos">
            {data.itens.map((p) => (
              <CardProduto key={p.id} produto={p} />
            ))}
          </div>
          <Paginacao
            pagina={data.pagina}
            paginas={data.paginas}
            aoMudar={(p) => {
              mudar('pagina', String(p));
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      ) : null}
    </>
  );
}
