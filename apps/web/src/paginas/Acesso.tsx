import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { api, ErroApi, mensagemDeErro } from '../api/cliente';
import { chaves, useSessao } from '../api/consultas';
import { Alerta, Campo, Carregando } from '../componentes/Basicos';
import { cpfValido, mascaraCpf, mascaraTelefone } from '../util/formato';

/** Só aceita voltar para caminhos internos (evita redirecionamento aberto). */
function destinoSeguro(v: string | null) {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/';
}

export function Entrar() {
  const cliente = useQueryClient();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const entrar = useMutation({
    mutationFn: () => api<{ proximo: string }>('/auth/entrar', 'POST', { email, senha }),
    onSuccess: async (r) => {
      await cliente.invalidateQueries();
      if (r.proximo === 'loja') navegar(destinoSeguro(params.get('voltar')), { replace: true });
      else navegar('/conta/verificacao', { replace: true });
    },
  });
  return (
    <div className="painel painel-form">
      <h1>Entrar</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          entrar.mutate();
        }}
      >
        <Alerta tipo="erro">{entrar.error ? mensagemDeErro(entrar.error) : ''}</Alerta>
        <Campo rotulo="E-mail" nome="email">
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Campo>
        <Campo rotulo="Senha" nome="senha">
          <input id="senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </Campo>
        <button type="submit" className="btn btn-primario btn-bloco btn-grande" disabled={entrar.isPending}>
          {entrar.isPending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <hr className="separador" />
      <p className="centro">
        <Link to="/conta/esqueci-senha">Esqueci minha senha</Link>
      </p>
      <p className="centro">
        Ainda não tem conta? <Link to={`/conta/cadastro${params.get('voltar') ? `?voltar=${encodeURIComponent(params.get('voltar')!)}` : ''}`}>Cadastre-se</Link>
      </p>
    </div>
  );
}

export function Cadastro() {
  const cliente = useQueryClient();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const [d, setD] = useState({ nome: '', email: '', cpf: '', telefone: '', senha: '', aceitouTermos: false });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState('');
  const cadastrar = useMutation({
    mutationFn: () => api<{ mensagem: string; logado: boolean }>('/auth/cadastro', 'POST', d),
    onSuccess: async (r) => {
      await cliente.invalidateQueries();
      if (r.logado) navegar(destinoSeguro(params.get('voltar') ?? '/conta'), { replace: true, state: { mensagem: r.mensagem } });
      else setResultado(r.mensagem);
    },
    onError: (e) => setErros(e instanceof ErroApi ? e.campos : {}),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    const locais: Record<string, string> = {};
    if (!cpfValido(d.cpf)) locais.cpf = 'CPF inválido.';
    if (d.senha.length < 8) locais.senha = 'A senha precisa de pelo menos 8 caracteres.';
    setErros(locais);
    if (!Object.keys(locais).length) cadastrar.mutate();
  }

  if (resultado) {
    return (
      <div className="painel painel-form">
        <h1>Quase lá!</h1>
        <Alerta tipo="sucesso">{resultado}</Alerta>
        <Link to="/conta/entrar" className="btn btn-primario">
          Ir para o login
        </Link>
      </div>
    );
  }

  const v = (k: keyof typeof d) => ({ id: k, value: String(d[k]), 'aria-invalid': erros[k] ? true : undefined });
  return (
    <div className="painel painel-form">
      <h1>Criar conta</h1>
      <form onSubmit={enviar} noValidate>
        {cadastrar.error && !Object.keys(erros).length ? <Alerta tipo="erro">{mensagemDeErro(cadastrar.error)}</Alerta> : null}
        <Campo rotulo="Nome completo" nome="nome" erro={erros.nome}>
          <input {...v('nome')} autoComplete="name" maxLength={150} onChange={(e) => setD({ ...d, nome: e.target.value })} required />
        </Campo>
        <Campo rotulo="E-mail" nome="email" erro={erros.email}>
          <input {...v('email')} type="email" autoComplete="email" onChange={(e) => setD({ ...d, email: e.target.value })} required />
        </Campo>
        <div className="linha-campos">
          <Campo rotulo="CPF" nome="cpf" erro={erros.cpf} dica="Exigido para emitir a nota e o boleto">
            <input {...v('cpf')} inputMode="numeric" onChange={(e) => setD({ ...d, cpf: mascaraCpf(e.target.value) })} required />
          </Campo>
          <Campo rotulo="Celular" nome="telefone" erro={erros.telefone}>
            <input {...v('telefone')} type="tel" autoComplete="tel-national" onChange={(e) => setD({ ...d, telefone: mascaraTelefone(e.target.value) })} required />
          </Campo>
        </div>
        <Campo rotulo="Senha" nome="senha" erro={erros.senha} dica="Mínimo de 8 caracteres, com letras e números">
          <input {...v('senha')} type="password" autoComplete="new-password" onChange={(e) => setD({ ...d, senha: e.target.value })} required />
        </Campo>
        <label className="marcacao">
          <input type="checkbox" checked={d.aceitouTermos} onChange={(e) => setD({ ...d, aceitouTermos: e.target.checked })} />
          <span>
            Li e aceito os <Link to="/termos" target="_blank">termos de uso</Link> e a <Link to="/privacidade" target="_blank">política de privacidade</Link>.
          </span>
        </label>
        <button type="submit" className="btn btn-comprar btn-bloco btn-grande" disabled={!d.aceitouTermos || cadastrar.isPending}>
          {cadastrar.isPending ? 'Criando conta…' : 'Criar conta'}
        </button>
      </form>
      <p className="centro">
        Já tem conta? <Link to="/conta/entrar">Entrar</Link>
      </p>
    </div>
  );
}

export function ConfirmarEmail() {
  const [params] = useSearchParams();
  const cliente = useQueryClient();
  const token = params.get('token') ?? '';
  const confirmar = useMutation({
    mutationFn: () => api<{ mensagem: string }>('/auth/confirmar-email', 'POST', { token }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: chaves.sessao }),
  });
  const { mutate } = confirmar;
  useEffect(() => {
    if (token) mutate();
  }, [token, mutate]);
  return (
    <div className="painel painel-form centro">
      <h1>Confirmação de e-mail</h1>
      {confirmar.isPending ? <Carregando texto="Confirmando…" /> : null}
      {confirmar.isSuccess ? <Alerta tipo="sucesso">{confirmar.data.mensagem}</Alerta> : null}
      {confirmar.error ? <Alerta tipo="erro">{mensagemDeErro(confirmar.error)}</Alerta> : null}
      {!token ? <Alerta tipo="erro">Link incompleto.</Alerta> : null}
      <Link to="/" className="btn btn-primario">
        Ir para a loja
      </Link>
    </div>
  );
}

