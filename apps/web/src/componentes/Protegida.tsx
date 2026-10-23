import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSessao } from '../api/consultas';
import { Carregando } from './Basicos';

/** Exige login (e, para o painel, administrador com 2FA concluído). O servidor confere de novo. */
export function Protegida({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { data: usuario, isLoading } = useSessao();
  const local = useLocation();
  if (isLoading) return <Carregando />;
  if (!usuario) return <Navigate to={`/conta/entrar?voltar=${encodeURIComponent(local.pathname + local.search)}`} replace />;
  if (usuario.admin && usuario.pendente2fa) return <Navigate to="/conta/verificacao" replace />;
  if (admin && !usuario.admin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
