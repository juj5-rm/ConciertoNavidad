import { IsInt, Max, Min } from 'class-validator';
import { POSTGRES_INT_MAX_VALUE } from '../../prisma/postgres.constants';

export class ActualizarCapacidadDto {
  @IsInt()
  @Min(1)
  @Max(POSTGRES_INT_MAX_VALUE)
  capacidadMaxima!: number;
}
