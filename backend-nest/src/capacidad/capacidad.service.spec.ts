import { BadRequestException, ConflictException } from '@nestjs/common';
import { EstadoReserva, Prisma } from '@prisma/client';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { PrismaService } from '../prisma/prisma.service';
import { POSTGRES_INT_MAX_VALUE } from '../prisma/postgres.constants';
import { CapacidadService } from './capacidad.service';

describe('CapacidadService', () => {
  const fechaReferencia = new Date('2026-11-10T12:00:00.000Z');
  let service: CapacidadService;
  let transaction: {
    $queryRaw: jest.Mock;
    asistente: { count: jest.Mock };
    reserva: { aggregate: jest.Mock };
  };
  let prisma: { $transaction: jest.Mock };
  let getCapacityConfiguration: jest.Mock;
  let validateCapacityValue: jest.Mock;
  let validateCapacityChange: jest.Mock;
  let updateCapacityConfiguration: jest.Mock;
  let transactionOptions:
    { isolationLevel?: Prisma.TransactionIsolationLevel } | undefined;
  let lockQuery: TemplateStringsArray | undefined;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(fechaReferencia);
    lockQuery = undefined;
    transactionOptions = undefined;
    transaction = {
      $queryRaw: jest.fn().mockImplementation((query: TemplateStringsArray) => {
        lockQuery = query;
        return Promise.resolve([{ id: 'config-1' }]);
      }),
      asistente: { count: jest.fn().mockResolvedValue(0) },
      reserva: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { cantidad: null } }),
      },
    };
    prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(
          async (
            callback: (client: Prisma.TransactionClient) => Promise<unknown>,
            options: { isolationLevel?: Prisma.TransactionIsolationLevel },
          ) => {
            transactionOptions = options;
            return callback(transaction as unknown as Prisma.TransactionClient);
          },
        ),
    };
    getCapacityConfiguration = jest.fn().mockResolvedValue({
      id: 'config-1',
      clave: 'capacidad_maxima',
      valor: 100,
    });
    validateCapacityValue = jest.fn((capacidad: number) => {
      if (
        !Number.isInteger(capacidad) ||
        capacidad < 1 ||
        capacidad > POSTGRES_INT_MAX_VALUE
      ) {
        throw new BadRequestException(
          'La capacidad debe ser un entero positivo válido.',
        );
      }
    });
    validateCapacityChange = jest.fn((capacidad: number, ocupacion: number) => {
      validateCapacityValue(capacidad);
      if (capacidad < ocupacion) {
        throw new BadRequestException(
          'La capacidad no puede ser inferior a la ocupación actual.',
        );
      }
      return capacidad;
    });
    updateCapacityConfiguration = jest.fn().mockResolvedValue({
      id: 'config-1',
      clave: 'capacidad_maxima',
      valor: 100,
    });
    service = new CapacidadService(
      prisma as unknown as PrismaService,
      {
        getCapacityConfiguration,
        validateCapacityValue,
        validateCapacityChange,
        updateCapacityConfiguration,
      } as unknown as ConfiguracionService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns full availability when there are no attendees or reservations', async () => {
    await expect(getSnapshot()).resolves.toEqual({
      capacidadMaxima: 100,
      asistentesRegistrados: 0,
      reservasVigentes: 0,
      ocupacionTotal: 0,
      disponibles: 100,
    });
  });

  it('counts registered attendees', async () => {
    transaction.asistente.count.mockResolvedValue(12);

    await expect(getSnapshot()).resolves.toMatchObject({
      asistentesRegistrados: 12,
      ocupacionTotal: 12,
      disponibles: 88,
    });
  });

  it('sums the quantity of pending reservations that have not expired', async () => {
    transaction.reserva.aggregate.mockResolvedValue({
      _sum: { cantidad: 7 },
    });

    await expect(getSnapshot()).resolves.toMatchObject({
      reservasVigentes: 7,
      ocupacionTotal: 7,
      disponibles: 93,
    });
    expect(transaction.reserva.aggregate).toHaveBeenCalledWith({
      where: {
        estado: EstadoReserva.PENDIENTE,
        expiracion: { gt: fechaReferencia },
      },
      _sum: { cantidad: true },
    });
  });

  it('excludes expired pending reservations', async () => {
    transaction.reserva.aggregate.mockResolvedValue({
      _sum: { cantidad: null },
    });

    await expect(getSnapshot()).resolves.toMatchObject({
      reservasVigentes: 0,
      ocupacionTotal: 0,
    });
    expect(transaction.reserva.aggregate).toHaveBeenCalledWith({
      where: {
        estado: EstadoReserva.PENDIENTE,
        expiracion: { gt: fechaReferencia },
      },
      _sum: { cantidad: true },
    });
  });

  it('combines attendees and active reservations', async () => {
    transaction.asistente.count.mockResolvedValue(60);
    transaction.reserva.aggregate.mockResolvedValue({
      _sum: { cantidad: 25 },
    });

    await expect(getSnapshot()).resolves.toEqual({
      capacidadMaxima: 100,
      asistentesRegistrados: 60,
      reservasVigentes: 25,
      ocupacionTotal: 85,
      disponibles: 15,
    });
  });

  it('returns zero availability when occupancy equals capacity', async () => {
    transaction.asistente.count.mockResolvedValue(80);
    transaction.reserva.aggregate.mockResolvedValue({
      _sum: { cantidad: 20 },
    });

    await expect(getSnapshot()).resolves.toMatchObject({
      ocupacionTotal: 100,
      disponibles: 0,
    });
  });

  it('raises a controlled conflict when occupancy exceeds capacity', async () => {
    transaction.asistente.count.mockResolvedValue(101);

    await expect(getSnapshot()).rejects.toThrow(ConflictException);
  });

  it('returns over-capacity occupancy to the administrative snapshot', async () => {
    transaction.asistente.count.mockResolvedValue(101);

    await expect(service.getAdministrativeSnapshot()).resolves.toEqual({
      capacidadMaxima: 100,
      asistentesRegistrados: 101,
      reservasVigentes: 0,
      ocupacionTotal: 101,
      disponibles: -1,
    });
    expect(transactionOptions?.isolationLevel).toBe(
      Prisma.TransactionIsolationLevel.ReadCommitted,
    );
  });

  it('updates capacity under the common lock and returns the resulting snapshot', async () => {
    transaction.asistente.count.mockResolvedValue(50);

    await expect(service.updateMaximumCapacity(75)).resolves.toEqual({
      capacidadMaxima: 75,
      asistentesRegistrados: 50,
      reservasVigentes: 0,
      ocupacionTotal: 50,
      disponibles: 25,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(validateCapacityChange).toHaveBeenCalledWith(75, 50);
    expect(updateCapacityConfiguration).toHaveBeenCalledWith(75, transaction);
    expect(transactionOptions?.isolationLevel).toBe(
      Prisma.TransactionIsolationLevel.ReadCommitted,
    );
  });

  it('allows raising capacity to recover an over-capacity configuration', async () => {
    getCapacityConfiguration.mockResolvedValue({
      id: 'config-1',
      clave: 'capacidad_maxima',
      valor: 60,
    });
    transaction.asistente.count.mockResolvedValue(80);

    await expect(service.updateMaximumCapacity(90)).resolves.toMatchObject({
      capacidadMaxima: 90,
      ocupacionTotal: 80,
      disponibles: 10,
    });
  });

  it('rejects capacity below occupancy and allows values above 100', async () => {
    transaction.asistente.count.mockResolvedValue(60);

    await expect(service.updateMaximumCapacity(59)).rejects.toThrow(
      'La capacidad no puede ser inferior a la ocupación actual.',
    );
    expect(updateCapacityConfiguration).not.toHaveBeenCalled();

    updateCapacityConfiguration.mockResolvedValue({
      id: 'config-1',
      clave: 'capacidad_maxima',
      valor: 200,
    });
    await expect(service.updateMaximumCapacity(200)).resolves.toMatchObject({
      capacidadMaxima: 200,
    });
    expect(updateCapacityConfiguration).toHaveBeenCalledWith(200, transaction);
    await expect(
      service.updateMaximumCapacity(POSTGRES_INT_MAX_VALUE + 1),
    ).rejects.toThrow('La capacidad debe ser un entero positivo válido.');
  });

  it('rejects lowering capacity when occupancy exceeds the allowed maximum', async () => {
    transaction.asistente.count.mockResolvedValue(101);

    await expect(service.updateMaximumCapacity(100)).rejects.toThrow(
      'La capacidad no puede ser inferior a la ocupación actual.',
    );
    expect(updateCapacityConfiguration).not.toHaveBeenCalled();
  });

  it('locks the capacity row before querying occupancy', async () => {
    const executionOrder: string[] = [];
    transaction.$queryRaw.mockImplementation((query: TemplateStringsArray) => {
      lockQuery = query;
      executionOrder.push('lock');
      return Promise.resolve([{ id: 'config-1' }]);
    });
    getCapacityConfiguration.mockImplementation(() => {
      executionOrder.push('configuration');
      return Promise.resolve({
        id: 'config-1',
        clave: 'capacidad_maxima',
        valor: 100,
      });
    });
    transaction.asistente.count.mockImplementation(() => {
      executionOrder.push('attendees');
      return Promise.resolve(0);
    });
    transaction.reserva.aggregate.mockImplementation(() => {
      executionOrder.push('reservations');
      return Promise.resolve({ _sum: { cantidad: null } });
    });

    await getSnapshot();

    expect(executionOrder).toEqual([
      'lock',
      'configuration',
      'attendees',
      'reservations',
    ]);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(lockQuery?.join('')).toContain('FOR UPDATE');
  });

  it('fails if the locked configuration row does not exist', async () => {
    transaction.$queryRaw.mockResolvedValue([]);

    await expect(getSnapshot()).rejects.toThrow(
      'La configuración de capacidad máxima no está disponible.',
    );
    expect(transaction.asistente.count).not.toHaveBeenCalled();
  });

  function getSnapshot() {
    return service.getSnapshot(
      transaction as unknown as Prisma.TransactionClient,
    );
  }
});
