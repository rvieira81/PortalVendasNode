export interface Categoria {
  id: number;
  nome: string;
  slug: string;
}

export interface ProdutoResumo {
  id: number;
  nome: string;
  slug: string;
  preco: number;
  precoDe: number | null;
  disponivel: number;
  esgotado: boolean;
  categoria: string;
  categoriaSlug: string;
  imagem: string | null;
}

export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  paginas: number;
}

export interface ProdutoDetalhe extends Omit<ProdutoResumo, 'categoria' | 'categoriaSlug' | 'imagem'> {
  sku: string;
  descricao: string;
  maximoNoCarrinho: number;
  parcelas: { quantidade: number; valor: number };
  dimensoes: { pesoKg: number; alturaCm: number; larguraCm: number; comprimentoCm: number };
  categoria: { nome: string; slug: string };
  imagens: string[];
}

export interface ItemCarrinho {
  produtoId: number;
  nome: string;
  slug: string;
  imagem: string | null;
  quantidade: number;
  maximo: number;
  precoUnitario: number;
  precoAnterior: number | null;
  total: number;
  problemas: string[];
}

export interface Carrinho {
  itens: ItemCarrinho[];
  quantidadeItens: number;
  subtotal: number;
  avisos: string[];
  podeFinalizar: boolean;
  aviso?: string;
}

export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  admin: boolean;
  emailConfirmado: boolean;
  pendente2fa: 'configurar' | 'verificar' | null;
}

export interface Endereco {
  id: number;
  apelido: string;
  destinatario: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  padrao: boolean;
}

export type DadosEndereco = Omit<Endereco, 'id'>;

export interface OpcaoFrete {
  codigo: string;
  descricao: string;
  valor: number;
  prazoDias: number;
  gratis: boolean;
}

export enum StatusPedido {
  AguardandoPagamento = 1,
  PagamentoEmAnalise = 2,
  Pago = 3,
  EmSeparacao = 4,
  Enviado = 5,
  Entregue = 6,
  Cancelado = 9,
}

export enum MetodoPagamento {
  Pix = 1,
  Cartao = 2,
  Boleto = 3,
}

export enum StatusPagamento {
  Pendente = 1,
  EmAnalise = 2,
  Aprovado = 3,
  Recusado = 4,
  Cancelado = 5,
  Estornado = 6,
  Contestado = 7,
}

export interface Pagamento {
  id: number;
  metodo: MetodoPagamento;
  status: StatusPagamento;
  statusDetalhe: string | null;
  valor: number;
  parcelas: number | null;
  bandeira: string | null;
  ultimosDigitos: string | null;
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  boletoUrl: string | null;
  boletoLinhaDigitavel: string | null;
  expiraEm: string | null;
}

export interface PedidoResumo {
  id: number;
  status: StatusPedido;
  statusDescricao: string;
  total: number;
  criadoEm: string;
  itens: number;
}

export interface Pedido {
  id: number;
  status: StatusPedido;
  statusDescricao: string;
  criadoEm: string;
  expiraEm: string | null;
  subtotal: number;
  frete: number;
  desconto: number;
  total: number;
  freteDescricao: string;
  fretePrazoDias: number;
  codigoRastreio: string | null;
  motivoCancelamento: string | null;
  entrega: Omit<Endereco, 'id' | 'apelido' | 'padrao'>;
  itens: { produtoId: number; nome: string; sku: string; quantidade: number; precoUnitario: number; total: number; imagem: string | null }[];
  historico: { status: StatusPedido; descricao: string; observacao: string | null; criadoEm: string; autor?: string }[];
  pagamento: Pagamento | null;
  podeCancelar: boolean;
  podePagar: boolean;
  recusa?: string;
  cliente?: { nome: string; email: string };
}

export interface ConfigPagamento {
  publicKey: string;
  parcelasMaximas: number;
  parcelaMinima: number;
  configurado: boolean;
}
