/** Relógio injetável: nos testes dá para avançar o tempo (expiração de Pix, tokens, TOTP). */
export abstract class Relogio {
  abstract agora(): Date;
}

export class RelogioSistema extends Relogio {
  agora() {
    return new Date();
  }
}
