import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { CapacidadService } from './capacidad.service';

@Module({
  imports: [ConfiguracionModule],
  providers: [CapacidadService],
  exports: [CapacidadService],
})
export class CapacidadModule {}
