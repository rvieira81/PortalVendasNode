import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { api, ErroApi, mensagemDeErro } from '../api/cliente';
import { chaves, useCarrinho, useSessao } from '../api/consultas';
import type { DadosEndereco, Endereco, OpcaoFrete, Pedido } from '../api/tipos';
import { Alerta, Carregando, Etapas } from '../componentes/Basicos';
import { EnderecoForm } from '../componentes/EnderecoForm';
import { formatarMoeda, mascaraCep } from '../util/formato';

export function Checkout() {
  const cliente = useQueryClient();
  const navegar = useNavigate();
  const { data: usuario } = useSessao();
  const { data: carrinho, isLoading: carregandoCarrinho } = useCarrinho();
  const enderecos = useQuery({ queryKey: ['enderecos'], queryFn: () => api<Endereco[]>('/conta/enderecos') });
  const [enderecoId, setEnderecoId] = useState<number | null>(null);
  const [novo, setNovo] = useState(false);
  const [freteCodigo, setFreteCodigo] = useState('');
  // Uma chave por tentativa de checkout: duplo clique não cria dois pedidos (RF09)
  const chaveIdempotencia = useMemo(() => crypto.randomUUID(), []);

  const lista = enderecos.data ?? [];
  const selecionado = lista.find((e) => e.id === enderecoId) ?? lista.find((e) => e.padrao) ?? lista[0];

  useEffect(() => {
    if (!enderecoId && selecionado) setEnderecoId(selecionado.id);
  }, [enderecoId, selecionado]);

  const frete = useQuery({
    queryKey: ['frete', selecionado?.cep, carrinho?.subtotal, carrinho?.quantidadeItens],
    queryFn: () => api<OpcaoFrete[]>('/frete/cotacao', 'POST', { cep: selecionado!.cep }),
    enabled: Boolean(selecionado && carrinho?.itens.length),
    retry: false,
  });

  useEffect(() => {
    if (frete.data?.length && !frete.data.some((o) => o.codigo === freteCodigo)) setFreteCodigo(frete.data[0].codigo);
  }, [frete.data, freteCodigo]);

  const criar = useMutation({
    mutationFn: () => api<Pedido>('/pedidos', 'POST', { enderecoId: selecionado!.id, freteCodigo, chaveIdempotencia }),
    onSuccess: (pedido) => {
      cliente.invalidateQueries({ queryKey: chaves.carrinho });
      navegar(`/pedidos/${pedido.id}/pagamento`, { replace: true });
    },
    onError: (e) => {
      if (e instanceof ErroApi && e.dados.codigo === 'frete-alterado') frete.refetch();
    },
  });

  async function salvarEndereco(d: DadosEndereco) {
    const e = await api<Endereco>('/conta/enderecos', 'POST', { ...d, padrao: d.padrao || lista.length === 0 });
    await enderecos.refetch();
    setEnderecoId(e.id);
    setNovo(false);
  }

  if (carregandoCarrinho || enderecos.isLoading) return <Carregando />;
  if (!carrinho?.itens.length && !criar.isSuccess) return <Navigate to="/carrinho" replace />;

  const opcao = frete.data?.find((o) => o.codigo === freteCodigo);
  const total = (carrinho?.subtotal ?? 0) + (opcao?.valor ?? 0);
  const indisponiveis = criar.error instanceof ErroApi ? (criar.error.dados.indisponiveis as string[] | undefined) : undefined;

  return (
    <>
      <Etapas atual={2} />
      <h1>Entrega</h1>
      {usuario && !usuario.emailConfirmado ? (
        <Alerta tipo="aviso">
          Confirme seu e-mail para finalizar a compra. <Link to="/conta">Reenviar confirmação</Link>
        </Alerta>
      ) : null}
      <div className="duas-colunas">
        <div>
          <section className="painel" aria-labelledby="t-endereco">
            <h2 id="t-endereco">Endereço de entrega</h2>
            {lista.length && !novo ? (
              <>
                <div className="opcoes" role="radiogroup" aria-labelledby="t-endereco">
                  {lista.map((e) => (
                    <label key={e.id} className="opcao">
                      <input type="radio" name="endereco" checked={selecionado?.id === e.id} onChange={() => setEnderecoId(e.id)} />
                      <span className="detalhe">
                        <strong>{e.apelido}</strong> — {e.destinatario}
                        <small>
                          {e.logradouro}, {e.numero}
                          {e.complemento ? ` – ${e.complemento}` : ''} · {e.bairro} · {e.cidade}/{e.uf} · CEP {mascaraCep(e.cep)}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
                <button type="button" className="btn btn-link" onClick={() => setNovo(true)}>
                  + Novo endereço
                </button>
              </>
            ) : (
              <EnderecoForm inicial={{ destinatario: usuario?.nome ?? '' }} aoSalvar={salvarEndereco} aoCancelar={lista.length ? () => setNovo(false) : undefined} textoBotao="Usar este endereço" />
            )}
          </section>

          {selecionado && !novo ? (
            <section className="painel" aria-labelledby="t-frete">
              <h2 id="t-frete">Frete para {mascaraCep(selecionado.cep)}</h2>
              {frete.isLoading ? <Carregando texto="Calculando o frete…" /> : null}
              {frete.error ? <Alerta tipo="erro">{mensagemDeErro(frete.error)}</Alerta> : null}
              <div className="opcoes" role="radiogroup" aria-labelledby="t-frete">
                {frete.data?.map((o) => (
                  <label key={o.codigo} className="opcao">
                    <input type="radio" name="frete" checked={freteCodigo === o.codigo} onChange={() => setFreteCodigo(o.codigo)} />
                    <span className="detalhe">
                      {o.descricao}
                      <small>Chega em até {o.prazoDias} dias úteis</small>
                    </span>
                    <span className={`preco${o.gratis ? ' gratis' : ''}`}>{o.gratis ? 'Grátis' : formatarMoeda(o.valor)}</span>
                  </label>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="painel resumo lateral-fixa" aria-label="Resumo do pedido">
          <h2>Resumo</h2>
          <dl>
            <dt>Produtos ({carrinho?.quantidadeItens})</dt>
            <dd>{formatarMoeda(carrinho?.subtotal ?? 0)}</dd>
            <dt>Frete</dt>
            <dd>{opcao ? (opcao.gratis ? 'Grátis' : formatarMoeda(opcao.valor)) : '—'}</dd>
            <dt className="total">Total</dt>
            <dd className="total">{formatarMoeda(total)}</dd>
          </dl>
          {criar.error ? (
            <Alerta tipo="erro">
              {mensagemDeErro(criar.error)}
              {indisponiveis?.length ? <> ({indisponiveis.join(', ')}). <Link to="/carrinho">Revisar carrinho</Link></> : null}
            </Alerta>
          ) : null}
          <button
            type="button"
            className="btn btn-comprar btn-grande btn-bloco"
            disabled={!opcao || !selecionado || novo || criar.isPending || !usuario?.emailConfirmado}
            onClick={() => criar.mutate()}
          >
            {criar.isPending ? 'Reservando itens…' : 'Ir para o pagamento'}
          </button>
          <p className="suave pequeno centro">Os itens ficam reservados enquanto você paga.</p>
        </aside>
      </div>
    </>
  );
}
