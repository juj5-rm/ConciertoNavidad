import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

function normalizeEmailInput(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class ActualizarOperadorDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => normalizeEmailInput(value))
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password?: string;
}
