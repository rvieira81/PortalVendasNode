import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './cliente';
import type { Carrinho, Categoria, UsuarioSessao } from './tipos';

export const chaves = {
  sessao: ['sessao'] as const,
  carrinho: ['carrinho'] as const,
  categorias: ['categorias'] as const,
};

export function useSessao() {
  return useQuery({
    queryKey: chaves.sessao,
    queryFn: () => api<{ usuario: UsuarioSessao | null }>('/auth/sessao').then((r) => r.usuario),
    staleTime: 60_000,
  });
}

export function useCategorias() {
  return useQuery({ queryKey: chaves.categorias, queryFn: () => api<Categoria[]>('/categorias'), staleTime: 5 * 60_000 });
}

export function useCarrinho() {
  return useQuery({ queryKey: chaves.carrinho, queryFn: () => api<Carrinho>('/carrinho') });
}

/** Adicionar, alterar e remover itens: a resposta já é o carrinho atualizado. */
export function useAlterarCarrinho() {
  const cliente = useQueryClient();
  const aplicar = (c: Carrinho) => cliente.setQueryData(chaves.carrinho, c);
  return {
    adicionar: useMutation({
      mutationFn: (d: { produtoId: number; quantidade: number }) => api<Carrinho>('/carrinho/itens', 'POST', d),
      onSuccess: aplicar,
    }),
    alterar: useMutation({
      mutationFn: (d: { produtoId: number; quantidade: number }) => api<Carrinho>(`/carrinho/itens/${d.produtoId}`, 'PATCH', { quantidade: d.quantidade }),
      onSuccess: aplicar,
    }),
    remover: useMutation({
      mutationFn: (produtoId: number) => api<Carrinho>(`/carrinho/itens/${produtoId}`, 'DELETE'),
      onSuccess: aplicar,
    }),
  };
}

export function useSair() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/sair', 'POST'),
    onSuccess: () => cliente.clear(),
  });
}
