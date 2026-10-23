import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, mensagemDeErro } from '../api/cliente';
import { Alerta, Carregando } from '../componentes/Basicos';

interface CategoriaAdmin {
  id: number;
  nome: string;
  slug: string;
  ativa: boolean;
  produtos: number;
}

export function CategoriasAdmin() {
  const cliente = useQueryClient();
  const lista = useQuery({ queryKey: ['admin-categorias'], queryFn: () => api<CategoriaAdmin[]>('/admin/categorias') });
  const [nome, setNome] = useState('');
  const salvar = useMutation({
    mutationFn: (c: { id?: number; nome: string; ativa: boolean }) => api(c.id ? `/admin/categorias/${c.id}` : '/admin/categorias', c.id ? 'PUT' : 'POST', { nome: c.nome, ativa: c.ativa }),
    onSuccess: () => {
      setNome('');
      cliente.invalidateQueries({ queryKey: ['admin-categorias'] });
      cliente.invalidateQueries({ queryKey: ['categorias'] });
    },
  });
  return (
    <>
      <h1>Categorias</h1>
      <form className="painel acoes" style={{ marginTop: 0 }} onSubmit={(e) => { e.preventDefault(); salvar.mutate({ nome, ativa: true }); }}>
        <label className="sr-only" htmlFor="nova-categoria">Nova categoria</label>
        <input id="nova-categoria" type="text" placeholder="Nova categoria" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={100} style={{ maxWidth: 320 }} />
        <button type="submit" className="btn btn-primario" disabled={!nome.trim()}>Adicionar</button>
      </form>
      {salvar.error ? <Alerta tipo="erro">{mensagemDeErro(salvar.error)}</Alerta> : null}
      {lista.isLoading ? <Carregando /> : (
        <div className="painel tabela-rolagem">
          <table className="tabela">
            <thead><tr><th>Nome</th><th>Endereço</th><th className="num">Produtos</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              {lista.data?.map((c) => (
                <tr key={c.id}>
                  <td>{c.nome}</td>
                  <td className="suave">/categoria/{c.slug}</td>
                  <td className="num">{c.produtos}</td>
                  <td>{c.ativa ? <span className="selo selo-5">Ativa</span> : <span className="selo">Inativa</span>}</td>
                  <td>
                    <button type="button" className="btn-link" onClick={() => { const n = window.prompt('Novo nome', c.nome); if (n) salvar.mutate({ id: c.id, nome: n, ativa: c.ativa }); }}>Renomear</button>
                    <button type="button" className="btn-link" onClick={() => salvar.mutate({ id: c.id, nome: c.nome, ativa: !c.ativa })}>{c.ativa ? 'Desativar' : 'Ativar'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
