import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { Carregando } from './componentes/Basicos';
import { Layout } from './componentes/Layout';
import { Protegida } from './componentes/Protegida';
import { Cadastro, ConfirmarEmail, Entrar, EsqueciSenha, RedefinirSenha, Verificacao2fa } from './paginas/Acesso';
import { Carrinho } from './paginas/Carrinho';
import { Checkout } from './paginas/Checkout';
import { MeusPedidos, MinhaConta, PedidoDetalhe } from './paginas/Conta';
import { Privacidade, Termos } from './paginas/Legal';
import { NaoEncontrado } from './paginas/NaoEncontrado';
import { Produto } from './paginas/Produto';
import { Vitrine } from './paginas/Vitrine';

// Pagamento (SDK do Mercado Pago) e painel administrativo carregam sob demanda
const Pagamento = lazy(() => import('./paginas/Pagamento').then((m) => ({ default: m.Pagamento })));
const AdminLayout = lazy(() => import('./admin/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const Painel = lazy(() => import('./admin/Painel').then((m) => ({ default: m.Painel })));
const PedidosAdmin = lazy(() => import('./admin/Pedidos').then((m) => ({ default: m.PedidosAdmin })));
const PedidoAdmin = lazy(() => import('./admin/Pedidos').then((m) => ({ default: m.PedidoAdmin })));
const ProdutosAdmin = lazy(() => import('./admin/Produtos').then((m) => ({ default: m.ProdutosAdmin })));
const ProdutoFormAdmin = lazy(() => import('./admin/Produtos').then((m) => ({ default: m.ProdutoFormAdmin })));
const CategoriasAdmin = lazy(() => import('./admin/Categorias').then((m) => ({ default: m.CategoriasAdmin })));
const ConfiguracoesAdmin = lazy(() => import('./admin/Configuracoes').then((m) => ({ default: m.ConfiguracoesAdmin })));

const sob = (el: ReactNode) => <Suspense fallback={<Carregando />}>{el}</Suspense>;
const logado = (el: ReactNode) => <Protegida>{el}</Protegida>;

export const rotas = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Vitrine /> },
      { path: '/categoria/:slug', element: <Vitrine /> },
      { path: '/produto/:slug', element: <Produto /> },
      { path: '/carrinho', element: <Carrinho /> },
      { path: '/checkout', element: logado(<Checkout />) },
      { path: '/pedidos/:id/pagamento', element: logado(sob(<Pagamento />)) },
      { path: '/conta/entrar', element: <Entrar /> },
      { path: '/conta/cadastro', element: <Cadastro /> },
      { path: '/conta/confirmar-email', element: <ConfirmarEmail /> },
      { path: '/conta/esqueci-senha', element: <EsqueciSenha /> },
      { path: '/conta/redefinir-senha', element: <RedefinirSenha /> },
      { path: '/conta/verificacao', element: <Verificacao2fa /> },
      { path: '/conta', element: logado(<MinhaConta />) },
      { path: '/conta/pedidos', element: logado(<MeusPedidos />) },
      { path: '/conta/pedidos/:id', element: logado(<PedidoDetalhe />) },
      { path: '/termos', element: <Termos /> },
      { path: '/privacidade', element: <Privacidade /> },
      { path: '*', element: <NaoEncontrado /> },
    ],
  },
  {
    path: '/admin',
    element: <Protegida admin>{sob(<AdminLayout />)}</Protegida>,
    children: [
      { index: true, element: sob(<Painel />) },
      { path: 'pedidos', element: sob(<PedidosAdmin />) },
      { path: 'pedidos/:id', element: sob(<PedidoAdmin />) },
      { path: 'produtos', element: sob(<ProdutosAdmin />) },
      { path: 'produtos/:id', element: sob(<ProdutoFormAdmin />) },
      { path: 'categorias', element: sob(<CategoriasAdmin />) },
      { path: 'configuracoes', element: sob(<ConfiguracoesAdmin />) },
    ],
  },
]);
