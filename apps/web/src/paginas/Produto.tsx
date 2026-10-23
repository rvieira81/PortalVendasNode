import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ErroApi, mensagemDeErro } from '../api/cliente';
import { useAlterarCarrinho } from '../api/consultas';
import type { ProdutoDetalhe } from '../api/tipos';
import { Alerta, Carregando, Preco, Quantidade } from '../componentes/Basicos';
import { formatarMoeda } from '../util/formato';
import { NaoEncontrado } from './NaoEncontrado';

export function Produto() {
  const { slug = '' } = useParams();
  const navegar = useNavigate();
  const { adicionar } = useAlterarCarrinho();
  const [foto, setFoto] = useState(0);
  const [quantidade, setQuantidade] = useState(1);
  const { data: p, isLoading, error } = useQuery({ queryKey: ['produto', slug], queryFn: () => api<ProdutoDetalhe>(`/produtos/${slug}`) });

  if (isLoading) return <Carregando />;
  if (error instanceof ErroApi && error.status === 404) return <NaoEncontrado />;
  if (error || !p) return <Alerta tipo="erro">{mensagemDeErro(error)}</Alerta>;

  const comprar = (irParaCarrinho: boolean) =>
    adicionar.mutate(
      { produtoId: p.id, quantidade },
      { onSuccess: (c) => (irParaCarrinho && !c.aviso ? navegar('/carrinho') : undefined) },
    );

  return (
    <>
      <nav className="migalhas" aria-label="Você está em">
        <Link to="/">Início</Link> › <Link to={`/categoria/${p.categoria.slug}`}>{p.categoria.nome}</Link> › {p.nome}
      </nav>
      <div className="produto-detalhe">
        <div className="galeria">
          <div className="principal">
            {p.imagens.length ? <img src={p.imagens[foto]} alt={p.nome} width={800} height={800} /> : <span className="suave">Sem foto</span>}
          </div>
          {p.imagens.length > 1 ? (
            <div className="miniaturas">
              {p.imagens.map((url, i) => (
                <button key={url} type="button" aria-pressed={i === foto} aria-label={`Foto ${i + 1}`} onClick={() => setFoto(i)}>
                  <img src={url} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="compra-box">
          <h1>{p.nome}</h1>
          <div>
            <Preco valor={p.preco} de={p.precoDe} grande />
          </div>
          <span className="parcelas">
            ou {p.parcelas.quantidade}x de {formatarMoeda(p.parcelas.valor)} no cartão · Pix e boleto à vista
          </span>
          {p.esgotado ? (
            <Alerta tipo="aviso">Produto esgotado no momento.</Alerta>
          ) : (
            <>
              <div className="acoes" style={{ marginTop: 0 }}>
                <Quantidade valor={quantidade} maximo={p.maximoNoCarrinho} aoMudar={setQuantidade} />
                <span className="suave pequeno">{p.disponivel <= 5 ? `Só ${p.disponivel} em estoque` : 'Em estoque'}</span>
              </div>
              {adicionar.data?.aviso ? <Alerta tipo="aviso">{adicionar.data.aviso}</Alerta> : null}
              {adicionar.isSuccess && !adicionar.data?.aviso ? (
                <Alerta tipo="sucesso">
                  Produto adicionado. <Link to="/carrinho">Ver carrinho</Link>
                </Alerta>
              ) : null}
              {adicionar.error ? <Alerta tipo="erro">{mensagemDeErro(adicionar.error)}</Alerta> : null}
              <div className="acoes" style={{ marginTop: 0 }}>
                <button type="button" className="btn btn-comprar btn-grande" disabled={adicionar.isPending} onClick={() => comprar(true)}>
                  Comprar agora
                </button>
                <button type="button" className="btn btn-contorno btn-grande" disabled={adicionar.isPending} onClick={() => comprar(false)}>
                  Adicionar ao carrinho
                </button>
              </div>
            </>
          )}
          <section>
            <h3>Descrição</h3>
            <p style={{ whiteSpace: 'pre-line' }}>{p.descricao || 'Sem descrição.'}</p>
          </section>
          <table className="ficha">
            <tbody>
              <tr>
                <td>Código</td>
                <td>{p.sku}</td>
              </tr>
              <tr>
                <td>Peso</td>
                <td>{p.dimensoes.pesoKg.toLocaleString('pt-BR')} kg</td>
              </tr>
              <tr>
                <td>Dimensões (A × L × C)</td>
                <td>
                  {p.dimensoes.alturaCm} × {p.dimensoes.larguraCm} × {p.dimensoes.comprimentoCm} cm
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
