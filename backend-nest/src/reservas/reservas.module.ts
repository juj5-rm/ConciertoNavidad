import { Module } from '@nestjs/common';
import { AsistentesModule } from '../asistentes/asistentes.module';
import { CapacidadModule } from '../capacidad/capacidad.module';
import { ReservasService } from './reservas.service';

@Module({
  imports: [AsistentesModule, CapacidadModule],
  providers: [ReservasService],
  exports: [ReservasService],
})
export class ReservasModule {}
