import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { EstadoReserva, Prisma } from '@prisma/client';
import {
  AsistenteRegistrado,
  AsistentesService,
  RegistroAsistenteInput,
} from '../asistentes/asistentes.service';
import { CapacidadService } from '../capacidad/capacidad.service';
import { PrismaService } from '../prisma/prisma.service';

const VIGENCIA_RESERVA_MS = 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;
const TOKEN_HEX_PATTERN = /^[a-fA-F0-9]{64}$/;

export interface ReservaCreada {
  id: string;
  cantidad: number;
  estado: EstadoReserva;
  createdAt: Date;
  expiracion: Date;
  token: string;
}

export interface ReservaConfirmada {
  id: string;
  estado: EstadoReserva;
  usedAt: Date;
  asistentes: AsistenteRegistrado[];
}

export interface ExpiracionReservasResultado {
  cantidad: number;
}

@Injectable()
export class ReservasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly asistentesService: AsistentesService,
    private readonly capacidadService: CapacidadService,
  ) {}

  async crear(cantidad: number): Promise<ReservaCreada> {
    this.validarCantidad(cantidad);
    const token = randomBytes(TOKEN_BYTES).toString('hex');
    const tokenHash = this.calcularHashToken(token);

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const capacidad =
            await this.capacidadService.getSnapshot(transaction);

          if (capacidad.disponibles < cantidad) {
            throw new ConflictException(
              'No hay suficientes cupos disponibles para esta reserva.',
            );
          }

          const createdAt = new Date();
          const expiracion = new Date(
            createdAt.getTime() + VIGENCIA_RESERVA_MS,
          );
          const reserva = await transaction.reserva.create({
            data: {
              cantidad,
              tokenHash,
              estado: EstadoReserva.PENDIENTE,
              createdAt,
              expiracion,
            },
            select: {
              id: true,
              cantidad: true,
              estado: true,
              createdAt: true,
              expiracion: true,
            },
          });

          return { ...reserva, token };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      this.lanzarErrorControlado(error, 'No fue posible crear la reserva.');
    }
  }

  async confirmar(
    token: string,
    asistentes: RegistroAsistenteInput[],
  ): Promise<ReservaConfirmada> {
    if (typeof token !== 'string' || !TOKEN_HEX_PATTERN.test(token)) {
      throw new BadRequestException('El token de reserva no es válido.');
    }
    const tokenHash = this.calcularHashToken(token);

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          await this.capacidadService.getSnapshot(transaction);

          const reserva = await transaction.reserva.findUnique({
            where: { tokenHash },
            select: {
              id: true,
              cantidad: true,
              estado: true,
              expiracion: true,
            },
          });

          if (!reserva) {
            throw new NotFoundException('Reserva no disponible o inexistente.');
          }
          if (reserva.estado !== EstadoReserva.PENDIENTE) {
            throw new NotFoundException('Reserva no disponible o inexistente.');
          }

          const now = new Date();
          if (reserva.expiracion.getTime() <= now.getTime()) {
            throw new NotFoundException('Reserva no disponible o inexistente.');
          }
          if (!Array.isArray(asistentes)) {
            throw new BadRequestException(
              'Debe proporcionar los datos de cada asistente reservado.',
            );
          }
          if (asistentes.length !== reserva.cantidad) {
            throw new BadRequestException(
              'Debe proporcionar exactamente un asistente por cada cupo reservado.',
            );
          }
          const datosValidados = asistentes.map((asistente) =>
            this.asistentesService.validarDatos(asistente),
          );

          const numerosBoleta =
            await this.asistentesService.obtenerNumerosBoletaDisponibles(
              transaction,
              reserva.cantidad,
            );
          const asistentesCreados: AsistenteRegistrado[] = [];

          for (let index = 0; index < reserva.cantidad; index += 1) {
            asistentesCreados.push(
              await this.asistentesService.crearAsistente(
                transaction,
                datosValidados[index],
                numerosBoleta[index],
                null,
              ),
            );
          }

          const reservaUsada = await transaction.reserva.update({
            where: { id: reserva.id },
            data: {
              estado: EstadoReserva.USADA,
              usedAt: now,
            },
            select: { id: true, estado: true, usedAt: true },
          });

          if (!reservaUsada.usedAt) {
            throw new InternalServerErrorException(
              'No fue posible confirmar la reserva.',
            );
          }

          return {
            ...reservaUsada,
            usedAt: reservaUsada.usedAt,
            asistentes: asistentesCreados,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      this.lanzarErrorControlado(error, 'No fue posible confirmar la reserva.');
    }
  }

  async expirarPendientesVencidas(): Promise<ExpiracionReservasResultado> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          await this.capacidadService.getSnapshot(transaction);
          const now = new Date();
          const resultado = await transaction.reserva.updateMany({
            where: {
              estado: EstadoReserva.PENDIENTE,
              expiracion: { lte: now },
            },
            data: { estado: EstadoReserva.EXPIRADA },
          });

          return { cantidad: resultado.count };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      this.lanzarErrorControlado(
        error,
        'No fue posible actualizar las reservas vencidas.',
      );
    }
  }

  private validarCantidad(cantidad: number): void {
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new BadRequestException(
        'La cantidad de cupos debe ser un entero mayor que cero.',
      );
    }
  }

  private calcularHashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private lanzarErrorControlado(error: unknown, mensaje: string): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'No fue posible completar la operación por un conflicto de unicidad.',
      );
    }

    throw new InternalServerErrorException(mensaje);
  }
}
