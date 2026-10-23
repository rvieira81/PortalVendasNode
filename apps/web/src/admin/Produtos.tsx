import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api, ErroApi, mensagemDeErro } from '../api/cliente';
import type { Pagina } from '../api/tipos';
import { Alerta, Campo, Carregando, Paginacao } from '../componentes/Basicos';
import { formatarMoeda } from '../util/formato';

interface LinhaProduto {
  id: number;
  sku: string;
  nome: string;
  slug: string;
  categoria: string;
  preco: number;
  estoque: number;
  reservado: number;
  ativo: boolean;
}

interface ProdutoAdmin {
  id: number;
  categoriaId: number;
  sku: string;
  nome: string;
  slug: string;
  descricao: string;
  preco: number;
  precoDe: number | null;
  estoque: number;
  estoqueReservado: number;
  pesoKg: number;
  alturaCm: number;
  larguraCm: number;
  comprimentoCm: number;
  ativo: boolean;
  imagens: { id: number; url: string }[];
}

export function ProdutosAdmin() {
  const [params, setParams] = useSearchParams();
  const pagina = Number(params.get('pagina') ?? 1);
  const busca = params.get('busca') ?? '';
  const { data, isLoading } = useQuery({
    queryKey: ['admin-produtos', busca, pagina],
    queryFn: () => api<Pagina<LinhaProduto>>(`/admin/produtos?pagina=${pagina}${busca ? `&busca=${encodeURIComponent(busca)}` : ''}`),
    placeholderData: (a) => a,
  });
  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Produtos</h1>
        <div className="filtros">
          <label className="sr-only" htmlFor="busca-produto">Buscar</label>
          <input id="busca-produto" type="search" placeholder="Nome ou SKU" defaultValue={busca} onKeyDown={(e) => e.key === 'Enter' && setParams(e.currentTarget.value ? { busca: e.currentTarget.value } : {})} />
          <Link to="/admin/produtos/novo" className="btn btn-comprar">+ Novo produto</Link>
        </div>
      </div>
      {isLoading || !data ? <Carregando /> : (
        <div className="painel tabela-rolagem">
          <table className="tabela">
            <thead><tr><th>SKU</th><th>Produto</th><th>Categoria</th><th className="num">Preço</th><th className="num">Estoque</th><th>Situação</th></tr></thead>
            <tbody>
              {data.itens.map((p) => (
                <tr key={p.id}>
                  <td>{p.sku}</td>
                  <td><Link to={`/admin/produtos/${p.id}`}>{p.nome}</Link></td>
                  <td>{p.categoria}</td>
                  <td className="num">{formatarMoeda(p.preco)}</td>
                  <td className="num">{p.estoque}{p.reservado ? <span className="suave pequeno"> ({p.reservado} reserv.)</span> : null}</td>
                  <td>{p.ativo ? <span className="selo selo-5">Ativo</span> : <span className="selo">Inativo</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Paginacao pagina={data.pagina} paginas={data.paginas} aoMudar={(n) => setParams({ ...(busca ? { busca } : {}), pagina: String(n) })} />
        </div>
      )}
    </>
  );
}

const VAZIO = { categoriaId: 0, sku: '', nome: '', descricao: '', preco: '', precoDe: '', estoque: '0', pesoKg: '', alturaCm: '', larguraCm: '', comprimentoCm: '', ativo: true };
type Form = typeof VAZIO;
const num = (v: string) => Number(String(v).replace(',', '.'));

export function ProdutoFormAdmin() {
  const { id } = useParams();
  const novo = id === 'novo';
  const cliente = useQueryClient();
  const navegar = useNavigate();
  const categorias = useQuery({ queryKey: ['admin-categorias'], queryFn: () => api<{ id: number; nome: string }[]>('/admin/categorias') });
  const produto = useQuery({ queryKey: ['admin-produto', id], queryFn: () => api<ProdutoAdmin>(`/admin/produtos/${id}`), enabled: !novo });
  const [f, setF] = useState<Form>(VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    const p = produto.data;
    if (p) {
      setF({
        categoriaId: p.categoriaId, sku: p.sku, nome: p.nome, descricao: p.descricao, preco: String(p.preco), precoDe: p.precoDe ? String(p.precoDe) : '',
        estoque: String(p.estoque), pesoKg: String(p.pesoKg), alturaCm: String(p.alturaCm), larguraCm: String(p.larguraCm), comprimentoCm: String(p.comprimentoCm), ativo: p.ativo,
      });
    }
  }, [produto.data]);

  const salvar = useMutation({
    mutationFn: () =>
      api<ProdutoAdmin>(novo ? '/admin/produtos' : `/admin/produtos/${id}`, novo ? 'POST' : 'PUT', {
        categoriaId: Number(f.categoriaId), sku: f.sku, nome: f.nome, descricao: f.descricao, preco: num(f.preco), precoDe: f.precoDe ? num(f.precoDe) : null,
        estoque: Number(f.estoque), pesoKg: num(f.pesoKg), alturaCm: num(f.alturaCm), larguraCm: num(f.larguraCm), comprimentoCm: num(f.comprimentoCm), ativo: f.ativo,
      }),
    onSuccess: (p) => {
      cliente.invalidateQueries({ queryKey: ['admin-produtos'] });
      cliente.setQueryData(['admin-produto', String(p.id)], p);
      setMensagem('Produto salvo.');
      if (novo) navegar(`/admin/produtos/${p.id}`, { replace: true });
    },
    onError: (e) => setErros(e instanceof ErroApi ? e.campos : {}),
  });
  const upload = useMutation({
    mutationFn: (arquivos: FileList) => {
      const dados = new FormData();
      Array.from(arquivos).forEach((a) => dados.append('imagens', a));
      return api<ProdutoAdmin>(`/admin/produtos/${id}/imagens`, 'POST', dados);
    },
    onSuccess: (p) => cliente.setQueryData(['admin-produto', id], p),
  });
  const removerImagem = useMutation({
    mutationFn: (imagemId: number) => api<ProdutoAdmin>(`/admin/produtos/${id}/imagens/${imagemId}`, 'DELETE'),
    onSuccess: (p) => cliente.setQueryData(['admin-produto', id], p),
  });
  const excluir = useMutation({
    mutationFn: () => api<{ mensagem: string }>(`/admin/produtos/${id}`, 'DELETE'),
    onSuccess: (r) => {
      cliente.invalidateQueries({ queryKey: ['admin-produtos'] });
      window.alert(r.mensagem);
      navegar('/admin/produtos');
    },
  });

  if (!novo && produto.isLoading) return <Carregando />;
  const campo = (k: keyof Form, extra: Record<string, unknown> = {}) => ({
    id: `p-${k}`, value: String(f[k]), onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }), 'aria-invalid': erros[k] ? true : undefined, ...extra,
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setMensagem('');
    salvar.mutate();
  };

  return (
    <>
      <p><Link to="/admin/produtos">‹ Produtos</Link></p>
      <h1>{novo ? 'Novo produto' : f.nome}</h1>
      <div className="duas-colunas">
        <form className="painel" onSubmit={enviar} noValidate>
          {mensagem ? <Alerta tipo="sucesso">{mensagem}</Alerta> : null}
          {salvar.error && !Object.keys(erros).length ? <Alerta tipo="erro">{mensagemDeErro(salvar.error)}</Alerta> : null}
          {Object.keys(erros).length ? <Alerta tipo="erro">Confira os campos destacados.</Alerta> : null}
          <div className="linha-campos">
            <Campo rotulo="Nome" nome="p-nome" erro={erros.nome}><input {...campo('nome')} maxLength={200} /></Campo>
            <Campo rotulo="SKU" nome="p-sku" erro={erros.sku}><input {...campo('sku')} maxLength={50} /></Campo>
          </div>
          <Campo rotulo="Categoria" nome="p-categoriaId" erro={erros.categoriaId}>
            <select {...campo('categoriaId')}>
              <option value={0}>Escolha…</option>
              {categorias.data?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Descrição" nome="p-descricao" erro={erros.descricao}><textarea {...campo('descricao')} maxLength={4000} /></Campo>
          <div className="linha-campos">
            <Campo rotulo="Preço (R$)" nome="p-preco" erro={erros.preco}><input {...campo('preco', { inputMode: 'decimal' })} /></Campo>
            <Campo rotulo='Preço "de" (R$)' nome="p-precoDe" erro={erros.precoDe} dica="Opcional, aparece riscado"><input {...campo('precoDe', { inputMode: 'decimal' })} /></Campo>
            <Campo rotulo="Estoque" nome="p-estoque" erro={erros.estoque}><input {...campo('estoque', { inputMode: 'numeric' })} /></Campo>
          </div>
          <h3>Frete (embalado)</h3>
          <div className="linha-campos">
            <Campo rotulo="Peso (kg)" nome="p-pesoKg" erro={erros.pesoKg}><input {...campo('pesoKg', { inputMode: 'decimal' })} /></Campo>
            <Campo rotulo="Altura (cm)" nome="p-alturaCm" erro={erros.alturaCm}><input {...campo('alturaCm', { inputMode: 'decimal' })} /></Campo>
            <Campo rotulo="Largura (cm)" nome="p-larguraCm" erro={erros.larguraCm}><input {...campo('larguraCm', { inputMode: 'decimal' })} /></Campo>
            <Campo rotulo="Comprimento (cm)" nome="p-comprimentoCm" erro={erros.comprimentoCm}><input {...campo('comprimentoCm', { inputMode: 'decimal' })} /></Campo>
          </div>
          <label className="marcacao"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /><span>Ativo (aparece na loja)</span></label>
          <div className="acoes">
            <button type="submit" className="btn btn-primario" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando…' : 'Salvar'}</button>
            {!novo ? <Link to={`/produto/${produto.data?.slug}`} target="_blank" className="btn btn-link">Ver na loja</Link> : null}
            {!novo ? <button type="button" className="btn btn-perigo" onClick={() => window.confirm('Excluir este produto? Se já teve vendas, ele será apenas desativado.') && excluir.mutate()}>Excluir</button> : null}
          </div>
        </form>
        <aside className="painel">
          <h2>Fotos</h2>
          {novo ? <p className="suave">Salve o produto para enviar as fotos.</p> : (
            <>
              <div className="miniaturas-admin">
                {produto.data?.imagens.map((i) => (
                  <figure key={i.id}>
                    <img src={i.url} alt="" />
                    <button type="button" className="btn-link pequeno" onClick={() => removerImagem.mutate(i.id)}>Remover</button>
                  </figure>
                ))}
              </div>
              {upload.error ? <Alerta tipo="erro">{mensagemDeErro(upload.error)}</Alerta> : null}
              <Campo rotulo="Adicionar fotos" nome="fotos" dica="JPG, PNG ou WebP até 2 MB cada (máximo 8)">
                <input id="fotos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => e.target.files?.length && upload.mutate(e.target.files)} />
              </Campo>
              {upload.isPending ? <p className="suave">Enviando…</p> : null}
            </>
          )}
        </aside>
      </div>
    </>
  );
}
