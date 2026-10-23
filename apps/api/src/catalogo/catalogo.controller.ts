import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Validar } from '../comum/zod';
import { CatalogoService } from './catalogo.service';

const filtroVitrine = z.object({
  busca: z.string().trim().max(100).optional(),
  categoria: z.string().trim().max(120).optional(),
  precoMin: z.coerce.number().min(0).optional(),
  precoMax: z.coerce.number().min(0).optional(),
  ordem: z.enum(['recentes', 'menor-preco', 'maior-preco', 'nome']).optional(),
  pagina: z.coerce.number().int().min(1).max(10_000).optional(),
});

@ApiTags('Catálogo')
@Controller()
export class CatalogoController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get('categorias')
  categorias() {
    return this.catalogo.categorias();
  }

  @Get('produtos')
  vitrine(@Query(new Validar(filtroVitrine)) filtro: z.infer<typeof filtroVitrine>) {
    return this.catalogo.vitrine(filtro);
  }

  @Get('produtos/:slug')
  detalhe(@Param('slug', new Validar(z.string().max(220))) slug: string) {
    return this.catalogo.detalhe(slug);
  }
}
