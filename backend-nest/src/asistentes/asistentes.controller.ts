import { Body, Controller, Get, Post } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AsistentesService } from './asistentes.service';
import { VerificarQrDto } from './dto/verificar-qr.dto';

@Controller('asistentes')
export class AsistentesController {
  constructor(private readonly asistentesService: AsistentesService) {}

  @Get()
  @Roles(RolUsuario.ADMIN)
  listar() {
    return this.asistentesService.listar();
  }

  @Post('verificar-qr')
  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  verificarQr(@Body() dto: VerificarQrDto) {
    return this.asistentesService.verificarIngreso(dto.codigoQr);
  }
}
