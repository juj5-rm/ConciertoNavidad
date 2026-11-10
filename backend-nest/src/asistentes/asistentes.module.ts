import { Module } from '@nestjs/common';
import { CapacidadModule } from '../capacidad/capacidad.module';
import { AsistentesService } from './asistentes.service';

@Module({
  imports: [CapacidadModule],
  providers: [AsistentesService],
  exports: [AsistentesService],
})
export class AsistentesModule {}
