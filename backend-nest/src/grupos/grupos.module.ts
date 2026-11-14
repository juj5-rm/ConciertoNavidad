import { Module } from '@nestjs/common';
import { AsistentesModule } from '../asistentes/asistentes.module';
import { CapacidadModule } from '../capacidad/capacidad.module';
import { GruposController } from './grupos.controller';
import { GruposService } from './grupos.service';

@Module({
  imports: [AsistentesModule, CapacidadModule],
  controllers: [GruposController],
  providers: [GruposService],
  exports: [GruposService],
})
export class GruposModule {}
