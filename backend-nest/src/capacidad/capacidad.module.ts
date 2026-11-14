import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { CapacidadController } from './capacidad.controller';
import { CapacidadService } from './capacidad.service';

@Module({
  imports: [ConfiguracionModule],
  controllers: [CapacidadController],
  providers: [CapacidadService],
  exports: [CapacidadService],
})
export class CapacidadModule {}
