/* Textos-modelo: precisam de revisão jurídica antes do go-live (PROJETO.md). */
export function Termos() {
  return (
    <article className="painel texto-legal">
      <h1>Termos de uso</h1>
      <p className="suave">Modelo — revisar com o jurídico antes de publicar.</p>
      <h2>1. Sobre a loja</h2>
      <p>Esta loja é operada por [RAZÃO SOCIAL], CNPJ [00.000.000/0000-00], com sede em [ENDEREÇO].</p>
      <h2>2. Cadastro</h2>
      <p>Para comprar é preciso informar nome, e-mail, CPF e telefone verdadeiros. Você é responsável pela guarda da sua senha.</p>
      <h2>3. Preços, estoque e pagamento</h2>
      <p>Os preços valem no momento da compra. Os itens ficam reservados até o fim do prazo de pagamento (30 minutos para Pix e até o vencimento do boleto). Pagamentos são processados pelo Mercado Pago.</p>
      <h2>4. Entrega</h2>
      <p>O prazo informado conta em dias úteis a partir da confirmação do pagamento.</p>
      <h2>5. Arrependimento e trocas</h2>
      <p>Você pode desistir da compra em até 7 dias após o recebimento (art. 49 do Código de Defesa do Consumidor).</p>
    </article>
  );
}

export function Privacidade() {
  return (
    <article className="painel texto-legal">
      <h1>Política de privacidade</h1>
      <p className="suave">Modelo — revisar com o jurídico antes de publicar.</p>
      <h2>Dados que coletamos</h2>
      <p>Nome, e-mail, CPF, telefone, endereços de entrega e histórico de pedidos. Dados de cartão são digitados no formulário seguro do Mercado Pago e não passam pelos nossos servidores.</p>
      <h2>Para que usamos</h2>
      <p>Processar pedidos, emitir nota fiscal, calcular o frete, entregar e falar com você sobre a compra.</p>
      <h2>Compartilhamento</h2>
      <p>Com o Mercado Pago (pagamento), transportadoras (entrega) e provedores de e-mail, apenas no necessário.</p>
      <h2>Seus direitos (LGPD)</h2>
      <p>Na área Minha conta você baixa seus dados e pode excluir a conta. Pedidos são mantidos pelo prazo exigido pela legislação fiscal.</p>
      <h2>Contato do encarregado</h2>
      <p>[NOME DO ENCARREGADO] — [E-MAIL]</p>
    </article>
  );
}
