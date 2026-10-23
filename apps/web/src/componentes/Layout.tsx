import { useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useCarrinho, useCategorias, useSair, useSessao } from '../api/consultas';

export function Layout() {
  const { data: usuario } = useSessao();
  const { data: carrinho } = useCarrinho();
  const { data: categorias } = useCategorias();
  const sair = useSair();
  const navegar = useNavigate();
  const local = useLocation();
  const [parametros] = useSearchParams();
  const [termo, setTermo] = useState(parametros.get('busca') ?? '');
  const categoriaAtual = local.pathname.startsWith('/categoria/') ? local.pathname.split('/')[2] : null;

  function buscar(e: FormEvent) {
    e.preventDefault();
    navegar(termo.trim() ? `/?busca=${encodeURIComponent(termo.trim())}` : '/');
  }

  return (
    <>
      <a href="#conteudo" className="pular">
        Pular para o conteúdo
      </a>
      <header className="topo">
        <div className="container topo-linha">
          <Link to="/" className="marca">
            <img src="/favicon.svg" alt="" width={34} height={34} />
            Portal de Vendas
          </Link>
          <form className="busca" role="search" onSubmit={buscar}>
            <label htmlFor="busca" className="sr-only">
              Buscar produtos
            </label>
            <input id="busca" type="search" placeholder="O que você procura?" value={termo} onChange={(e) => setTermo(e.target.value)} maxLength={100} />
            <button type="submit">Buscar</button>
          </form>
          <nav className="topo-nav" aria-label="Conta">
            {usuario ? (
              <>
                {usuario.admin ? <Link to="/admin">Painel</Link> : <Link to="/conta">Olá, {usuario.nome.split(' ')[0]}</Link>}
                <button type="button" onClick={() => sair.mutate(undefined, { onSuccess: () => navegar('/') })}>
                  Sair
                </button>
              </>
            ) : (
              <Link to="/conta/entrar">Entrar</Link>
            )}
            <Link to="/carrinho" className="carrinho-botao" aria-label={`Carrinho com ${carrinho?.quantidadeItens ?? 0} itens`}>
              Carrinho<span className="contador">{carrinho?.quantidadeItens ?? 0}</span>
            </Link>
          </nav>
        </div>
        {categorias?.length ? (
          <div className="categorias-faixa">
            <nav className="container" aria-label="Categorias">
              <NavLink to="/" end className={() => (!categoriaAtual && local.pathname === '/' ? 'ativo' : '')}>
                Tudo
              </NavLink>
              {categorias.map((c) => (
                <NavLink key={c.id} to={`/categoria/${c.slug}`} className={() => (categoriaAtual === c.slug ? 'ativo' : '')}>
                  {c.nome}
                </NavLink>
              ))}
            </nav>
          </div>
        ) : null}
      </header>
      <main id="conteudo" className="conteudo">
        <div className="container">
          <Outlet />
        </div>
      </main>
      <footer className="rodape">
        <div className="container">
          <div>
            <strong>Portal de Vendas</strong>
            <br />
            Pague com Pix, cartão em até 12x ou boleto. Entrega para todo o Brasil.
          </div>
          <nav aria-label="Institucional">
            <Link to="/termos">Termos de uso</Link>
            <Link to="/privacidade">Política de privacidade</Link>
            <Link to="/conta/pedidos">Meus pedidos</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
