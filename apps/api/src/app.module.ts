import { DynamicModule, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AcessoGuard } from './auth/acesso.guard';
import { AuthModule } from './auth/auth.module';
import { SegurancaModule } from './auth/seguranca.module';
import { SessaoMiddleware } from './auth/sessao.middleware';
import { CarrinhoModule } from './carrinho/carrinho.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { FiltroErros } from './comum/filtro-erros';
import { Config, CONFIG } from './config/config';
import { ContasModule } from './contas/contas.module';
import { DbModule } from './db/db.module';
import { EmailModule } from './email/email.module';
import { SaudeController } from './saude/saude.controller';
import { FreteModule } from './frete/frete.module';
import { PedidosModule } from './pedidos/pedidos.module';
import { PagamentosModule } from './pagamentos/pagamentos.module';
import { GatewayModule } from './pagamentos/gateway';
import { AdminModule } from './admin/admin.module';
import { ManutencaoModule } from './manutencao/manutencao.module';

@Module({})
class ConfigModule {
  static com(config: Config): DynamicModule {
    return { module: ConfigModule, global: true, providers: [{ provide: CONFIG, useValue: config }], exports: [CONFIG] };
  }
}

@Module({})
export class AppModule implements NestModule {
  static com(config: Config): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.com(config),
        LoggerModule.forRoot({
          pinoHttp: {
            level: config.LOG_NIVEL,
            quietReqLogger: true,
            genReqId: (req, res) => {
              const recebido = req.headers['x-request-id'];
              const id = typeof recebido === 'string' && /^[\w-]{8,64}$/.test(recebido) ? recebido : randomUUID();
              res.setHeader('X-Request-Id', id);
              return id;
            },
            redact: {
              paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]', '*.senha', '*.cpf', '*.telefone', '*.token'],
              censor: '***',
            },
            autoLogging: { ignore: (req) => req.url === '/api/health' },
            transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
          },
        }),
        ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }], skipIf: () => !config.limiteRequisicoesAtivo }),
        DbModule,
        SegurancaModule,
        EmailModule,
        GatewayModule,
        CatalogoModule,
        CarrinhoModule,
        AuthModule,
        ContasModule,
        FreteModule,
        PedidosModule,
        PagamentosModule,
        AdminModule,
        ManutencaoModule,
      ],
      controllers: [SaudeController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AcessoGuard },
        { provide: APP_FILTER, useClass: FiltroErros },
      ],
    };
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessaoMiddleware).forRoutes('{*caminho}');
  }
}
