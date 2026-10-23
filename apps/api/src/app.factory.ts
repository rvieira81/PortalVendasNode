import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Config } from './config/config';

/** Configura a aplicação (usado pelo main.ts e pelos testes de integração). */
export function configurarApp(app: NestExpressApplication, config: Config) {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');
  app.set('trust proxy', 1); // atrás do nginx: IP real para o rate limit e cookie Secure
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } }));
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '200kb' });

  const pastaImagens = resolve(config.IMAGENS_DIR);
  mkdirSync(pastaImagens, { recursive: true });
  app.useStaticAssets(pastaImagens, { prefix: '/api/imagens/', maxAge: '7d', immutable: true, index: false, dotfiles: 'deny', fallthrough: false });

  if (config.swagger) {
    const doc = new DocumentBuilder()
      .setTitle(`${config.NOME_LOJA} — API`)
      .setDescription('API REST do portal de vendas. Métodos que alteram dados exigem o cabeçalho X-CSRF-Token com o valor do cookie pv_csrf.')
      .setVersion('1.0')
      .addCookieAuth('pv_sessao')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
  }
  app.enableShutdownHooks();
}
