import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerificarQrDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  codigoQr!: string;
}
