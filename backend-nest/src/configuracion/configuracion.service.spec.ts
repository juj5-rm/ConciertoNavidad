import { InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfiguracionService } from './configuracion.service';

describe('ConfiguracionService', () => {
  let service: ConfiguracionService;
  let findUnique: jest.Mock;
  let update: jest.Mock;

  beforeEach(() => {
    findUnique = jest.fn();
    update = jest.fn();
    service = new ConfiguracionService({
      configuracionEvento: { findUnique, update },
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

  it('updates the existing capacity configuration through the supplied client', async () => {
    update.mockResolvedValue({
      id: 'config-1',
      clave: 'capacidad_maxima',
      valor: 80,
    });

    await expect(
      service.updateCapacityConfiguration(80, {
        configuracionEvento: { findUnique, update },
      }),
    ).resolves.toEqual({
      id: 'config-1',
      clave: 'capacidad_maxima',
      valor: 80,
    });
    expect(update).toHaveBeenCalledWith({
      where: { clave: 'capacidad_maxima' },
      data: { valor: 80 },
      select: { id: true, clave: true, valor: true },
    });
  });

  it('does not persist an invalid capacity value', async () => {
    await expect(
      service.updateCapacityConfiguration(-1, {
        configuracionEvento: { findUnique, update },
      }),
    ).rejects.toThrow('La capacidad debe ser un entero entre 0 y 100.');
    expect(update).not.toHaveBeenCalled();
  });
});
