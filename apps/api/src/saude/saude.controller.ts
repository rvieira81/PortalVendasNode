import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { Pool } from 'pg';
import { POOL } from '../db/db';

@ApiTags('Operação')
@SkipThrottle()
@Controller('health')
export class SaudeController {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  @Get()
  async verificar(@Res({ passthrough: true }) res: Response) {
    try {
      await this.pool.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'indisponivel' };
    }
  }
}
