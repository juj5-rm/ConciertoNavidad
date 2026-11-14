import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  Equals,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CONSENT_VERSION } from '../consentimiento.constants';

export class InscripcionAdultoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nombre!: string;

  @IsEmail()
  @MaxLength(254)
  correo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  identificacion!: string;
}

export class InscripcionNinoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nombre!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  nacimiento!: string;
}

export class InscripcionGrupalDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InscripcionAdultoDto)
  adultos!: InscripcionAdultoDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => InscripcionNinoDto)
  ninos?: InscripcionNinoDto[];

  @Equals(true)
  consentimientoAceptado!: boolean;

  @Equals(CONSENT_VERSION)
  consentimientoVersion!: string;
}
