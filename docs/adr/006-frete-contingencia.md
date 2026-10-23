# ADR-006: Melhor Envio com contingência por faixa de CEP

**Contexto:** frete preciso por peso e medidas, sem parar as vendas se a API de frete cair.
**Decisão:** cotação no Melhor Envio (`/api/v2/me/shipment/calculate`, timeout 5 s); falha ou token ausente → tabela `faixa_frete`. O valor é sempre recotado no servidor ao criar o pedido.
**Consequências:** a tabela de contingência precisa ser mantida no painel; o log avisa quando ela é usada.
