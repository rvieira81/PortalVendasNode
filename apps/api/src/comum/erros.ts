import { HttpException, HttpStatus } from '@nestjs/common';

/** Erro de regra de negócio: a mensagem é mostrada ao usuário. */
export class ErroNegocio extends HttpException {
  constructor(mensagem: string, status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY, extras?: Record<string, unknown>) {
    super({ mensagem, ...extras }, status);
  }
}

export class NaoEncontrado extends ErroNegocio {
  constructor(mensagem = 'Não encontrado.') {
    super(mensagem, HttpStatus.NOT_FOUND);
  }
}

export class NaoAutorizado extends ErroNegocio {
  constructor(mensagem = 'Entre na sua conta para continuar.') {
    super(mensagem, HttpStatus.UNAUTHORIZED);
  }
}

export class Proibido extends ErroNegocio {
  constructor(mensagem = 'Acesso negado.') {
    super(mensagem, HttpStatus.FORBIDDEN);
  }
}

export class Conflito extends ErroNegocio {
  constructor(mensagem: string, extras?: Record<string, unknown>) {
    super(mensagem, HttpStatus.CONFLICT, extras);
  }
}
