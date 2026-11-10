import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CAPACIDAD_MAXIMA_PERMITIDA = 100;
const CLAVE_CAPACIDAD_MAXIMA = 'capacidad_maxima';

type ConfiguracionClient = Pick<
  Prisma.TransactionClient,
  'configuracionEvento'
>;

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

  validateCapacityChange(capacidad: number, ocupacionActual: number): number {
    this.validateCapacityValue(capacidad);

    if (!Number.isInteger(ocupacionActual) || ocupacionActual < 0) {
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
        'La capacidad debe ser un entero entre 0 y 100.',
      );
    }
  }

  private isValidCapacity(capacidad: number): boolean {
    return (
      Number.isInteger(capacidad) &&
      capacidad >= 0 &&
      capacidad <= CAPACIDAD_MAXIMA_PERMITIDA
    );
  }
}
