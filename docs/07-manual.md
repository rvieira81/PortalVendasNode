# 07 — Manual do usuário

## Cliente

1. **Encontrar produtos:** use a busca no topo (não precisa acento) ou as categorias. Ordene por preço e filtre por faixa.
2. **Carrinho:** "Comprar agora" leva direto ao carrinho; "Adicionar ao carrinho" continua na página. Até 10 unidades por produto, limitado ao estoque.
3. **Conta:** cadastro com nome, e-mail, CPF, celular e senha. Confirme o e-mail pelo link recebido — sem isso não é possível finalizar a compra.
4. **Entrega:** escolha ou cadastre o endereço (o CEP preenche a rua) e a opção de frete.
5. **Pagamento:** Pix (QR Code válido por 30 min, confirma sozinho), cartão em até 12x (dados digitados no formulário seguro do Mercado Pago) ou boleto (vence em 3 dias úteis). Os itens ficam reservados até o fim do prazo.
6. **Acompanhar:** em *Minha conta → Meus pedidos* aparecem status, rastreio e o histórico. Dá para cancelar enquanto o pedido não entrou em separação; se já foi pago, o estorno é automático.
7. **Privacidade:** em *Minha conta* você baixa seus dados ou exclui a conta.

## Administrador

1. **Acesso:** entre em `/conta/entrar` com e-mail e senha. Na primeira vez, leia o QR Code com o Google ou Microsoft Authenticator (opção "outra conta") e digite o código. Nas próximas, só o código.
2. **Visão geral:** faturamento, pedidos pagos, ticket médio e mais vendidos no período.
3. **Pedidos:** filtre por status, período, número ou e-mail. Fluxo: *Pago → Em separação → Enviado* (informe o rastreio) *→ Entregue*. Cancelar estorna o pagamento e devolve o estoque.
4. **Produtos:** cadastre preço, preço "de" (opcional, aparece riscado), estoque, **peso e medidas da embalagem** (usados no frete) e até 8 fotos JPG/PNG/WebP de até 2 MB. Produto que já vendeu não é apagado, só desativado.
5. **Categorias:** crie, renomeie e desative.
6. **Frete e pagamento:** CEP de origem, dias de manuseio, frete grátis a partir de um valor, parcelas máximas e parcela mínima, e a tabela de contingência por faixa de CEP (usada se o Melhor Envio sair do ar).
