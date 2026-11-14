import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { EstadoReserva, Prisma, TipoAsistente } from '@prisma/client';
import { AsistentesService } from '../asistentes/asistentes.service';
import { CapacidadService } from '../capacidad/capacidad.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegistroAsistenteInput } from '../asistentes/asistentes.service';
import { ReservasService } from './reservas.service';

describe('ReservasService', () => {
  const fechaActual = new Date('2026-11-10T12:00:00.000Z');
  const tokenValido = 'a'.repeat(64);
  let service: ReservasService;
  let transaction: {
    $queryRaw: jest.Mock;
    configuracionEvento: { findUnique: jest.Mock };
    asistente: {
      count: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
    };
    reserva: {
      aggregate: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let prisma: { $transaction: jest.Mock };
  let eventos: string[];
  let asistentesCreados: Prisma.AsistenteUncheckedCreateInput[];
  let datosReservaCreada: Prisma.ReservaUncheckedCreateInput | undefined;
  let opcionesTransaccion:
    { isolationLevel?: Prisma.TransactionIsolationLevel } | undefined;
  let rollback: boolean;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(fechaActual);
    eventos = [];
    asistentesCreados = [];
    datosReservaCreada = undefined;
    opcionesTransaccion = undefined;
    rollback = false;

    transaction = {
      $queryRaw: jest.fn().mockImplementation(() => {
        eventos.push('bloqueo-capacidad');
        return Promise.resolve([{ id: 'config-1' }]);
      }),
      configuracionEvento: {
        findUnique: jest.fn().mockImplementation(() => {
          eventos.push('configuracion');
          return Promise.resolve({
            id: 'config-1',
            clave: 'capacidad_maxima',
            valor: 100,
          });
        }),
      },
      asistente: {
        count: jest.fn().mockImplementation(() => {
          eventos.push('conteo-asistentes');
          return Promise.resolve(0);
        }),
        findMany: jest.fn().mockImplementation(() => {
          eventos.push('boletas-ocupadas');
          return Promise.resolve([]);
        }),
        create: jest
          .fn()
          .mockImplementation(
            (args: { data: Prisma.AsistenteUncheckedCreateInput }) => {
              const index = asistentesCreados.length;
              asistentesCreados.push(args.data);
              eventos.push('crear-asistente');
              return Promise.resolve({
                id: `asistente-${index + 1}`,
                nombre: args.data.nombre,
                tipo: args.data.tipo,
                codigoQr: args.data.codigoQr,
                numeroBoleta: args.data.numeroBoleta,
              });
            },
          ),
      },
      reserva: {
        aggregate: jest.fn().mockImplementation(() => {
          eventos.push('suma-reservas-vigentes');
          return Promise.resolve({ _sum: { cantidad: null } });
        }),
        create: jest
          .fn()
          .mockImplementation(
            (args: { data: Prisma.ReservaUncheckedCreateInput }) => {
              eventos.push('crear-reserva');
              datosReservaCreada = args.data;
              return Promise.resolve({
                id: 'reserva-1',
                cantidad: args.data.cantidad,
                estado: args.data.estado,
                createdAt: args.data.createdAt,
                expiracion: args.data.expiracion,
              });
            },
          ),
        findUnique: jest.fn().mockImplementation(() => {
          eventos.push('buscar-reserva');
          return Promise.resolve({
            id: 'reserva-1',
            cantidad: 2,
            estado: EstadoReserva.PENDIENTE,
            expiracion: new Date(fechaActual.getTime() + 60_000),
          });
        }),
        update: jest
          .fn()
          .mockImplementation(
            (args: {
              where: { id: string };
              data: { estado: EstadoReserva; usedAt: Date };
            }) => {
              eventos.push('marcar-reserva-usada');
              return Promise.resolve({
                id: args.where.id,
                estado: args.data.estado,
                usedAt: args.data.usedAt,
              });
            },
          ),
        updateMany: jest.fn().mockImplementation(() => {
          eventos.push('expirar-reservas');
          return Promise.resolve({ count: 0 });
        }),
      },
    };

    prisma = { $transaction: jest.fn() };
    prisma.$transaction.mockImplementation(
      async (
        callback: (client: Prisma.TransactionClient) => Promise<unknown>,
        options: { isolationLevel?: Prisma.TransactionIsolationLevel },
      ) => {
        opcionesTransaccion = options;
        try {
          return await callback(
            transaction as unknown as Prisma.TransactionClient,
          );
        } catch (error) {
          rollback = true;
          throw error;
        }
      },
    );

    const configuracionService = new ConfiguracionService(
      prisma as unknown as PrismaService,
    );
    const capacidadService = new CapacidadService(
      prisma as unknown as PrismaService,
      configuracionService,
    );
    const asistentesService = new AsistentesService(
      prisma as unknown as PrismaService,
      capacidadService,
    );
    service = new ReservasService(
      prisma as unknown as PrismaService,
      asistentesService,
      capacidadService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a pending reservation and returns its original token only once', async () => {
    const result = await service.crear(3);

    expect(result.id).toBe('reserva-1');
    expect(result.cantidad).toBe(3);
    expect(result.estado).toBe(EstadoReserva.PENDIENTE);
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(datosReservaCreada).toMatchObject({
      cantidad: 3,
      estado: EstadoReserva.PENDIENTE,
    });
    expect(datosReservaCreada?.tokenHash).toBe(
      createHash('sha256').update(result.token).digest('hex'),
    );
    expect(result).not.toHaveProperty('tokenHash');
  });

  it('sets the expiration exactly 24 hours after creation', async () => {
    await service.crear(1);

    expect(datosReservaCreada?.createdAt).toEqual(fechaActual);
    expect(datosReservaCreada?.expiracion).toEqual(
      new Date(fechaActual.getTime() + 24 * 60 * 60 * 1000),
    );
  });

  it('validates amount before opening a transaction', async () => {
    for (const invalidAmount of [0, -1, 1.5, Number.NaN]) {
      await expect(service.crear(invalidAmount)).rejects.toThrow(
        BadRequestException,
      );
    }

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a reservation when capacity is insufficient', async () => {
    transaction.asistente.count.mockResolvedValue(99);

    await expect(service.crear(2)).rejects.toThrow(ConflictException);
    expect(transaction.reserva.create).not.toHaveBeenCalled();
  });

  it('uses the capacity lock before creating a reservation', async () => {
    await service.crear(2);

    expect(eventos.slice(0, 5)).toEqual([
      'bloqueo-capacidad',
      'configuracion',
      'conteo-asistentes',
      'suma-reservas-vigentes',
      'crear-reserva',
    ]);
  });

  it('uses ReadCommitted for reservation creation', async () => {
    await service.crear(1);

    expect(opcionesTransaccion).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  });

  it('validates token format before opening a transaction', async () => {
    await expect(service.confirmar('invalid-token', [])).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('finds a reservation using only the SHA-256 token hash', async () => {
    await service.confirmar(tokenValido, [adulto('A'), adulto('B')]);

    expect(transaction.reserva.findUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256').update(tokenValido).digest('hex'),
      },
      select: {
        id: true,
        cantidad: true,
        estado: true,
        expiracion: true,
      },
    });
  });

  it('rejects a reservation that does not exist', async () => {
    transaction.reserva.findUnique.mockResolvedValue(null);

    await expect(
      service.confirmar(tokenValido, [adulto('A'), adulto('B')]),
    ).rejects.toThrow('Reserva no disponible o inexistente.');
    expect(transaction.asistente.create).not.toHaveBeenCalled();
  });

  it('confirms a pending reservation just before its expiration', async () => {
    transaction.reserva.findUnique.mockResolvedValue({
      id: 'reserva-1',
      cantidad: 2,
      estado: EstadoReserva.PENDIENTE,
      expiracion: new Date(fechaActual.getTime() + 1),
    });

    await expect(
      service.confirmar(tokenValido, [adulto('A'), adulto('B')]),
    ).resolves.toMatchObject({ estado: EstadoReserva.USADA });
  });

  it('rejects a reservation at the exact expiration instant', async () => {
    transaction.reserva.findUnique.mockResolvedValue({
      id: 'reserva-1',
      cantidad: 2,
      estado: EstadoReserva.PENDIENTE,
      expiracion: fechaActual,
    });

    await expect(
      service.confirmar(tokenValido, [adulto('A'), adulto('B')]),
    ).rejects.toThrow('Reserva no disponible o inexistente.');
    expect(transaction.asistente.create).not.toHaveBeenCalled();
    expect(transaction.reserva.update).not.toHaveBeenCalled();
  });

  it('fails the transaction callback if creation of the first attendee fails', async () => {
    transaction.asistente.create.mockRejectedValueOnce(
      new Error('database detail'),
    );

    await expect(
      service.confirmar(tokenValido, [adulto('A'), adulto('B')]),
    ).rejects.toThrow(InternalServerErrorException);
    expect(rollback).toBe(true);
    expect(transaction.asistente.create).toHaveBeenCalledTimes(1);
    expect(transaction.reserva.update).not.toHaveBeenCalled();
  });

  it('fails the transaction callback if marking the reservation used fails', async () => {
    transaction.reserva.update.mockRejectedValueOnce(
      new Error('database detail'),
    );

    await expect(
      service.confirmar(tokenValido, [adulto('A'), adulto('B')]),
    ).rejects.toThrow(InternalServerErrorException);
    expect(rollback).toBe(true);
    expect(transaction.asistente.create).toHaveBeenCalledTimes(2);
    expect(transaction.reserva.update).toHaveBeenCalledTimes(1);
  });

  it('rejects a reservation that is no longer pending', async () => {
    transaction.reserva.findUnique.mockResolvedValue({
      id: 'reserva-1',
      cantidad: 2,
      estado: EstadoReserva.USADA,
      expiracion: new Date(fechaActual.getTime() + 60_000),
    });

    await expect(
      service.confirmar(tokenValido, [adulto('A'), adulto('B')]),
    ).rejects.toThrow(NotFoundException);
  });

  it('requires exactly one valid attendee record per reserved place', async () => {
    await expect(service.confirmar(tokenValido, [adulto('A')])).rejects.toThrow(
      BadRequestException,
    );
    expect(transaction.asistente.create).not.toHaveBeenCalled();
  });

  it('creates attendees and marks the reservation used in the same transaction', async () => {
    const result = await service.confirmar(tokenValido, [
      adulto('A'),
      adulto('B'),
    ]);

    expect(result.estado).toBe(EstadoReserva.USADA);
    expect(result.usedAt).toEqual(fechaActual);
    expect(result.asistentes).toHaveLength(2);
    expect(transaction.reserva.update).toHaveBeenCalledWith({
      where: { id: 'reserva-1' },
      data: { estado: EstadoReserva.USADA, usedAt: fechaActual },
      select: { id: true, estado: true, usedAt: true },
    });
    expect(eventos.slice(-4)).toEqual([
      'boletas-ocupadas',
      'crear-asistente',
      'crear-asistente',
      'marcar-reserva-usada',
    ]);
  });

  it('does not count the reservation a second time when confirming its attendees', async () => {
    transaction.reserva.aggregate.mockResolvedValue({
      _sum: { cantidad: 2 },
    });

    await service.confirmar(tokenValido, [adulto('A'), adulto('B')]);

    expect(transaction.reserva.aggregate).toHaveBeenCalledTimes(1);
    expect(transaction.asistente.create).toHaveBeenCalledTimes(2);
    expect(transaction.reserva.update).toHaveBeenCalledTimes(1);
  });

  it('assigns unique tickets and independent secure QR codes to confirmed attendees', async () => {
    transaction.asistente.findMany.mockResolvedValue([
      { numeroBoleta: 1 },
      { numeroBoleta: 3 },
    ]);

    const result = await service.confirmar(tokenValido, [
      adulto('A'),
      adulto('B'),
    ]);
    const numeros = asistentesCreados.map(({ numeroBoleta }) => numeroBoleta);
    const qrCodes = asistentesCreados.map(({ codigoQr }) => codigoQr);

    expect(numeros).toEqual([2, 4]);
    expect(new Set(numeros).size).toBe(2);
    expect(qrCodes.every((code) => /^[A-Za-z0-9_-]{43}$/.test(code))).toBe(
      true,
    );
    expect(new Set(qrCodes).size).toBe(2);
    expect(result.asistentes.map(({ codigoQr }) => codigoQr)).toEqual(qrCodes);
  });

  it('rolls back all attendee creation if one attendee fails', async () => {
    transaction.asistente.create
      .mockImplementationOnce(
        (args: { data: Prisma.AsistenteUncheckedCreateInput }) => {
          asistentesCreados.push(args.data);
          return Promise.resolve({
            id: 'asistente-1',
            nombre: args.data.nombre,
            tipo: args.data.tipo,
            codigoQr: args.data.codigoQr,
            numeroBoleta: args.data.numeroBoleta,
          });
        },
      )
      .mockRejectedValueOnce(new Error('database detail'));

    await expect(
      service.confirmar(tokenValido, [adulto('A'), adulto('B')]),
    ).rejects.toThrow(InternalServerErrorException);
    expect(rollback).toBe(true);
    expect(transaction.reserva.update).not.toHaveBeenCalled();
  });

  it('rejects a repeated confirmation after the reservation has been used', async () => {
    transaction.reserva.findUnique.mockResolvedValue({
      id: 'reserva-1',
      cantidad: 2,
      estado: EstadoReserva.USADA,
      expiracion: new Date(fechaActual.getTime() + 60_000),
    });

    await expect(
      service.confirmar(tokenValido, [adulto('A'), adulto('B')]),
    ).rejects.toThrow('Reserva no disponible o inexistente.');
    expect(transaction.asistente.create).not.toHaveBeenCalled();
  });

  it.each([
    ['used', EstadoReserva.USADA, new Date(fechaActual.getTime() + 60_000)],
    [
      'expired state',
      EstadoReserva.EXPIRADA,
      new Date(fechaActual.getTime() + 60_000),
    ],
    [
      'past expiration',
      EstadoReserva.PENDIENTE,
      new Date(fechaActual.getTime() - 1),
    ],
  ])(
    'returns the same public error for a reservation with %s state',
    async (_scenario, estado, expiracion) => {
      transaction.reserva.findUnique.mockResolvedValue({
        id: 'reserva-1',
        cantidad: 2,
        estado,
        expiracion,
      });

      const error = await service
        .confirmar(tokenValido, [adulto('A'), adulto('B')])
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getStatus()).toBe(404);
      expect((error as NotFoundException).message).toBe(
        'Reserva no disponible o inexistente.',
      );
      expect(transaction.asistente.create).not.toHaveBeenCalled();
    },
  );

  it('returns the same public error for a missing reservation and non-confirmable states', async () => {
    const publicErrors: Array<{ status: number; message: string }> = [];
    transaction.reserva.findUnique.mockResolvedValue(null);
    const missingError = await service
      .confirmar(tokenValido, [adulto('A'), adulto('B')])
      .catch((caught: unknown) => caught);
    publicErrors.push({
      status: (missingError as NotFoundException).getStatus(),
      message: (missingError as NotFoundException).message,
    });

    for (const [estado, expiracion] of [
      [EstadoReserva.USADA, new Date(fechaActual.getTime() + 60_000)],
      [EstadoReserva.EXPIRADA, new Date(fechaActual.getTime() + 60_000)],
      [EstadoReserva.PENDIENTE, new Date(fechaActual.getTime() - 1)],
    ] as const) {
      transaction.reserva.findUnique.mockResolvedValue({
        id: 'reserva-1',
        cantidad: 2,
        estado,
        expiracion,
      });
      const error = await service
        .confirmar(tokenValido, [adulto('A'), adulto('B')])
        .catch((caught: unknown) => caught);
      publicErrors.push({
        status: (error as NotFoundException).getStatus(),
        message: (error as NotFoundException).message,
      });
    }

    expect(publicErrors).toEqual(
      Array.from({ length: 4 }, () => ({
        status: 404,
        message: 'Reserva no disponible o inexistente.',
      })),
    );
  });

  it('uses one transaction client and ReadCommitted for confirmation', async () => {
    await service.confirmar(tokenValido, [adulto('A'), adulto('B')]);

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.configuracionEvento.findUnique).toHaveBeenCalledTimes(1);
    expect(transaction.asistente.count).toHaveBeenCalledTimes(1);
    expect(transaction.reserva.aggregate).toHaveBeenCalledTimes(1);
    expect(transaction.reserva.findUnique).toHaveBeenCalledTimes(1);
    expect(transaction.asistente.findMany).toHaveBeenCalledTimes(1);
    expect(transaction.asistente.create).toHaveBeenCalledTimes(2);
    expect(transaction.reserva.update).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(opcionesTransaccion).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  });

  it('expires only pending reservations whose expiration is at or before now', async () => {
    transaction.reserva.updateMany.mockResolvedValue({ count: 3 });

    await expect(service.expirarPendientesVencidas()).resolves.toEqual({
      cantidad: 3,
    });
    expect(transaction.reserva.updateMany).toHaveBeenCalledWith({
      where: {
        estado: EstadoReserva.PENDIENTE,
        expiracion: { lte: fechaActual },
      },
      data: { estado: EstadoReserva.EXPIRADA },
    });
    expect(transaction.asistente.create).not.toHaveBeenCalled();
  });

  it('takes the common capacity lock before marking reservations expired', async () => {
    await service.expirarPendientesVencidas();

    expect(eventos.slice(0, 5)).toEqual([
      'bloqueo-capacidad',
      'configuracion',
      'conteo-asistentes',
      'suma-reservas-vigentes',
      'expirar-reservas',
    ]);
  });

  it('uses ReadCommitted and the same transaction client for expiration', async () => {
    await service.expirarPendientesVencidas();

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.reserva.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(opcionesTransaccion).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  });

  it('serializes every reservation operation through the common capacity lock', async () => {
    await service.crear(1);
    eventos = [];
    await service.confirmar(tokenValido, [adulto('A'), adulto('B')]);
    eventos = [];
    await service.expirarPendientesVencidas();

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(3);
    expect(eventos[0]).toBe('bloqueo-capacidad');
  });

  function adulto(nombre: string): RegistroAsistenteInput {
    return {
      tipo: TipoAsistente.ADULTO,
      nombre,
      correo: `${nombre.toLowerCase()}@example.com`,
      identificacion: `ID-${nombre}`,
    };
  }
});
