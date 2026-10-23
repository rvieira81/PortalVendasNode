import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, ErroApi, mensagemDeErro } from '../api/cliente';
import { Alerta, Campo, Carregando } from '../componentes/Basicos';
import { formatarMoeda, mascaraCep } from '../util/formato';

interface Config {
  cepOrigem: string;
  diasManuseio: number;
  freteGratisAPartirDe: number;
  parcelasMaximas: number;
  parcelaMinima: number;
}

interface Faixa {
  id: number;
  descricao: string;
  cepInicio: string;
  cepFim: string;
  valor: number;
  prazoDias: number;
  ativa: boolean;
}

export function ConfiguracoesAdmin() {
  const cliente = useQueryClient();
  const config = useQuery({ queryKey: ['admin-config'], queryFn: () => api<Config>('/admin/configuracoes') });
  const faixas = useQuery({ queryKey: ['admin-faixas'], queryFn: () => api<Faixa[]>('/admin/faixas-frete') });
  const [c, setC] = useState<Record<keyof Config, string>>({ cepOrigem: '', diasManuseio: '', freteGratisAPartirDe: '', parcelasMaximas: '', parcelaMinima: '' });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [nova, setNova] = useState({ descricao: '', cepInicio: '', cepFim: '', valor: '', prazoDias: '' });

  useEffect(() => {
    if (config.data) {
      const d = config.data;
      setC({ cepOrigem: mascaraCep(d.cepOrigem), diasManuseio: String(d.diasManuseio), freteGratisAPartirDe: String(d.freteGratisAPartirDe), parcelasMaximas: String(d.parcelasMaximas), parcelaMinima: String(d.parcelaMinima) });
    }
  }, [config.data]);

  const n = (v: string) => Number(v.replace(',', '.'));
  const salvar = useMutation({
    mutationFn: () => api<Config>('/admin/configuracoes', 'PUT', { cepOrigem: c.cepOrigem, diasManuseio: n(c.diasManuseio), freteGratisAPartirDe: n(c.freteGratisAPartirDe), parcelasMaximas: n(c.parcelasMaximas), parcelaMinima: n(c.parcelaMinima) }),
    onSuccess: (d) => { cliente.setQueryData(['admin-config'], d); setErros({}); },
    onError: (e) => setErros(e instanceof ErroApi ? e.campos : {}),
  });
  const salvarFaixa = useMutation({
    mutationFn: () => api<Faixa[]>('/admin/faixas-frete', 'POST', { descricao: nova.descricao, cepInicio: nova.cepInicio, cepFim: nova.cepFim, valor: n(nova.valor), prazoDias: n(nova.prazoDias), ativa: true }),
    onSuccess: (f) => { cliente.setQueryData(['admin-faixas'], f); setNova({ descricao: '', cepInicio: '', cepFim: '', valor: '', prazoDias: '' }); },
  });
  const excluirFaixa = useMutation({ mutationFn: (id: number) => api<Faixa[]>(`/admin/faixas-frete/${id}`, 'DELETE'), onSuccess: (f) => cliente.setQueryData(['admin-faixas'], f) });

  if (config.isLoading) return <Carregando />;
  const campo = (k: keyof Config) => ({ id: `c-${k}`, value: c[k], onChange: (e: { target: { value: string } }) => setC({ ...c, [k]: k === 'cepOrigem' ? mascaraCep(e.target.value) : e.target.value }) });

  return (
    <>
      <h1>Frete e pagamento</h1>
      <form className="painel" onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} noValidate>
        {salvar.isSuccess ? <Alerta tipo="sucesso">Configurações salvas.</Alerta> : null}
        {salvar.error ? <Alerta tipo="erro">{mensagemDeErro(salvar.error)}</Alerta> : null}
        <div className="linha-campos">
          <Campo rotulo="CEP de origem" nome="c-cepOrigem" erro={erros.cepOrigem} dica="De onde os pedidos são postados"><input {...campo('cepOrigem')} inputMode="numeric" /></Campo>
          <Campo rotulo="Dias de manuseio" nome="c-diasManuseio" erro={erros.diasManuseio} dica="Somados ao prazo da transportadora"><input {...campo('diasManuseio')} inputMode="numeric" /></Campo>
          <Campo rotulo="Frete grátis a partir de (R$)" nome="c-freteGratisAPartirDe" erro={erros.freteGratisAPartirDe} dica="0 = desligado"><input {...campo('freteGratisAPartirDe')} inputMode="decimal" /></Campo>
        </div>
        <div className="linha-campos">
          <Campo rotulo="Parcelas máximas no cartão" nome="c-parcelasMaximas" erro={erros.parcelasMaximas}><input {...campo('parcelasMaximas')} inputMode="numeric" /></Campo>
          <Campo rotulo="Parcela mínima (R$)" nome="c-parcelaMinima" erro={erros.parcelaMinima}><input {...campo('parcelaMinima')} inputMode="decimal" /></Campo>
        </div>
        <button type="submit" className="btn btn-primario" disabled={salvar.isPending}>Salvar</button>
      </form>

      <section className="painel">
        <h2>Tabela de contingência de frete</h2>
        <p className="suave">Usada quando o Melhor Envio está fora do ar ou sem token. A faixa mais barata que contém o CEP é aplicada.</p>
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead><tr><th>Região</th><th>CEP inicial</th><th>CEP final</th><th className="num">Valor</th><th className="num">Prazo</th><th></th></tr></thead>
            <tbody>
              {faixas.data?.map((f) => (
                <tr key={f.id}>
                  <td>{f.descricao}{f.ativa ? null : <span className="selo"> inativa</span>}</td>
                  <td>{mascaraCep(f.cepInicio)}</td>
                  <td>{mascaraCep(f.cepFim)}</td>
                  <td className="num">{formatarMoeda(f.valor)}</td>
                  <td className="num">{f.prazoDias} dias</td>
                  <td><button type="button" className="btn-link" onClick={() => window.confirm('Excluir esta faixa?') && excluirFaixa.mutate(f.id)}>Excluir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 style={{ marginTop: '1rem' }}>Nova faixa</h3>
        {salvarFaixa.error ? <Alerta tipo="erro">{mensagemDeErro(salvarFaixa.error)}</Alerta> : null}
        <form className="linha-campos" onSubmit={(e) => { e.preventDefault(); salvarFaixa.mutate(); }}>
          <Campo rotulo="Região" nome="f-descricao"><input id="f-descricao" type="text" value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} /></Campo>
          <Campo rotulo="CEP inicial" nome="f-ini"><input id="f-ini" type="text" value={nova.cepInicio} onChange={(e) => setNova({ ...nova, cepInicio: mascaraCep(e.target.value) })} /></Campo>
          <Campo rotulo="CEP final" nome="f-fim"><input id="f-fim" type="text" value={nova.cepFim} onChange={(e) => setNova({ ...nova, cepFim: mascaraCep(e.target.value) })} /></Campo>
          <Campo rotulo="Valor (R$)" nome="f-valor"><input id="f-valor" type="text" inputMode="decimal" value={nova.valor} onChange={(e) => setNova({ ...nova, valor: e.target.value })} /></Campo>
          <Campo rotulo="Prazo (dias)" nome="f-prazo"><input id="f-prazo" type="text" inputMode="numeric" value={nova.prazoDias} onChange={(e) => setNova({ ...nova, prazoDias: e.target.value })} /></Campo>
          <div className="campo" style={{ justifyContent: 'flex-end' }}><button type="submit" className="btn btn-primario">Adicionar</button></div>
        </form>
      </section>
    </>
  );
}
