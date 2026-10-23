import type { ReactNode } from 'react';
import { formatarMoeda } from '../util/formato';

export function Preco({ valor, de, grande }: { valor: number; de?: number | null; grande?: boolean }) {
  return (
    <span className={`etiqueta${grande ? ' etiqueta-grande' : ''}`}>
      {de ? <s aria-label={`De ${formatarMoeda(de)}`}>{formatarMoeda(de)}</s> : null}
      <span>{formatarMoeda(valor)}</span>
    </span>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="carregando" role="status">
      {texto}
    </div>
  );
}

export function Alerta({ tipo = 'info', children }: { tipo?: 'sucesso' | 'aviso' | 'erro' | 'info'; children: ReactNode }) {
  if (!children) return null;
  return (
    <div className={`alerta alerta-${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

interface CampoProps {
  rotulo: string;
  nome: string;
  erro?: string;
  dica?: string;
  children: ReactNode;
}

/** Rótulo + controle + mensagem de erro ligados por id (acessibilidade, RNF12). */
export function Campo({ rotulo, nome, erro, dica, children }: CampoProps) {
  return (
    <div className={`campo${erro ? ' invalido' : ''}`}>
      <label htmlFor={nome}>{rotulo}</label>
      {children}
      {dica && !erro ? <span className="dica">{dica}</span> : null}
      {erro ? (
        <span className="erro" id={`${nome}-erro`}>
          {erro}
        </span>
      ) : null}
    </div>
  );
}

export function Paginacao({ pagina, paginas, aoMudar }: { pagina: number; paginas: number; aoMudar: (p: number) => void }) {
  if (paginas <= 1) return null;
  const numeros = Array.from({ length: paginas }, (_, i) => i + 1).filter((n) => n === 1 || n === paginas || Math.abs(n - pagina) <= 2);
  return (
    <nav className="paginacao" aria-label="Paginação">
      <button type="button" disabled={pagina === 1} onClick={() => aoMudar(pagina - 1)}>
        ‹ Anterior
      </button>
      {numeros.map((n, i) => (
        <span key={n} style={{ display: 'contents' }}>
          {i > 0 && n - numeros[i - 1] > 1 ? <span aria-hidden="true">…</span> : null}
          <button type="button" aria-current={n === pagina ? 'page' : undefined} onClick={() => aoMudar(n)}>
            {n}
          </button>
        </span>
      ))}
      <button type="button" disabled={pagina === paginas} onClick={() => aoMudar(pagina + 1)}>
        Próxima ›
      </button>
    </nav>
  );
}

export function Quantidade({ valor, maximo, aoMudar, desabilitado }: { valor: number; maximo: number; aoMudar: (n: number) => void; desabilitado?: boolean }) {
  return (
    <div className="quantidade" role="group" aria-label="Quantidade">
      <button type="button" aria-label="Diminuir" disabled={desabilitado || valor <= 1} onClick={() => aoMudar(valor - 1)}>
        −
      </button>
      <span aria-live="polite">{valor}</span>
      <button type="button" aria-label="Aumentar" disabled={desabilitado || valor >= maximo} onClick={() => aoMudar(valor + 1)}>
        +
      </button>
    </div>
  );
}

export function Etapas({ atual }: { atual: 1 | 2 | 3 }) {
  const nomes = ['Carrinho', 'Entrega', 'Pagamento'];
  return (
    <ol className="etapas" aria-label="Etapas da compra">
      {nomes.map((nome, i) => (
        <li key={nome} className={i + 1 < atual ? 'feita' : i + 1 === atual ? 'atual' : ''} aria-current={i + 1 === atual ? 'step' : undefined}>
          {nome}
        </li>
      ))}
    </ol>
  );
}

export function SeloStatus({ status, texto }: { status: number; texto: string }) {
  return <span className={`selo selo-${status}`}>{texto}</span>;
}
