import { Body, Controller, Post } from '@nestjs/common';
import { TipoAsistente } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { InscripcionGrupalDto } from './dto/inscripcion-grupal.dto';
import { GruposService } from './grupos.service';

@Controller('grupos')
export class GruposController {
  constructor(private readonly gruposService: GruposService) {}

  @Post('inscripcion')
  @Public()
  async inscribir(@Body() dto: InscripcionGrupalDto) {
    const [lider, ...adultos] = dto.adultos;
    const resultado = await this.gruposService.crear({
      lider: {
        ...lider,
        tipo: TipoAsistente.ADULTO,
        nacimiento: null,
      },
      miembros: [
        ...adultos.map((adulto) => ({
          ...adulto,
          tipo: TipoAsistente.ADULTO,
          nacimiento: null,
        })),
        ...(dto.ninos ?? []).map((nino) => ({
          ...nino,
          tipo: TipoAsistente.NINO,
          correo: null,
          identificacion: null,
        })),
      ],
      consentimientoAceptado: dto.consentimientoAceptado,
      consentimientoVersion: dto.consentimientoVersion,
    });

    return {
      asistentes: [resultado.lider, ...resultado.miembros].map(
        ({ nombre, tipo, codigoQr, numeroBoleta }) => ({
          nombre,
          tipo,
          codigoQr,
          numeroBoleta,
        }),
      ),
    };
  }
}
