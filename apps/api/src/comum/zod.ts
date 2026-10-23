import { BadRequestException, PipeTransform } from '@nestjs/common';
import { z, ZodType } from 'zod';

/** Valida corpo/query/parâmetro com zod e devolve 400 com as mensagens por campo. */
export class Validar<T extends ZodType> implements PipeTransform {
  constructor(private readonly esquema: T) {}

  transform(valor: unknown): z.infer<T> {
    const resultado = this.esquema.safeParse(valor);
    if (resultado.success) return resultado.data;
    const campos: Record<string, string> = {};
    for (const problema of resultado.error.issues) {
      const chave = problema.path.join('.') || '_';
      campos[chave] ??= problema.message;
    }
    throw new BadRequestException({ mensagem: 'Confira os campos destacados.', campos });
  }
}

export const idParam = z.coerce.number().int().positive();

/** Texto obrigatório, sem espaços nas pontas. */
export const texto = (max: number, rotulo = 'Campo') =>
  z.string({ error: `${rotulo} é obrigatório.` }).trim().min(1, `${rotulo} é obrigatório.`).max(max, `${rotulo}: máximo de ${max} caracteres.`);

export const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
