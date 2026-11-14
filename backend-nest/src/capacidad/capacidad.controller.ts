import { Body, Controller, Get, Patch } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActualizarCapacidadDto } from './dto/actualizar-capacidad.dto';
import { CapacidadService } from './capacidad.service';

@Controller('capacidad')
export class CapacidadController {
  constructor(private readonly capacidadService: CapacidadService) {}

  @Get()
  @Roles(RolUsuario.ADMIN)
  getSnapshot() {
    return this.capacidadService.getAdministrativeSnapshot();
  }

  @Patch()
  @Roles(RolUsuario.ADMIN)
  updateCapacity(@Body() dto: ActualizarCapacidadDto) {
    return this.capacidadService.updateMaximumCapacity(dto.capacidadMaxima);
  }
}
