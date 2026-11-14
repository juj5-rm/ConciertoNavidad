import { Module } from '@nestjs/common';
import { CapacidadModule } from '../capacidad/capacidad.module';
import { AsistentesController } from './asistentes.controller';
import { AsistentesService } from './asistentes.service';

@Module({
  imports: [CapacidadModule],
  controllers: [AsistentesController],
  providers: [AsistentesService],
  exports: [AsistentesService],
})
export class AsistentesModule {}
