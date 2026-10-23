# Scripts de reversão

Para cada `migrations/V00N__nome.sql` reversível, crie aqui `R00N__nome.sql` que desfaz a mudança
e apaga a linha correspondente em `schema_versao`. A V001 (criação do esquema) não tem reversão:
nesse caso, restaure o backup feito antes do deploy (ver docs/06-implantacao.md, seção 7).
