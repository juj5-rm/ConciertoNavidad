import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, TipoAsistente } from '@prisma/client';
import { CapacidadService } from '../capacidad/capacidad.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AsistentesService,
  RegistroAsistenteInput,
} from './asistentes.service';

describe('AsistentesService', () => {
  const fechaActual = new Date('2026-11-10T12:00:00.000Z');
  let service: AsistentesService;
  let transaction: {
    $queryRaw: jest.Mock;
    configuracionEvento: { findUnique: jest.Mock };
    asistente: {
      count: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
    };
    reserva: { aggregate: jest.Mock };
  };
  let prisma: {
    $transaction: jest.Mock;
    asistente: { findMany: jest.Mock };
  };
  let eventos: string[];
  let opcionesTransaccion:
    { isolationLevel?: Prisma.TransactionIsolationLevel } | undefined;
  let rollback: boolean;
  let datosCreacion: Prisma.AsistenteUncheckedCreateInput | undefined;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(fechaActual);
    eventos = [];
    opcionesTransaccion = undefined;
    rollback = false;
    datosCreacion = undefined;

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
              eventos.push('crear-asistente');
              datosCreacion = args.data;
              return Promise.resolve({
                id: 'asistente-1',
                nombre: args.data.nombre,
                tipo: args.data.tipo,
                codigoQr: args.data.codigoQr,
                numeroBoleta: args.data.numeroBoleta,
              });
            },
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
      },
      reserva: {
        aggregate: jest.fn().mockImplementation(() => {
          eventos.push('reservas-vigentes');
          return Promise.resolve({ _sum: { cantidad: null } });
        }),
      },
    };

    prisma = {
      $transaction: jest.fn(),
      asistente: { findMany: jest.fn() },
    };
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
    service = new AsistentesService(
      prisma as unknown as PrismaService,
      capacidadService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('registers an adult with a generated QR and a free ticket number', async () => {
    const result = await service.registrarIndividual(adulto());

    expect(result).toMatchObject({
      id: 'asistente-1',
      nombre: 'Ana Pérez',
      tipo: TipoAsistente.ADULTO,
      numeroBoleta: 1,
    });
    expect(result.codigoQr).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(datosCreacion).toMatchObject({
      nombre: 'Ana Pérez',
      correo: 'ana@example.com',
      identificacion: 'ID-123',
      nacimiento: null,
      grupoId: null,
      validado: false,
      validadoAt: null,
      numeroBoleta: 1,
    });
    expect(opcionesTransaccion).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  });

  it('records a valid QR entry atomically and returns only minimal fields', async () => {
    const validadoAt = new Date(fechaActual);
    transaction.asistente.findUnique.mockResolvedValue({
      numeroBoleta: 12,
      tipo: TipoAsistente.ADULTO,
      validado: true,
      validadoAt,
    });

    const result = await service.verificarIngreso('A'.repeat(43));

    expect(result).toEqual({
      resultado: 'INGRESO_REGISTRADO',
      numeroBoleta: 12,
      tipo: TipoAsistente.ADULTO,
      validadoAt,
    });
    expect(transaction.asistente.updateMany).toHaveBeenCalledWith({
      where: {
        codigoQr: 'A'.repeat(43),
        validado: false,
        validadoAt: null,
      },
      data: { validado: true, validadoAt },
    });
    expect(transaction.asistente.findUnique).toHaveBeenCalledWith({
      where: { codigoQr: 'A'.repeat(43) },
      select: {
        numeroBoleta: true,
        tipo: true,
        validado: true,
        validadoAt: true,
      },
    });
    expect(opcionesTransaccion?.isolationLevel).toBe(
      Prisma.TransactionIsolationLevel.ReadCommitted,
    );
    expect(JSON.stringify(result)).not.toContain('codigoQr');
    expect(JSON.stringify(result)).not.toContain('correo');
    expect(JSON.stringify(result)).not.toContain('identificacion');
    expect(JSON.stringify(result)).not.toContain('nacimiento');
  });

  it('reports an already validated QR without changing its original validation time', async () => {
    const validadoAt = new Date('2026-11-09T12:00:00.000Z');
    transaction.asistente.updateMany.mockResolvedValue({ count: 0 });
    transaction.asistente.findUnique.mockResolvedValue({
      numeroBoleta: 12,
      tipo: TipoAsistente.ADULTO,
      validado: true,
      validadoAt,
    });

    await expect(service.verificarIngreso('B'.repeat(43))).resolves.toEqual({
      resultado: 'YA_VALIDADO',
      numeroBoleta: 12,
      tipo: TipoAsistente.ADULTO,
      validadoAt,
    });
    expect(transaction.asistente.updateMany).toHaveBeenCalledTimes(1);
    expect(transaction.asistente.findUnique).toHaveBeenCalledTimes(1);
  });

  it('distinguishes a missing QR from an inconsistent validation state', async () => {
    transaction.asistente.updateMany.mockResolvedValue({ count: 0 });
    transaction.asistente.findUnique.mockResolvedValue(null);

    await expect(service.verificarIngreso('C'.repeat(43))).rejects.toThrow(
      'La entrada no existe.',
    );

    transaction.asistente.findUnique.mockResolvedValue({
      numeroBoleta: 12,
      tipo: TipoAsistente.ADULTO,
      validado: true,
      validadoAt: null,
    });
    await expect(service.verificarIngreso('D'.repeat(43))).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('rejects malformed QR strings before opening a transaction', async () => {
    await expect(service.verificarIngreso('not-a-qr')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('maps one atomic QR update and one concurrent no-op to the correct outcomes', async () => {
    let validatedAt: Date | null = null;
    transaction.asistente.updateMany.mockImplementation(
      (args: { data: { validadoAt: Date } }) => {
        if (validatedAt) return Promise.resolve({ count: 0 });

        validatedAt = args.data.validadoAt;
        return Promise.resolve({ count: 1 });
      },
    );
    transaction.asistente.findUnique.mockImplementation(() =>
      Promise.resolve({
        numeroBoleta: 12,
        tipo: TipoAsistente.ADULTO,
        validado: true,
        validadoAt: validatedAt,
      }),
    );

    const results = await Promise.all([
      service.verificarIngreso('E'.repeat(43)),
      service.verificarIngreso('E'.repeat(43)),
    ]);

    expect(results.map(({ resultado }) => resultado).sort()).toEqual([
      'INGRESO_REGISTRADO',
      'YA_VALIDADO',
    ]);
    expect(results[0].validadoAt).toEqual(results[1].validadoAt);
  });

  it('lists only approved attendee fields in stable ticket order', async () => {
    const asistentes = [
      {
        numeroBoleta: 1,
        nombre: 'Ana',
        tipo: TipoAsistente.ADULTO,
        validado: false,
        validadoAt: null,
      },
    ];
    prisma.asistente.findMany.mockResolvedValue(asistentes);
    const result = await service.listar();

    expect(result).toEqual({ asistentes, total: 1 });
    expect(prisma.asistente.findMany).toHaveBeenCalledWith({
      select: {
        numeroBoleta: true,
        nombre: true,
        tipo: true,
        validado: true,
        validadoAt: true,
      },
      orderBy: { numeroBoleta: 'asc' },
    });
    expect(JSON.stringify(result)).not.toContain('codigoQr');
    expect(JSON.stringify(result)).not.toContain('correo');
    expect(JSON.stringify(result)).not.toContain('identificacion');
  });

  it('registers a child who is still six years old', async () => {
    const result = await service.registrarIndividual(nino('2020-11-09'));

    expect(result.tipo).toBe(TipoAsistente.NINO);
    expect(datosCreacion).toMatchObject({
      correo: null,
      identificacion: null,
      nacimiento: new Date('2020-11-09T00:00:00.000Z'),
    });
  });

  it('rejects an adult without email', async () => {
    await expect(
      service.registrarIndividual({ ...adulto(), correo: undefined }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an adult without identification', async () => {
    await expect(
      service.registrarIndividual({ ...adulto(), identificacion: undefined }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an adult with a birth date', async () => {
    await expect(
      service.registrarIndividual({
        ...adulto(),
        nacimiento: '1990-01-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a child without a birth date', async () => {
    await expect(
      service.registrarIndividual({ ...nino(), nacimiento: undefined }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a child with email', async () => {
    await expect(
      service.registrarIndividual({ ...nino(), correo: 'child@example.com' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a child with identification', async () => {
    await expect(
      service.registrarIndividual({ ...nino(), identificacion: 'ID-123' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a child who has turned seven today', async () => {
    await expect(
      service.registrarIndividual(nino('2019-11-10')),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects registration when the event capacity is exhausted', async () => {
    transaction.asistente.count.mockResolvedValue(100);

    await expect(service.registrarIndividual(adulto())).rejects.toThrow(
      ConflictException,
    );
    expect(transaction.asistente.findMany).not.toHaveBeenCalled();
    expect(transaction.asistente.create).not.toHaveBeenCalled();
  });

  it('fails safely when the capacity configuration is missing', async () => {
    transaction.$queryRaw.mockResolvedValue([]);

    await expect(service.registrarIndividual(adulto())).rejects.toThrow(
      InternalServerErrorException,
    );
    expect(transaction.asistente.create).not.toHaveBeenCalled();
  });

  it('assigns the first free ticket number', async () => {
    transaction.asistente.findMany.mockResolvedValue([
      { numeroBoleta: 1 },
      { numeroBoleta: 3 },
    ]);

    await service.registrarIndividual(adulto());

    expect(datosCreacion?.numeroBoleta).toBe(2);
  });

  it('does not assign a ticket number outside 1..100', async () => {
    transaction.asistente.findMany.mockResolvedValue(
      Array.from({ length: 100 }, (_, index) => ({
        numeroBoleta: index + 1,
      })),
    );

    await expect(service.registrarIndividual(adulto())).rejects.toThrow(
      'No hay números de boleta disponibles.',
    );
    expect(transaction.asistente.create).not.toHaveBeenCalled();
  });

  it('translates a unique constraint failure and rolls back the transaction', async () => {
    transaction.asistente.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique conflict', {
        code: 'P2002',
        clientVersion: '7.10.1',
        meta: { target: ['codigoQr'] },
      }),
    );

    await expect(service.registrarIndividual(adulto())).rejects.toThrow(
      ConflictException,
    );
    expect(rollback).toBe(true);
  });

  it('uses the same transaction client for capacity checks and creation', async () => {
    await service.registrarIndividual(adulto());

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.configuracionEvento.findUnique).toHaveBeenCalledTimes(1);
    expect(transaction.asistente.count).toHaveBeenCalledTimes(1);
    expect(transaction.reserva.aggregate).toHaveBeenCalledTimes(1);
    expect(transaction.asistente.findMany).toHaveBeenCalledTimes(1);
    expect(transaction.asistente.create).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('creates the assistant only after the capacity lock and occupancy checks', async () => {
    await service.registrarIndividual(adulto());

    expect(eventos).toEqual([
      'bloqueo-capacidad',
      'configuracion',
      'conteo-asistentes',
      'reservas-vigentes',
      'boletas-ocupadas',
      'crear-asistente',
    ]);
  });

  it('rejects client-supplied QR codes and ticket numbers', async () => {
    await expect(
      service.registrarIndividual({
        ...adulto(),
        codigoQr: 'client-qr',
      } as RegistroAsistenteInput),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.registrarIndividual({
        ...adulto(),
        numeroBoleta: 10,
      } as RegistroAsistenteInput),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  function adulto(): RegistroAsistenteInput {
    return {
      tipo: TipoAsistente.ADULTO,
      nombre: ' Ana Pérez ',
      correo: ' ana@example.com ',
      identificacion: ' ID-123 ',
    };
  }

  function nino(
    nacimiento: string | null = '2020-01-01',
  ): RegistroAsistenteInput {
    return {
      tipo: TipoAsistente.NINO,
      nombre: 'Luis Pérez',
      nacimiento,
    };
  }
});
