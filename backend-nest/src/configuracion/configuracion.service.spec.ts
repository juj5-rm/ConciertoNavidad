import { InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfiguracionService } from './configuracion.service';

describe('ConfiguracionService', () => {
  let service: ConfiguracionService;
  let findUnique: jest.Mock;

  beforeEach(() => {
    findUnique = jest.fn();
    service = new ConfiguracionService({
      configuracionEvento: { findUnique },
    } as unknown as PrismaService);
  });

  it('returns the configured capacity of 100', async () => {
    findUnique.mockResolvedValue({
      id: 'config-1',
      clave: 'capacidad_maxima',
      valor: 100,
    });

    await expect(service.getMaximumCapacity()).resolves.toBe(100);
    expect(findUnique).toHaveBeenCalledWith({
      where: { clave: 'capacidad_maxima' },
      select: { id: true, clave: true, valor: true },
    });
  });

  it('fails safely when the capacity configuration is missing', async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.getMaximumCapacity()).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it.each([-1, 101, 20.5])(
    'rejects invalid stored capacity %s',
    async (valor) => {
      findUnique.mockResolvedValue({
        id: 'config-1',
        clave: 'capacidad_maxima',
        valor,
      });

      await expect(service.getMaximumCapacity()).rejects.toThrow(
        InternalServerErrorException,
      );
    },
  );

  it('rejects a future capacity below current occupancy', () => {
    expect(() => service.validateCapacityChange(8, 9)).toThrow(
      'La capacidad no puede ser inferior a la ocupación actual.',
    );
  });
});
