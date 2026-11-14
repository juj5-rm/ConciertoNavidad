import { IsBoolean } from 'class-validator';

export class ActualizarEstadoOperadorDto {
  @IsBoolean()
  activo!: boolean;
}
