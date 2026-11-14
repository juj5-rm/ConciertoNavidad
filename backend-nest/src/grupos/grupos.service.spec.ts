import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, TipoAsistente } from '@prisma/client';
import { AsistentesService } from '../asistentes/asistentes.service';
import { CapacidadService } from '../capacidad/capacidad.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { PrismaService } from '../prisma/prisma.service';
import { CONSENT_VERSION } from './consentimiento.constants';
import { CrearGrupoInput, GruposService } from './grupos.service';

describe('GruposService', () => {
  const fechaActual = new Date('2026-11-10T12:00:00.000Z');
  let service: GruposService;
  let asistentesService: AsistentesService;
  let transaction: {
    $queryRaw: jest.Mock;
    configuracionEvento: { findUnique: jest.Mock };
    asistente: {
      count: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
    };
    reserva: { aggregate: jest.Mock };
    grupo: { create: jest.Mock };
  };
  let prisma: { $transaction: jest.Mock };
  let eventos: string[];
  let asistentesCreados: Array<Prisma.AsistenteUncheckedCreateInput>;
  let opcionesTransaccion:
    { isolationLevel?: Prisma.TransactionIsolationLevel } | undefined;
  let rollback: boolean;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(fechaActual);
    eventos = [];
    asistentesCreados = [];
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
              eventos.push(
                args.data.grupoId === null ? 'crear-lider' : 'crear-miembro',
              );
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
          eventos.push('reservas-vigentes');
          return Promise.resolve({ _sum: { cantidad: null } });
        }),
      },
      grupo: {
        create: jest.fn().mockImplementation(
          (args: {
            data: {
              leaderId: string;
              createdById: null;
              consentimientoAceptadoAt: Date;
              consentimientoVersion: string;
            };
          }) => {
            eventos.push('crear-grupo');
            return Promise.resolve({
              id: 'grupo-1',
              leaderId: args.data.leaderId,
            });
          },
        ),
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
    asistentesService = new AsistentesService(
      prisma as unknown as PrismaService,
      capacidadService,
    );
    service = new GruposService(
      prisma as unknown as PrismaService,
      asistentesService,
      capacidadService,
    );
  });

  it('requires an adult leader and valid consent before opening a transaction', async () => {
    await expect(
      crearConConsentimiento({
        lider: nino('Líder niño'),
        miembros: [],
      }),
    ).rejects.toThrow('El líder del grupo debe ser un adulto.');

    await expect(
      service.crear({
        lider: adulto('Líder'),
        miembros: [],
        consentimientoAceptado: false,
        consentimientoVersion: CONSENT_VERSION,
      }),
    ).rejects.toThrow('La aceptación del tratamiento de datos es obligatoria.');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a group with an adult leader and adult members', async () => {
    const result = await crearConConsentimiento({
      lider: adulto('Líder'),
      miembros: [adulto('Miembro 1'), adulto('Miembro 2')],
    });

    expect(result.id).toBe('grupo-1');
    expect(result.leaderId).toBe('asistente-1');
    expect(result.lider.nombre).toBe('Líder');
    expect(result.miembros.map(({ nombre }) => nombre)).toEqual([
      'Miembro 1',
      'Miembro 2',
    ]);
  });

  it('creates a group with child participants', async () => {
    const result = await crearConConsentimiento({
      lider: adulto('Líder adulto'),
      miembros: [nino('Miembro niño', '2020-11-09')],
    });

    expect(result.lider.tipo).toBe(TipoAsistente.ADULTO);
    expect(result.miembros[0].tipo).toBe(TipoAsistente.NINO);
    expect(asistentesCreados[1].correo).toBeNull();
    expect(asistentesCreados[1].identificacion).toBeNull();
  });

  it('creates a group with a mixture of adults and children', async () => {
    const result = await crearConConsentimiento({
      lider: adulto('Líder adulto'),
      miembros: [nino('Niño'), adulto('Miembro adulto')],
    });

    expect([
      result.lider.tipo,
      ...result.miembros.map(({ tipo }) => tipo),
    ]).toEqual([
      TipoAsistente.ADULTO,
      TipoAsistente.NINO,
      TipoAsistente.ADULTO,
    ]);
  });

  it('rejects an invalid leader before opening a transaction', async () => {
    await expect(
      crearConConsentimiento({
        lider: { ...adulto('Líder'), correo: undefined },
        miembros: [],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid member before opening a transaction', async () => {
    await expect(
      crearConConsentimiento({
        lider: adulto('Líder'),
        miembros: [{ ...adulto('Miembro'), identificacion: undefined }],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a child member who has turned seven', async () => {
    await expect(
      crearConConsentimiento({
        lider: adulto('Líder'),
        miembros: [nino('Miembro', '2019-11-10')],
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects the entire group when capacity cannot fit every participant', async () => {
    transaction.asistente.count.mockResolvedValue(98);

    await expect(
      crearConConsentimiento({
        lider: adulto('Líder'),
        miembros: [adulto('Miembro 1'), adulto('Miembro 2')],
      }),
    ).rejects.toThrow(ConflictException);
    expect(transaction.asistente.findMany).not.toHaveBeenCalled();
    expect(transaction.asistente.create).not.toHaveBeenCalled();
    expect(transaction.grupo.create).not.toHaveBeenCalled();
  });

  it('fails safely when the capacity configuration is missing', async () => {
    transaction.$queryRaw.mockResolvedValue([]);

    await expect(
      crearConConsentimiento({ lider: adulto('Líder'), miembros: [] }),
    ).rejects.toThrow(InternalServerErrorException);
    expect(transaction.asistente.create).not.toHaveBeenCalled();
    expect(transaction.grupo.create).not.toHaveBeenCalled();
  });

  it('assigns unique available ticket numbers to the whole group', async () => {
    transaction.asistente.findMany.mockResolvedValue([
      { numeroBoleta: 1 },
      { numeroBoleta: 3 },
    ]);

    await crearConConsentimiento({
      lider: adulto('Líder'),
      miembros: [adulto('Miembro 1'), adulto('Miembro 2')],
    });

    expect(asistentesCreados.map(({ numeroBoleta }) => numeroBoleta)).toEqual([
      2, 4, 5,
    ]);
    expect(
      new Set(asistentesCreados.map(({ numeroBoleta }) => numeroBoleta)).size,
    ).toBe(3);
  });

  it('allocates ticket numbers above 100 when lower numbers are occupied', async () => {
    transaction.asistente.findMany.mockResolvedValue(
      Array.from({ length: 100 }, (_, index) => ({
        numeroBoleta: index + 1,
      })),
    );

    await crearConConsentimiento({
      lider: adulto('Líder'),
      miembros: [adulto('Miembro')],
    });

    expect(asistentesCreados.map(({ numeroBoleta }) => numeroBoleta)).toEqual([
      101, 102,
    ]);
  });

  it('generates an independent cryptographically formatted QR for each attendee', async () => {
    const result = await crearConConsentimiento({
      lider: adulto('Líder'),
      miembros: [adulto('Miembro 1'), adulto('Miembro 2')],
    });
    const qrCodes = [
      result.lider.codigoQr,
      ...result.miembros.map(({ codigoQr }) => codigoQr),
    ];

    expect(qrCodes).toHaveLength(3);
    expect(qrCodes.every((code) => /^[A-Za-z0-9_-]{43}$/.test(code))).toBe(
      true,
    );
    expect(new Set(qrCodes).size).toBe(3);
  });

  it('creates the leader before the group and the group before its members', async () => {
    await crearConConsentimiento({
      lider: adulto('Líder'),
      miembros: [adulto('Miembro 1'), adulto('Miembro 2')],
    });

    expect(eventos.slice(-4)).toEqual([
      'crear-lider',
      'crear-grupo',
      'crear-miembro',
      'crear-miembro',
    ]);
  });

  it('uses the same transaction client for capacity, tickets, group, and members', async () => {
    await crearConConsentimiento({
      lider: adulto('Líder'),
      miembros: [adulto('Miembro')],
    });

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.configuracionEvento.findUnique).toHaveBeenCalledTimes(1);
    expect(transaction.asistente.count).toHaveBeenCalledTimes(1);
    expect(transaction.reserva.aggregate).toHaveBeenCalledTimes(1);
    expect(transaction.asistente.findMany).toHaveBeenCalledTimes(1);
    expect(transaction.asistente.create).toHaveBeenCalledTimes(2);
    expect(transaction.grupo.create).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('uses ReadCommitted isolation', async () => {
    await crearConConsentimiento({ lider: adulto('Líder'), miembros: [] });

    expect(opcionesTransaccion).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  });

  it('rolls back the leader if group creation fails', async () => {
    transaction.grupo.create.mockRejectedValue(new Error('database detail'));

    await expect(
      crearConConsentimiento({ lider: adulto('Líder'), miembros: [] }),
    ).rejects.toThrow(InternalServerErrorException);
    expect(rollback).toBe(true);
    expect(asistentesCreados).toHaveLength(1);
  });

  it('rolls back the group, leader, and earlier members if a member fails', async () => {
    transaction.asistente.create.mockImplementation(
      (args: { data: Prisma.AsistenteUncheckedCreateInput }) => {
        const index = asistentesCreados.length;
        asistentesCreados.push(args.data);
        if (index === 2) {
          return Promise.reject(new Error('database detail'));
        }
        return Promise.resolve({
          id: `asistente-${index + 1}`,
          nombre: args.data.nombre,
          tipo: args.data.tipo,
          codigoQr: args.data.codigoQr,
          numeroBoleta: args.data.numeroBoleta,
        });
      },
    );

    await expect(
      crearConConsentimiento({
        lider: adulto('Líder'),
        miembros: [adulto('Miembro 1'), adulto('Miembro 2')],
      }),
    ).rejects.toThrow(InternalServerErrorException);
    expect(rollback).toBe(true);
    expect(asistentesCreados).toHaveLength(3);
  });

  it('translates unique constraint conflicts and rolls back', async () => {
    transaction.asistente.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique conflict', {
        code: 'P2002',
        clientVersion: '7.10.1',
        meta: { target: ['codigoQr'] },
      }),
    );

    await expect(
      crearConConsentimiento({ lider: adulto('Líder'), miembros: [] }),
    ).rejects.toThrow(ConflictException);
    expect(rollback).toBe(true);
  });

  it('creates a standalone leader and associates only new members with the group', async () => {
    await crearConConsentimiento({
      lider: adulto('Líder'),
      miembros: [adulto('Miembro 1'), adulto('Miembro 2')],
    });

    expect(transaction.grupo.create).toHaveBeenCalledWith({
      data: {
        leaderId: 'asistente-1',
        createdById: null,
        consentimientoAceptadoAt: fechaActual,
        consentimientoVersion: CONSENT_VERSION,
      },
      select: { id: true, leaderId: true },
    });
    expect(asistentesCreados.map(({ grupoId }) => grupoId)).toEqual([
      null,
      'grupo-1',
      'grupo-1',
    ]);
  });

  function adulto(nombre: string): CrearGrupoInput['lider'] {
    return {
      tipo: TipoAsistente.ADULTO,
      nombre,
      correo: `${nombre.toLowerCase().replaceAll(' ', '.')}@example.com`,
      identificacion: `ID-${nombre}`,
    };
  }

  function crearConConsentimiento(
    input: Pick<CrearGrupoInput, 'lider' | 'miembros'>,
  ) {
    return service.crear({
      ...input,
      consentimientoAceptado: true,
      consentimientoVersion: CONSENT_VERSION,
    });
  }

  function nino(
    nombre: string,
    nacimiento = '2020-01-01',
  ): CrearGrupoInput['lider'] {
    return {
      tipo: TipoAsistente.NINO,
      nombre,
      nacimiento,
    };
  }
});
