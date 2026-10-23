import { useState, type FormEvent } from 'react';
import { api, ErroApi } from '../api/cliente';
import type { DadosEndereco } from '../api/tipos';
import { mascaraCep, somenteDigitos } from '../util/formato';
import { Alerta, Campo } from './Basicos';

const VAZIO: DadosEndereco = { apelido: 'Casa', destinatario: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', padrao: false };
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

interface Props {
  inicial?: Partial<DadosEndereco>;
  aoSalvar: (dados: DadosEndereco) => Promise<unknown>;
  aoCancelar?: () => void;
  textoBotao?: string;
}

/** RF07 — o CEP preenche rua, bairro, cidade e UF pelo ViaCEP; número e complemento continuam editáveis. */
export function EnderecoForm({ inicial, aoSalvar, aoCancelar, textoBotao = 'Salvar endereço' }: Props) {
  const [d, setD] = useState<DadosEndereco>({ ...VAZIO, ...inicial, cep: mascaraCep(inicial?.cep ?? ''), complemento: inicial?.complemento ?? '' });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [mensagem, setMensagem] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);

  const campo = (k: keyof DadosEndereco) => ({
    id: `end-${k}`,
    name: k,
    value: String(d[k] ?? ''),
    onChange: (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value }),
    'aria-invalid': erros[k] ? true : undefined,
  });

  async function buscarCep() {
    const cep = somenteDigitos(d.cep);
    if (cep.length !== 8) return;
    setAviso('');
    try {
      const r = await api<{ logradouro: string; bairro: string; cidade: string; uf: string }>(`/cep/${cep}`);
      setD((atual) => ({ ...atual, logradouro: r.logradouro || atual.logradouro, bairro: r.bairro || atual.bairro, cidade: r.cidade, uf: r.uf }));
      document.getElementById('end-numero')?.focus();
    } catch (e) {
      setAviso(e instanceof ErroApi ? e.message : 'CEP não encontrado.');
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErros({});
    setMensagem('');
    try {
      await aoSalvar({ ...d, cep: somenteDigitos(d.cep), complemento: d.complemento || null });
    } catch (erro) {
      if (erro instanceof ErroApi) {
        setErros(erro.campos);
        setMensagem(erro.message);
      } else setMensagem('Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      <Alerta tipo="erro">{mensagem}</Alerta>
      <div className="linha-campos">
        <Campo rotulo="CEP" nome="end-cep" erro={erros.cep || aviso}>
          <input {...campo('cep')} inputMode="numeric" autoComplete="postal-code" onChange={(e) => setD({ ...d, cep: mascaraCep(e.target.value) })} onBlur={buscarCep} required />
        </Campo>
        <Campo rotulo="Apelido" nome="end-apelido" erro={erros.apelido} dica="Ex.: Casa, Trabalho">
          <input {...campo('apelido')} maxLength={50} required />
        </Campo>
      </div>
      <Campo rotulo="Quem vai receber" nome="end-destinatario" erro={erros.destinatario}>
        <input {...campo('destinatario')} autoComplete="name" maxLength={150} required />
      </Campo>
      <Campo rotulo="Rua" nome="end-logradouro" erro={erros.logradouro}>
        <input {...campo('logradouro')} autoComplete="address-line1" maxLength={200} required />
      </Campo>
      <div className="linha-campos">
        <Campo rotulo="Número" nome="end-numero" erro={erros.numero}>
          <input {...campo('numero')} maxLength={20} required />
        </Campo>
        <Campo rotulo="Complemento" nome="end-complemento" erro={erros.complemento}>
          <input {...campo('complemento')} autoComplete="address-line2" maxLength={100} />
        </Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Bairro" nome="end-bairro" erro={erros.bairro}>
          <input {...campo('bairro')} maxLength={100} required />
        </Campo>
        <Campo rotulo="Cidade" nome="end-cidade" erro={erros.cidade}>
          <input {...campo('cidade')} autoComplete="address-level2" maxLength={100} required />
        </Campo>
        <Campo rotulo="UF" nome="end-uf" erro={erros.uf}>
          <select {...campo('uf')} required>
            <option value="">—</option>
            {UFS.map((uf) => (
              <option key={uf}>{uf}</option>
            ))}
          </select>
        </Campo>
      </div>
      <label className="marcacao">
        <input type="checkbox" checked={d.padrao} onChange={(e) => setD({ ...d, padrao: e.target.checked })} />
        <span>Usar como endereço padrão</span>
      </label>
      <div className="acoes">
        <button type="submit" className="btn btn-primario" disabled={salvando}>
          {salvando ? 'Salvando…' : textoBotao}
        </button>
        {aoCancelar ? (
          <button type="button" className="btn btn-link" onClick={aoCancelar}>
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}
