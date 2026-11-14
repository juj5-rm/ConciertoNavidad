import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { POSTGRES_INT_MAX_VALUE } from '../prisma/postgres.constants';

const CLAVE_CAPACIDAD_MAXIMA = 'capacidad_maxima';

type ConfiguracionClient = {
  configuracionEvento: Pick<
    Prisma.TransactionClient['configuracionEvento'],
    'findUnique' | 'update'
  >;
};

@Injectable()
export class ConfiguracionService {
  constructor(private readonly prisma: PrismaService) {}

  async getCapacityConfiguration(
    client: ConfiguracionClient = this.prisma,
  ): Promise<{ id: string; clave: string; valor: number }> {
    const configuration = await client.configuracionEvento.findUnique({
      where: { clave: CLAVE_CAPACIDAD_MAXIMA },
      select: { id: true, clave: true, valor: true },
    });

    if (!configuration) {
      throw new InternalServerErrorException(
        'La configuración de capacidad máxima no está disponible.',
      );
    }

    if (!this.isValidCapacity(configuration.valor)) {
      throw new InternalServerErrorException(
        'La configuración de capacidad máxima no es válida.',
      );
    }

    return configuration;
  }

  async getMaximumCapacity(): Promise<number> {
    const configuration = await this.getCapacityConfiguration();
    return configuration.valor;
  }

  async updateCapacityConfiguration(
    capacidad: number,
    client: ConfiguracionClient,
  ): Promise<{ id: string; clave: string; valor: number }> {
    this.validateCapacityValue(capacidad);

    return client.configuracionEvento.update({
      where: { clave: CLAVE_CAPACIDAD_MAXIMA },
      data: { valor: capacidad },
      select: { id: true, clave: true, valor: true },
    });
  }

  validateCapacityChange(capacidad: number, ocupacionActual: number): number {
    this.validateCapacityValue(capacidad);

    if (
      !Number.isInteger(ocupacionActual) ||
      ocupacionActual < 0 ||
      ocupacionActual > POSTGRES_INT_MAX_VALUE
    ) {
      throw new BadRequestException('La ocupación actual no es válida.');
    }

    if (capacidad < ocupacionActual) {
      throw new BadRequestException(
        'La capacidad no puede ser inferior a la ocupación actual.',
      );
    }

    return capacidad;
  }

  validateCapacityValue(capacidad: number): void {
    if (!this.isValidCapacity(capacidad)) {
      throw new BadRequestException(
        `La capacidad debe ser un entero positivo no mayor que ${POSTGRES_INT_MAX_VALUE}.`,
      );
    }
  }

  private isValidCapacity(capacidad: number): boolean {
    return (
      Number.isInteger(capacidad) &&
      capacidad >= 1 &&
      capacidad <= POSTGRES_INT_MAX_VALUE
    );
  }
}
