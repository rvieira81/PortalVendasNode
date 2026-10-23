import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { Config, CONFIG } from '../config/config';
import { BANCO, criarBanco, criarPool, POOL } from './db';

@Global()
@Module({
  providers: [
    { provide: POOL, inject: [CONFIG], useFactory: (c: Config) => criarPool(c.DATABASE_URL, c.DB_POOL_MAX) },
    { provide: BANCO, inject: [POOL], useFactory: (pool: Pool) => criarBanco(pool) },
  ],
  exports: [POOL, BANCO],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
