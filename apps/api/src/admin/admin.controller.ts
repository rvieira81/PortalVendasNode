import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { UsuarioAtual, UsuarioSessao } from '../comum/contexto';
import { idParam, texto, Validar } from '../comum/zod';
import { SomenteAdmin } from '../auth/acesso.guard';
import { StatusPedido } from '../dominio/status';
import { AdminCatalogoService } from './admin-catalogo.service';
import { AdminVendasService } from './admin-vendas.service';
import { TAMANHO_MAXIMO_IMAGEM } from './imagens';

const positivo = (rotulo: string) => z.number({ error: `${rotulo} é obrigatório.` }).positive(`${rotulo} precisa ser maior que zero.`);

const produtoEsquema = z.object({
  categoriaId: z.number().int().positive('Escolha a categoria.'),
  sku: z.string().trim().regex(/^[A-Za-z0-9._-]{2,50}$/, 'SKU: letras, números, ponto, hífen ou sublinhado.'),
  nome: texto(200, 'Nome'),
  descricao: z.string().trim().max(4000).default(''),
  preco: positivo('Preço').max(1_000_000),
  precoDe: z.number().positive().max(1_000_000).nullable().default(null),
  estoque: z.number().int().min(0, 'Estoque não pode ser negativo.').max(1_000_000),
  pesoKg: positivo('Peso').max(1000),
  alturaCm: positivo('Altura').max(1000),
  larguraCm: positivo('Largura').max(1000),
  comprimentoCm: positivo('Comprimento').max(1000),
  ativo: z.boolean().default(true),
});

const categoriaEsquema = z.object({ nome: texto(100, 'Nome'), ativa: z.boolean().default(true) });
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((d) => new Date(`${d}T03:00:00Z`)); // meia-noite em Brasília

const filtroPedidos = z.object({
  status: z.coerce.number().int().optional(),
  de: data.optional(),
  ate: data.optional(),
  busca: z.string().trim().max(100).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
});

const mudarStatus = z.object({
  status: z.union([z.literal(StatusPedido.EmSeparacao), z.literal(StatusPedido.Enviado), z.literal(StatusPedido.Entregue)]),
  codigoRastreio: z.string().trim().max(50).optional(),
  observacao: z.string().trim().max(300).optional(),
});

const configuracoesEsquema = z.object({
  cepOrigem: z.string().trim().transform((c) => c.replace(/\D/g, '')).pipe(z.string().length(8, 'CEP de origem com 8 números.')),
  diasManuseio: z.number().int().min(0).max(30),
  freteGratisAPartirDe: z.number().min(0),
  parcelasMaximas: z.number().int().min(1).max(12),
  parcelaMinima: z.number().min(1),
});

const cep8 = z.string().trim().transform((c) => c.replace(/\D/g, '')).pipe(z.string().length(8, 'CEP com 8 números.'));
const faixaEsquema = z.object({
  descricao: texto(100, 'Descrição'),
  cepInicio: cep8,
  cepFim: cep8,
  valor: z.number().min(0),
  prazoDias: z.number().int().positive(),
  ativa: z.boolean().default(true),
});

@ApiTags('Administração')
@Controller('admin')
@SomenteAdmin()
export class AdminController {
  constructor(
    private readonly catalogo: AdminCatalogoService,
    private readonly vendas: AdminVendasService,
  ) {}

  /* Painel */
  @Get('painel')
  painel(@Query(new Validar(z.object({ de: data.optional(), ate: data.optional() }))) q: { de?: Date; ate?: Date }) {
    const ate = q.ate ? new Date(q.ate.getTime() + 86_400_000) : new Date();
    const de = q.de ?? new Date(ate.getTime() - 30 * 86_400_000);
    return this.vendas.painel(de, ate);
  }

  /* Produtos (RF17) */
  @Get('produtos')
  produtos(@Query(new Validar(z.object({ busca: z.string().trim().max(100).optional(), pagina: z.coerce.number().int().min(1).default(1) }))) q: { busca?: string; pagina: number }) {
    return this.catalogo.listarProdutos(q.busca, q.pagina);
  }

  @Get('produtos/:id')
  produto(@Param('id', new Validar(idParam)) id: number) {
    return this.catalogo.produto(id);
  }

  @Post('produtos')
  criarProduto(@UsuarioAtual() u: UsuarioSessao, @Body(new Validar(produtoEsquema)) d: z.infer<typeof produtoEsquema>) {
    return this.catalogo.salvarProduto(d, u.email);
  }

