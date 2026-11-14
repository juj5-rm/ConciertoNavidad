import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { EstadoReserva, Prisma } from '@prisma/client';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { PrismaService } from '../prisma/prisma.service';

export interface CapacidadSnapshot {
  capacidadMaxima: number;
  asistentesRegistrados: number;
  reservasVigentes: number;
  ocupacionTotal: number;
  disponibles: number;
}

@Injectable()
export class CapacidadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracionService: ConfiguracionService,
  ) {}

  async getSnapshot(
    transaction: Prisma.TransactionClient,
  ): Promise<CapacidadSnapshot> {
    const snapshot = await this.readSnapshot(transaction);

    if (snapshot.ocupacionTotal > snapshot.capacidadMaxima) {
      throw new ConflictException(
        'La ocupación actual supera la capacidad configurada.',
      );
    }

    return snapshot;
  }

  async getAdministrativeSnapshot(): Promise<CapacidadSnapshot> {
    try {
      return await this.prisma.$transaction(
        (transaction) => this.readSnapshot(transaction),
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        'No fue posible consultar la capacidad del evento.',
      );
    }
  }

  async updateMaximumCapacity(
    capacidadMaxima: number,
  ): Promise<CapacidadSnapshot> {
    this.configuracionService.validateCapacityValue(capacidadMaxima);

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const snapshot = await this.readSnapshot(transaction);
          this.configuracionService.validateCapacityChange(
            capacidadMaxima,
            snapshot.ocupacionTotal,
          );
          await this.configuracionService.updateCapacityConfiguration(
            capacidadMaxima,
            transaction,
          );

          return {
            ...snapshot,
            capacidadMaxima,
            disponibles: capacidadMaxima - snapshot.ocupacionTotal,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        'No fue posible modificar la capacidad del evento.',
      );
    }
  }

  private async readSnapshot(
    transaction: Prisma.TransactionClient,
  ): Promise<CapacidadSnapshot> {
    const lockedRows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "ConfiguracionEvento"
      WHERE clave = 'capacidad_maxima'
      FOR UPDATE
    `;

    if (lockedRows.length === 0) {
      throw new InternalServerErrorException(
        'La configuración de capacidad máxima no está disponible.',
      );
    }

    const configuration =
      await this.configuracionService.getCapacityConfiguration(transaction);
    const fechaReferencia = new Date();

    const asistentesRegistrados = await transaction.asistente.count();
    const reservas = await transaction.reserva.aggregate({
      where: {
        estado: EstadoReserva.PENDIENTE,
        expiracion: { gt: fechaReferencia },
      },
      _sum: { cantidad: true },
    });
    const reservasVigentes = reservas._sum.cantidad ?? 0;
    const ocupacionTotal = asistentesRegistrados + reservasVigentes;

    return {
      capacidadMaxima: configuration.valor,
      asistentesRegistrados,
      reservasVigentes,
      ocupacionTotal,
      disponibles: configuration.valor - ocupacionTotal,
    };
  }
}
