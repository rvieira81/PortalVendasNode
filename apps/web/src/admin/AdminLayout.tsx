import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useSair, useSessao } from '../api/consultas';

export function AdminLayout() {
  const { data: usuario } = useSessao();
  const sair = useSair();
  const navegar = useNavigate();
  return (
    <div className="admin">
      <aside className="admin-menu">
        <Link to="/" className="marca">
          <img src="/favicon.svg" alt="" width={30} height={30} />
          Painel da loja
        </Link>
        <nav aria-label="Administração">
          <NavLink to="/admin" end>
            Visão geral
          </NavLink>
          <NavLink to="/admin/pedidos">Pedidos</NavLink>
          <NavLink to="/admin/produtos">Produtos</NavLink>
          <NavLink to="/admin/categorias">Categorias</NavLink>
          <NavLink to="/admin/configuracoes">Frete e pagamento</NavLink>
        </nav>
        <p className="pequeno" style={{ marginTop: '2rem', color: '#bcd3cf' }}>
          {usuario?.email}
          <br />
          <button type="button" className="btn-link" style={{ color: '#fff', paddingLeft: 0 }} onClick={() => sair.mutate(undefined, { onSuccess: () => navegar('/') })}>
            Sair
          </button>
        </p>
      </aside>
      <main id="conteudo" className="admin-conteudo">
        <Outlet />
      </main>
    </div>
  );
}
