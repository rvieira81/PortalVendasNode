import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, mensagemDeErro } from '../api/cliente';
import { MetodoPagamento, StatusPagamento, StatusPedido, type ConfigPagamento, type Pedido } from '../api/tipos';
import { Alerta, Carregando, Etapas } from '../componentes/Basicos';
import { formatarDataHora, formatarMoeda } from '../util/formato';

type Aba = 'pix' | 'cartao' | 'boleto';
let mercadoPagoIniciado = '';
/** Inicializa o SDK uma única vez por chave pública (precisa acontecer antes de renderizar o Brick). */
function iniciarMercadoPago(publicKey: string) {
  if (!publicKey || mercadoPagoIniciado === publicKey) return;
  initMercadoPago(publicKey, { locale: 'pt-BR' });
  mercadoPagoIniciado = publicKey;
}

interface DadosBrick {
  token: string;
  installments: number;
  payment_method_id: string;
  issuer_id?: string | number;
}

export function Pagamento() {
  const { id } = useParams();
  const cliente = useQueryClient();
  const chave = ['pedido', id];
  const pedido = useQuery({ queryKey: chave, queryFn: () => api<Pedido>(`/pedidos/${id}`) });
  const config = useQuery({ queryKey: ['config-pagamento'], queryFn: () => api<ConfigPagamento>('/pagamentos/config'), staleTime: Infinity });
  const [aba, setAba] = useState<Aba>('pix');
  const [recusa, setRecusa] = useState('');

  const pag = pedido.data?.pagamento;
  const aguardandoPixOuBoleto =
    pedido.data?.status === StatusPedido.AguardandoPagamento && pag?.status === StatusPagamento.Pendente && (pag.pixQrCode || pag.boletoLinhaDigitavel);

  // RF10 — a página atualiza sozinha quando o pagamento é confirmado
  const status = useQuery({
    queryKey: ['status-pedido', id],
    queryFn: () => api<{ status: StatusPedido }>(`/pedidos/${id}/status`),
    enabled: Boolean(aguardandoPixOuBoleto || pedido.data?.status === StatusPedido.PagamentoEmAnalise),
    refetchInterval: 5000,
  });
  useEffect(() => {
    if (status.data && pedido.data && status.data.status !== pedido.data.status) cliente.invalidateQueries({ queryKey: chave });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.data?.status]);

  useEffect(() => {
    if (pag?.metodo === MetodoPagamento.Boleto) setAba('boleto');
  }, [pag?.metodo]);

  const pagar = useMutation({
    mutationFn: (corpo: unknown) => api<Pedido>(`/pedidos/${id}/pagamento`, 'POST', corpo),
    onSuccess: (p) => {
      cliente.setQueryData(chave, p);
      setRecusa(p.recusa ?? '');
    },
  });

  if (pedido.isLoading) return <Carregando />;
  if (!pedido.data) return <Alerta tipo="erro">{mensagemDeErro(pedido.error)}</Alerta>;
  const p = pedido.data;

  if (p.status === StatusPedido.Pago || p.status >= StatusPedido.EmSeparacao) {
    if (p.status !== StatusPedido.Cancelado) {
      return (
        <div className="painel vazio">
          <h1>Pagamento aprovado!</h1>
          <p>Pedido #{p.id} confirmado. Enviamos os detalhes para o seu e-mail.</p>
          <Link to={`/conta/pedidos/${p.id}`} className="btn btn-primario">
            Acompanhar pedido
          </Link>
        </div>
      );
    }
  }
  if (p.status === StatusPedido.Cancelado) {
    return (
      <div className="painel vazio">
        <h1>Pedido cancelado</h1>
        <p>{p.motivoCancelamento ?? 'O prazo para pagamento terminou.'}</p>
        <Link to="/" className="btn btn-primario">
          Voltar à loja
        </Link>
      </div>
    );
  }
  if (p.status === StatusPedido.PagamentoEmAnalise) {
    return (
      <div className="painel vazio">
        <h1>Pagamento em análise</h1>
        <p>O Mercado Pago está analisando o pagamento. Avisaremos por e-mail assim que houver resposta.</p>
        <p className="aguardando" style={{ justifyContent: 'center' }}>
          Aguardando resposta…
        </p>
      </div>
    );
  }

  const publicKey = config.data?.publicKey ?? '';
  iniciarMercadoPago(publicKey);

  return (
    <>
      <Etapas atual={3} />
      <div className="cabecalho-pagina">
        <div>
          <h1>Pagamento do pedido #{p.id}</h1>
          <p>
            Total: <strong>{formatarMoeda(p.total)}</strong>
            {p.expiraEm ? <> · pague até {formatarDataHora(p.expiraEm)}</> : null}
          </p>
        </div>
      </div>
      <div className="duas-colunas">
        <section className="painel">
          {config.data && !config.data.configurado ? (
            <Alerta tipo="aviso">Pagamentos ainda não configurados nesta loja (credenciais do Mercado Pago ausentes no servidor).</Alerta>
          ) : null}
          <div className="abas" role="tablist">
            {(['pix', 'cartao', 'boleto'] as Aba[]).map((a) => (
              <button key={a} type="button" role="tab" aria-selected={aba === a} onClick={() => setAba(a)}>
                {a === 'pix' ? 'Pix' : a === 'cartao' ? 'Cartão de crédito' : 'Boleto'}
              </button>
            ))}
          </div>
          {pagar.error ? <Alerta tipo="erro">{mensagemDeErro(pagar.error)}</Alerta> : null}
          {recusa ? <Alerta tipo="erro">{recusa}</Alerta> : null}

          {aba === 'pix' ? (
            pag?.metodo === MetodoPagamento.Pix && pag.status === StatusPagamento.Pendente && pag.pixQrCode ? (
              <div className="pix-box">
                {pag.pixQrCodeBase64 ? <img src={`data:image/png;base64,${pag.pixQrCodeBase64}`} alt="QR Code do Pix" /> : null}
                <p>Abra o app do seu banco, escolha <strong>Pix → Ler QR Code</strong> ou use o código abaixo.</p>
                <CopiaECola valor={pag.pixQrCode} />
                {pag.expiraEm ? <p className="suave pequeno">Válido até {formatarDataHora(pag.expiraEm)}</p> : null}
                <p className="aguardando">Aguardando o pagamento — esta página atualiza sozinha.</p>
              </div>
            ) : (
              <div>
                <p>Aprovação na hora. O QR Code vale por 30 minutos.</p>
                <button type="button" className="btn btn-comprar btn-grande" disabled={pagar.isPending} onClick={() => pagar.mutate({ metodo: 'pix' })}>
                  {pagar.isPending ? 'Gerando Pix…' : `Gerar Pix de ${formatarMoeda(p.total)}`}
                </button>
              </div>
            )
          ) : null}

          {aba === 'boleto' ? (
            pag?.metodo === MetodoPagamento.Boleto && pag.status === StatusPagamento.Pendente && pag.boletoLinhaDigitavel ? (
              <div className="pix-box">
                <p>Pague no app do banco ou numa lotérica. A confirmação leva até 3 dias úteis.</p>
                <CopiaECola valor={pag.boletoLinhaDigitavel} />
                {pag.boletoUrl ? (
                  <a className="btn btn-primario" href={pag.boletoUrl} target="_blank" rel="noopener noreferrer">
                    Abrir boleto (PDF)
                  </a>
                ) : null}
                {pag.expiraEm ? <p className="suave pequeno">Vencimento: {formatarDataHora(pag.expiraEm)}</p> : null}
              </div>
            ) : (
              <div>
                <p>O boleto vence em 3 dias úteis. Os itens ficam reservados até o vencimento.</p>
                <button type="button" className="btn btn-comprar btn-grande" disabled={pagar.isPending} onClick={() => pagar.mutate({ metodo: 'boleto' })}>
                  {pagar.isPending ? 'Gerando boleto…' : 'Gerar boleto'}
                </button>
              </div>
            )
          ) : null}

          {aba === 'cartao' ? (
            publicKey ? (
              <CardPayment
                key={`${p.id}-${p.total}`}
                initialization={{ amount: p.total }}
                customization={{ paymentMethods: { maxInstallments: config.data?.parcelasMaximas ?? 12 } }}
                locale="pt-BR"
                onSubmit={async (dados: DadosBrick) => {
                  // O cartão foi tokenizado no navegador; só o token vai para o servidor (RNF03)
                  await pagar.mutateAsync({
                    metodo: 'cartao',
                    cartao: { token: dados.token, parcelas: dados.installments, paymentMethodId: dados.payment_method_id, issuerId: dados.issuer_id ? String(dados.issuer_id) : undefined },
                  });
                }}
              />
            ) : (
              <p className="suave">Pagamento com cartão indisponível no momento.</p>
            )
          ) : null}
        </section>

        <aside className="painel resumo lateral-fixa">
          <h2>Resumo</h2>
          <dl>
            <dt>Produtos</dt>
            <dd>{formatarMoeda(p.subtotal)}</dd>
            <dt>Frete</dt>
            <dd>{p.frete === 0 ? 'Grátis' : formatarMoeda(p.frete)}</dd>
            <dt className="total">Total</dt>
            <dd className="total">{formatarMoeda(p.total)}</dd>
          </dl>
          <p className="pequeno suave">
            Entrega em {p.entrega.logradouro}, {p.entrega.numero} — {p.entrega.cidade}/{p.entrega.uf}
            <br />
            {p.freteDescricao}, até {p.fretePrazoDias} dias úteis
          </p>
        </aside>
      </div>
    </>
  );
}

function CopiaECola({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="copia-cola">
      <label htmlFor="copia" className="sr-only">
        Código
      </label>
      <input id="copia" type="text" readOnly value={valor} onFocus={(e) => e.target.select()} />
      <button
        type="button"
        className="btn btn-primario"
        onClick={async () => {
          await navigator.clipboard.writeText(valor);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2500);
        }}
      >
        {copiado ? 'Copiado!' : 'Copiar'}
      </button>
    </div>
  );
}
