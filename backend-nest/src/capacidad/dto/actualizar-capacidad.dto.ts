import { IsInt, Max, Min } from 'class-validator';

export class ActualizarCapacidadDto {
  @IsInt()
  @Min(0)
  @Max(100)
  capacidadMaxima!: number;
}