  @Put('produtos/:id')
  alterarProduto(@UsuarioAtual() u: UsuarioSessao, @Param('id', new Validar(idParam)) id: number, @Body(new Validar(produtoEsquema)) d: z.infer<typeof produtoEsquema>) {
    return this.catalogo.salvarProduto(d, u.email, id);
  }

  @Patch('produtos/:id/ativo')
  @HttpCode(204)
  async ativo(@UsuarioAtual() u: UsuarioSessao, @Param('id', new Validar(idParam)) id: number, @Body(new Validar(z.object({ ativo: z.boolean() }))) d: { ativo: boolean }) {
    await this.catalogo.alterarAtivo(id, d.ativo, u.email);
  }

  @Delete('produtos/:id')
  excluirProduto(@UsuarioAtual() u: UsuarioSessao, @Param('id', new Validar(idParam)) id: number) {
    return this.catalogo.excluirProduto(id, u.email);
  }

  @Post('produtos/:id/imagens')
  @UseInterceptors(FilesInterceptor('imagens', 8, { limits: { fileSize: TAMANHO_MAXIMO_IMAGEM, files: 8 } }))
  imagens(@Param('id', new Validar(idParam)) id: number, @UploadedFiles() arquivos: Express.Multer.File[] = []) {
    return this.catalogo.adicionarImagens(id, arquivos);
  }

  @Delete('produtos/:id/imagens/:imagemId')
  removerImagem(@Param('id', new Validar(idParam)) id: number, @Param('imagemId', new Validar(idParam)) imagemId: number) {
    return this.catalogo.removerImagem(id, imagemId);
  }

  /* Categorias */
  @Get('categorias')
  categorias() {
    return this.catalogo.listarCategorias();
  }

  @Post('categorias')
  criarCategoria(@Body(new Validar(categoriaEsquema)) d: z.infer<typeof categoriaEsquema>) {
    return this.catalogo.salvarCategoria(d);
  }

  @Put('categorias/:id')
  alterarCategoria(@Param('id', new Validar(idParam)) id: number, @Body(new Validar(categoriaEsquema)) d: z.infer<typeof categoriaEsquema>) {
    return this.catalogo.salvarCategoria(d, id);
  }

  /* Pedidos (RF18) */
  @Get('pedidos')
  pedidos(@Query(new Validar(filtroPedidos)) f: z.infer<typeof filtroPedidos>) {
    return this.vendas.listarPedidos({ ...f, ate: f.ate ? new Date(f.ate.getTime() + 86_400_000) : undefined });
  }

  @Get('pedidos/:id')
  pedido(@Param('id', new Validar(idParam)) id: number) {
    return this.vendas.pedido(id);
  }

  @Post('pedidos/:id/status')
  @HttpCode(200)
  status(@UsuarioAtual() u: UsuarioSessao, @Param('id', new Validar(idParam)) id: number, @Body(new Validar(mudarStatus)) d: z.infer<typeof mudarStatus>) {
    return this.vendas.mudarStatus(id, d.status, u.email, d.codigoRastreio, d.observacao);
  }

  @Post('pedidos/:id/cancelar')
  @HttpCode(200)
  cancelar(@UsuarioAtual() u: UsuarioSessao, @Param('id', new Validar(idParam)) id: number, @Body(new Validar(z.object({ motivo: texto(300, 'Motivo') }))) d: { motivo: string }) {
    return this.vendas.cancelar(id, u.email, d.motivo);
  }

  /* Configurações e frete (RF19) */
  @Get('configuracoes')
  configuracoes() {
    return this.vendas.configuracoes();
  }

  @Put('configuracoes')
  salvarConfiguracoes(@UsuarioAtual() u: UsuarioSessao, @Body(new Validar(configuracoesEsquema)) d: z.infer<typeof configuracoesEsquema>) {
    return this.vendas.salvarConfiguracoes(d, u.email);
  }

  @Get('faixas-frete')
  faixas() {
    return this.vendas.faixas();
  }

  @Post('faixas-frete')
  criarFaixa(@Body(new Validar(faixaEsquema)) d: z.infer<typeof faixaEsquema>) {
    return this.vendas.salvarFaixa(d);
  }

  @Put('faixas-frete/:id')
  alterarFaixa(@Param('id', new Validar(idParam)) id: number, @Body(new Validar(faixaEsquema)) d: z.infer<typeof faixaEsquema>) {
    return this.vendas.salvarFaixa(d, id);
  }

  @Delete('faixas-frete/:id')
  excluirFaixa(@Param('id', new Validar(idParam)) id: number) {
    return this.vendas.excluirFaixa(id);
  }
}
