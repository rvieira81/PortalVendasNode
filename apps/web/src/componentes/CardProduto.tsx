import { Link } from 'react-router';
import type { ProdutoResumo } from '../api/tipos';
import { Preco } from './Basicos';

export function CardProduto({ produto }: { produto: ProdutoResumo }) {
  const desconto = produto.precoDe ? Math.round((1 - produto.preco / produto.precoDe) * 100) : 0;
  return (
    <article className="card-produto">
      <Link to={`/produto/${produto.slug}`} className="cobre">
        <div className="foto">
          {produto.imagem ? <img src={produto.imagem} alt="" loading="lazy" width={400} height={400} /> : <span className="suave">Sem foto</span>}
        </div>
        {produto.esgotado ? <span className="marca-esgotado">Esgotado</span> : null}
        {desconto > 0 && !produto.esgotado ? <span className="marca-oferta">-{desconto}%</span> : null}
        <div className="corpo">
          <span className="categoria">{produto.categoria}</span>
          <h3>{produto.nome}</h3>
          <div className="rodape-card">
            <Preco valor={produto.preco} de={produto.precoDe} />
          </div>
        </div>
      </Link>
    </article>
  );
}
