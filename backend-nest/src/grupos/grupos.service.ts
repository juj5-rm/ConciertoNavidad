import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AsistenteRegistrado,
  AsistentesService,
  RegistroAsistenteInput,
} from '../asistentes/asistentes.service';
import { CapacidadService } from '../capacidad/capacidad.service';
import { PrismaService } from '../prisma/prisma.service';

export interface CrearGrupoInput {
  lider: RegistroAsistenteInput;
  miembros: RegistroAsistenteInput[];
}

export interface GrupoCreado {
  id: string;
  leaderId: string;
  lider: AsistenteRegistrado;
  miembros: AsistenteRegistrado[];
}

@Injectable()
export class GruposService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly asistentesService: AsistentesService,
    private readonly capacidadService: CapacidadService,
  ) {}

  async crear(input: CrearGrupoInput): Promise<GrupoCreado> {
    const participantes = this.validarParticipantes(input);
    const cantidadTotal = participantes.length;

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const capacidad =
            await this.capacidadService.getSnapshot(transaction);

          if (capacidad.disponibles < cantidadTotal) {
            throw new ConflictException(
              'No hay suficientes cupos disponibles para todo el grupo.',
            );
          }

          const numerosBoleta =
            await this.asistentesService.obtenerNumerosBoletaDisponibles(
              transaction,
              cantidadTotal,
            );

          const lider = await this.asistentesService.crearAsistente(
            transaction,
            participantes[0],
            numerosBoleta[0],
            null,
          );
          const grupo = await transaction.grupo.create({
            data: {
              leaderId: lider.id,
              createdById: null,
            },
            select: { id: true, leaderId: true },
          });

          const miembros: AsistenteRegistrado[] = [];
          for (let index = 1; index < participantes.length; index += 1) {
            miembros.push(
              await this.asistentesService.crearAsistente(
                transaction,
                participantes[index],
                numerosBoleta[index],
                grupo.id,
              ),
            );
          }

          return {
            ...grupo,
            lider,
            miembros,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'No fue posible asignar datos únicos a los integrantes del grupo.',
        );
      }

      throw new InternalServerErrorException('No fue posible crear el grupo.');
    }
  }

  private validarParticipantes(
    input: CrearGrupoInput,
  ): ReturnType<AsistentesService['validarDatos']>[] {
    if (!input || typeof input !== 'object' || !Array.isArray(input.miembros)) {
      throw new BadRequestException('Los datos del grupo no son válidos.');
    }

    const lider = this.asistentesService.validarDatos(input.lider);
    const miembros = input.miembros.map((miembro) =>
      this.asistentesService.validarDatos(miembro),
    );

    return [lider, ...miembros];
  }
}
