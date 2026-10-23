import { Link } from 'react-router';

export function NaoEncontrado() {
  return (
    <div className="vazio painel">
      <h1>Página não encontrada</h1>
      <p>O endereço pode estar errado ou o produto saiu do catálogo.</p>
      <Link to="/" className="btn btn-primario">
        Voltar à loja
      </Link>
    </div>
  );
}
