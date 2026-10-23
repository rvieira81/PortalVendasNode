import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Res, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { z } from 'zod';
import { UsuarioAtual, UsuarioSessao } from '../comum/contexto';
import { NaoEncontrado } from '../comum/erros';
import { idParam, texto, textoOpcional, Validar } from '../comum/zod';
import { Autenticado } from '../auth/acesso.guard';
import { SessaoService } from '../auth/sessao.service';
import { ContasService } from './contas.service';
import { ServicoCep } from './cep.service';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] as const;

export const esquemaEndereco = z.object({
  apelido: texto(50, 'Apelido'),
  destinatario: texto(150, 'Destinatário'),
  cep: z.string().trim().refine((c) => /^\d{8}$/.test(c.replace(/\D/g, '')), 'CEP com 8 números.'),
  logradouro: texto(200, 'Rua'),
  numero: texto(20, 'Número'),
  complemento: textoOpcional(100),
  bairro: texto(100, 'Bairro'),
  cidade: texto(100, 'Cidade'),
  uf: z.string().trim().toUpperCase().pipe(z.enum(UFS, { error: 'UF inválida.' })),
  padrao: z.boolean().default(false),
});

const perfil = z.object({
  nome: texto(150, 'Nome'),
  telefone: z.string().trim().refine((t) => /^\d{10,11}$/.test(t.replace(/\D/g, '')), 'Telefone com DDD.').optional(),
});

@ApiTags('Conta do cliente')
@Controller()
export class ContasController {
  constructor(
    private readonly contas: ContasService,
    private readonly cep: ServicoCep,
    private readonly sessao: SessaoService,
  ) {}

  @Get('cep/:cep')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async consultarCep(@Param('cep', new Validar(z.string().regex(/^\d{5}-?\d{3}$/, 'CEP inválido.'))) cep: string) {
    try {
      const endereco = await this.cep.consultar(cep);
      if (!endereco) throw new NaoEncontrado('CEP não encontrado. Preencha o endereço manualmente.');
      return endereco;
    } catch (erro) {
      if (erro instanceof NaoEncontrado) throw erro;
      throw new ServiceUnavailableException({ mensagem: 'Consulta de CEP indisponível. Preencha o endereço manualmente.' });
    }
  }

  @Get('conta')
  @Autenticado()
  perfil(@UsuarioAtual() u: UsuarioSessao) {
    return this.contas.perfil(u.id);
  }

  @Patch('conta')
  @Autenticado()
  atualizarPerfil(@UsuarioAtual() u: UsuarioSessao, @Body(new Validar(perfil)) dados: z.infer<typeof perfil>) {
    return this.contas.atualizarPerfil(u.id, dados);
  }

  @Get('conta/dados')
  @Autenticado()
  exportar(@UsuarioAtual() u: UsuarioSessao, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Content-Disposition', 'attachment; filename="meus-dados.json"');
    return this.contas.exportarDados(u.id);
  }

  @Post('conta/excluir')
  @HttpCode(200)
  @Autenticado()
  async excluir(@UsuarioAtual() u: UsuarioSessao, @Res({ passthrough: true }) res: Response, @Body(new Validar(z.object({ senha: z.string().min(1).max(128) }))) corpo: { senha: string }) {
    await this.contas.anonimizar(u.id, corpo.senha);
    this.sessao.encerrar(res);
    return { mensagem: 'Sua conta foi excluída. Os pedidos ficam guardados apenas para fins fiscais.' };
  }

  @Get('conta/enderecos')
  @Autenticado()
  enderecos(@UsuarioAtual() u: UsuarioSessao) {
    return this.contas.enderecos(u.id);
  }

  @Post('conta/enderecos')
  @Autenticado()
  criarEndereco(@UsuarioAtual() u: UsuarioSessao, @Body(new Validar(esquemaEndereco)) dados: z.infer<typeof esquemaEndereco>) {
    return this.contas.salvarEndereco(u.id, dados);
  }

  @Put('conta/enderecos/:id')
  @Autenticado()
  alterarEndereco(@UsuarioAtual() u: UsuarioSessao, @Param('id', new Validar(idParam)) id: number, @Body(new Validar(esquemaEndereco)) dados: z.infer<typeof esquemaEndereco>) {
    return this.contas.salvarEndereco(u.id, dados, id);
  }

  @Delete('conta/enderecos/:id')
  @HttpCode(204)
  @Autenticado()
  async excluirEndereco(@UsuarioAtual() u: UsuarioSessao, @Param('id', new Validar(idParam)) id: number) {
    await this.contas.excluirEndereco(u.id, id);
  }
}
