import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request, Response } from 'express';

/** Erros de negócio → {mensagem}; qualquer outro → 500 genérico com reqId (o detalhe vai só para o log). */
@Catch()
export class FiltroErros implements ExceptionFilter {
  private readonly logger = new Logger('Erros');

  catch(erro: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const resposta = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const reqId = String(req.id ?? '');

    if (erro instanceof ThrottlerException) {
      return resposta.status(HttpStatus.TOO_MANY_REQUESTS).json({ mensagem: 'Muitas tentativas. Aguarde um pouco e tente de novo.' });
    }
    if (erro instanceof HttpException) {
      const status = erro.getStatus();
      const corpo = erro.getResponse();
      if (typeof corpo === 'object' && corpo && 'mensagem' in corpo) return resposta.status(status).json(corpo);
      const mensagens: Record<number, string> = {
        400: 'Requisição inválida.',
        401: 'Entre na sua conta para continuar.',
        403: 'Acesso negado.',
        404: 'Não encontrado.',
        413: 'Arquivo muito grande.',
      };
      return resposta.status(status).json({ mensagem: mensagens[status] ?? 'Não foi possível concluir a operação.' });
    }
    this.logger.error({ err: erro, reqId, url: req.originalUrl }, 'Erro não tratado');
    return resposta.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ mensagem: 'Erro inesperado. Tente de novo em instantes.', reqId });
  }
}
