import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ActualizarEstadoOperadorDto } from './dto/actualizar-estado-operador.dto';
import { ActualizarOperadorDto } from './dto/actualizar-operador.dto';
import { CrearOperadorDto } from './dto/crear-operador.dto';
import { OperadorPublico, UsuariosService } from './usuarios.service';

@Controller('usuarios/operadores')
@Roles(RolUsuario.ADMIN)
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  async listar(): Promise<{ operadores: OperadorPublico[] }> {
    return { operadores: await this.usuariosService.listarOperadores() };
  }

  @Post()
  async crear(
    @Body() input: CrearOperadorDto,
  ): Promise<{ operador: OperadorPublico }> {
    return { operador: await this.usuariosService.crearOperador(input) };
  }

  @Patch(':id')
  async actualizar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: ActualizarOperadorDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ operador: OperadorPublico }> {
    return {
      operador: await this.usuariosService.actualizarOperador(
        id,
        request.user.id,
        input,
      ),
    };
  }

  @Patch(':id/estado')
  async actualizarEstado(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: ActualizarEstadoOperadorDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ operador: OperadorPublico }> {
    return {
      operador: await this.usuariosService.actualizarEstado(
        id,
        request.user.id,
        input.activo,
      ),
    };
  }
}