export function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const pedir = useMutation({ mutationFn: () => api<{ mensagem: string }>('/auth/esqueci-senha', 'POST', { email }) });
  return (
    <div className="painel painel-form">
      <h1>Recuperar senha</h1>
      {pedir.isSuccess ? (
        <Alerta tipo="sucesso">{pedir.data.mensagem}</Alerta>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            pedir.mutate();
          }}
        >
          <Alerta tipo="erro">{pedir.error ? mensagemDeErro(pedir.error) : ''}</Alerta>
          <p className="suave">Informe o e-mail da conta. Enviaremos um link válido por 1 hora.</p>
          <Campo rotulo="E-mail" nome="email">
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Campo>
          <button type="submit" className="btn btn-primario btn-bloco" disabled={pedir.isPending}>
            Enviar link
          </button>
        </form>
      )}
    </div>
  );
}

export function RedefinirSenha() {
  const [params] = useSearchParams();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const cliente = useQueryClient();
  const redefinir = useMutation({
    mutationFn: () => api<{ mensagem: string }>('/auth/redefinir-senha', 'POST', { token: params.get('token'), senha }),
    onSuccess: () => cliente.clear(),
  });
  return (
    <div className="painel painel-form">
      <h1>Nova senha</h1>
      {redefinir.isSuccess ? (
        <>
          <Alerta tipo="sucesso">{redefinir.data.mensagem}</Alerta>
          <Link to="/conta/entrar" className="btn btn-primario">
            Entrar
          </Link>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (senha === confirmacao) redefinir.mutate();
          }}
        >
          <Alerta tipo="erro">{redefinir.error ? mensagemDeErro(redefinir.error) : ''}</Alerta>
          <Campo rotulo="Nova senha" nome="senha" dica="Mínimo de 8 caracteres, com letras e números">
            <input id="senha" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </Campo>
          <Campo rotulo="Repita a senha" nome="confirmacao" erro={confirmacao && senha !== confirmacao ? 'As senhas não conferem.' : undefined}>
            <input id="confirmacao" type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} required />
          </Campo>
          <button type="submit" className="btn btn-primario btn-bloco" disabled={redefinir.isPending}>
            Salvar nova senha
          </button>
        </form>
      )}
    </div>
  );
}

/** Segundo fator do administrador: configura o autenticador (1ª vez) ou confere o código. */
export function Verificacao2fa() {
  const { data: usuario, isLoading } = useSessao();
  const cliente = useQueryClient();
  const navegar = useNavigate();
  const [codigo, setCodigo] = useState('');
  const [qr, setQr] = useState('');
  const configurar = usuario?.pendente2fa === 'configurar';
  const segredo = useQuery({
    queryKey: ['2fa-config'],
    queryFn: () => api<{ segredo: string; uri: string }>('/auth/2fa/configuracao'),
    enabled: configurar,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (segredo.data) QRCode.toDataURL(segredo.data.uri, { margin: 1, width: 220 }).then(setQr);
  }, [segredo.data]);
  const verificar = useMutation({
    mutationFn: () => api('/auth/2fa/verificar', 'POST', { codigo }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: chaves.sessao });
      navegar('/admin', { replace: true });
    },
  });

  if (isLoading) return <Carregando />;
  if (!usuario) return <Navigate to="/conta/entrar" replace />;
  if (!usuario.admin || !usuario.pendente2fa) return <Navigate to={usuario.admin ? '/admin' : '/'} replace />;

  return (
    <div className="painel painel-form">
      <h1>Verificação em duas etapas</h1>
      {configurar ? (
        <>
          <p>
            Instale um autenticador (Google Authenticator, Microsoft Authenticator ou similar), escolha <strong>adicionar conta → outra conta / ler QR Code</strong> e aponte para o código abaixo.
          </p>
          {qr ? <img src={qr} alt="QR Code para o autenticador" width={220} height={220} style={{ margin: '0 auto 1rem' }} /> : <Carregando />}
          {segredo.data ? (
            <p className="pequeno">
              Ou digite a chave: <span className="codigo-2fa">{segredo.data.segredo}</span>
            </p>
          ) : null}
        </>
      ) : (
        <p>Digite o código de 6 números que aparece no seu autenticador.</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          verificar.mutate();
        }}
      >
        <Alerta tipo="erro">{verificar.error ? mensagemDeErro(verificar.error) : ''}</Alerta>
        <Campo rotulo="Código" nome="codigo">
          <input id="codigo" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} required />
        </Campo>
        <button type="submit" className="btn btn-primario btn-bloco" disabled={codigo.length !== 6 || verificar.isPending}>
          Confirmar
        </button>
      </form>
    </div>
  );
}
