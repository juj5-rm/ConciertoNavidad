import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { EstadoReserva, Prisma } from '@prisma/client';
import { ConfiguracionService } from '../configuracion/configuracion.service';

export interface CapacidadSnapshot {
  capacidadMaxima: number;
  asistentesRegistrados: number;
  reservasVigentes: number;
  ocupacionTotal: number;
  disponibles: number;
}

@Injectable()
export class CapacidadService {
  constructor(private readonly configuracionService: ConfiguracionService) {}

  async getSnapshot(
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

    if (ocupacionTotal > configuration.valor) {
      throw new ConflictException(
        'La ocupación actual supera la capacidad configurada.',
      );
    }

    return {
      capacidadMaxima: configuration.valor,
      asistentesRegistrados,
      reservasVigentes,
      ocupacionTotal,
      disponibles: configuration.valor - ocupacionTotal,
    };
  }
}
