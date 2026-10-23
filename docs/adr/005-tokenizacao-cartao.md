# ADR-005: Cartão tokenizado no navegador (PCI SAQ A)

**Contexto:** aceitar cartão sem levar o servidor para o escopo PCI completo.
**Decisão:** Card Payment Brick do Mercado Pago (`@mercadopago/sdk-react`). O navegador envia ao Mercado Pago os dados do cartão e recebe um `token`; a API recebe só token, bandeira, parcelas e e-mail do pagador.
**Consequências:** o servidor guarda só bandeira e últimos 4 dígitos; a CSP precisa liberar os domínios do Mercado Pago.
