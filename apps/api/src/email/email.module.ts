import { Global, Module } from '@nestjs/common';
import { EmailService, EnvioEmail, EnvioEmailSmtp } from './email.service';

@Global()
@Module({
  providers: [{ provide: EnvioEmail, useClass: EnvioEmailSmtp }, EmailService],
  exports: [EmailService, EnvioEmail],
})
export class EmailModule {}
