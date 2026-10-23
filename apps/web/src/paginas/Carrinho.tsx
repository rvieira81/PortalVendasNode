import { Link, useNavigate } from 'react-router';
import { mensagemDeErro } from '../api/cliente';
import { useAlterarCarrinho, useCarrinho, useSessao } from '../api/consultas';
import { Alerta, Carregando, Etapas, Quantidade } from '../componentes/Basicos';
import { formatarMoeda } from '../util/formato';

export function Carrinho() {
  const { data: carrinho, isLoading } = useCarrinho();
  const { data: usuario } = useSessao();
  const { alterar, remover } = useAlterarCarrinho();
  const navegar = useNavigate();

  if (isLoading || !carrinho) return <Carregando />;
  if (!carrinho.itens.length) {
    return (
      <div className="vazio painel">
        <h1>Seu carrinho está vazio</h1>
        <p>Que tal dar uma olhada nas ofertas?</p>
        <Link to="/" className="btn btn-comprar">
          Ver produtos
        </Link>
      </div>
    );
  }

  const ocupado = alterar.isPending || remover.isPending;
  const erro = alterar.error ?? remover.error;
  const aviso = alterar.data?.aviso;

  return (
    <>
      <Etapas atual={1} />
      <h1>Carrinho</h1>
      <div className="duas-colunas">
        <section className="painel" aria-label="Itens do carrinho">
          {carrinho.avisos.map((a) => (
            <Alerta key={a} tipo="aviso">
              {a}
            </Alerta>
          ))}
          {aviso ? <Alerta tipo="aviso">{aviso}</Alerta> : null}
          {erro ? <Alerta tipo="erro">{mensagemDeErro(erro)}</Alerta> : null}
          <ul className="lista-itens">
            {carrinho.itens.map((item) => (
              <li key={item.produtoId}>
                <div className="mini">{item.imagem ? <img src={item.imagem} alt="" /> : null}</div>
                <div>
                  <Link to={`/produto/${item.slug}`} className="nome">
                    {item.nome}
                  </Link>
                  <div className="suave pequeno">{formatarMoeda(item.precoUnitario)} cada</div>
                  {item.problemas.map((p) => (
                    <div key={p} className="problema">
                      {p}
                    </div>
                  ))}
                  <div className="controles">
                    <Quantidade
                      valor={item.quantidade}
                      maximo={Math.max(item.maximo, 1)}
                      desabilitado={ocupado}
                      aoMudar={(q) => alterar.mutate({ produtoId: item.produtoId, quantidade: q })}
                    />
                    <button type="button" className="btn-link" disabled={ocupado} onClick={() => remover.mutate(item.produtoId)}>
                      Remover
                    </button>
                  </div>
                </div>
                <div className="valor">{formatarMoeda(item.total)}</div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="painel resumo lateral-fixa" aria-label="Resumo">
          <h2>Resumo</h2>
          <dl>
            <dt>Subtotal ({carrinho.quantidadeItens} itens)</dt>
            <dd>{formatarMoeda(carrinho.subtotal)}</dd>
            <dt>Frete</dt>
            <dd className="suave">calculado na entrega</dd>
          </dl>
          <button
            type="button"
            className="btn btn-comprar btn-grande btn-bloco"
            disabled={!carrinho.podeFinalizar}
            onClick={() => navegar(usuario ? '/checkout' : '/conta/entrar?voltar=/checkout')}
          >
            Continuar
          </button>
          {!carrinho.podeFinalizar ? <p className="problema">Ajuste os itens indicados para continuar.</p> : null}
          <p className="suave pequeno centro">
            <Link to="/">Continuar comprando</Link>
          </p>
        </aside>
      </div>
    </>
  );
}
