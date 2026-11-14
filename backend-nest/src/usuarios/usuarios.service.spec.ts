import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RolUsuario } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ActualizarOperadorDto } from './dto/actualizar-operador.dto';
import { CrearOperadorDto } from './dto/crear-operador.dto';
import { UsuariosService } from './usuarios.service';

jest.mock('bcryptjs', () => ({ hash: jest.fn() }));

describe('UsuariosService', () => {
  const operatorId = '550e8400-e29b-41d4-a716-446655440001';
  const adminId = '550e8400-e29b-41d4-a716-446655440000';
  const createdAt = new Date('2026-11-14T12:00:00.000Z');
  const operator = {
    id: operatorId,
    email: 'operador@example.test',
    rol: RolUsuario.OPERADOR,
    activo: true,
    createdAt,
  };
  let prisma: {
    usuario: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: UsuariosService;
  const hashMock = hash as jest.MockedFunction<typeof hash>;

  beforeEach(() => {
    jest.clearAllMocks();
    hashMock.mockImplementation(() => Promise.resolve('$2b$12$stored-hash'));
    prisma = {
      usuario: {
        findMany: jest.fn().mockResolvedValue([operator]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(operator),
        update: jest.fn().mockResolvedValue(operator),
      },
    };
    service = new UsuariosService(prisma as unknown as PrismaService);
  });

  it('lists only OPERADOR accounts and selects no password hash', async () => {
    await expect(service.listarOperadores()).resolves.toEqual([operator]);
    expect(prisma.usuario.findMany).toHaveBeenCalledWith({
      where: { rol: RolUsuario.OPERADOR },
      select: {
        id: true,
        email: true,
        rol: true,
        activo: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  });

  it('creates a normalized OPERADOR account with a bcrypt hash', async () => {
    const input: CrearOperadorDto = {
      email: '  Operador@Example.Test ',
      password: 'a-secure-operator-password',
    };

    const result = await service.crearOperador(input);

    expect(hashMock).toHaveBeenCalledWith(input.password, 12);
    expect(prisma.usuario.create).toHaveBeenCalledWith({
      data: {
        email: 'operador@example.test',
        passwordHash: '$2b$12$stored-hash',
        rol: RolUsuario.OPERADOR,
        activo: true,
      },
      select: {
        id: true,
        email: true,
        rol: true,
        activo: true,
        createdAt: true,
      },
    });
    expect(result).toEqual(operator);
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate email addresses case-insensitively', async () => {
    prisma.usuario.findFirst.mockResolvedValue({ id: operatorId });

    await expect(
      service.crearOperador({
        email: 'OPERADOR@example.test',
        password: 'a-secure-operator-password',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(hashMock).not.toHaveBeenCalled();
    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });

  it('maps a concurrent unique-email violation to a conflict', async () => {
    prisma.usuario.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique violation', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.crearOperador({
        email: 'operator2@example.test',
        password: 'a-secure-operator-password',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates email and only hashes a newly supplied password', async () => {
    prisma.usuario.findFirst
      .mockResolvedValueOnce({
        id: operatorId,
        email: operator.email,
        rol: operator.rol,
      })
      .mockResolvedValueOnce(null);
    const updated = { ...operator, email: 'nuevo@example.test' };
    prisma.usuario.update.mockResolvedValue(updated);

    const result = await service.actualizarOperador(operatorId, adminId, {
      email: ' NUEVO@example.test ',
      password: 'a-new-secure-operator-password',
    } satisfies ActualizarOperadorDto);

    expect(hashMock).toHaveBeenCalledWith('a-new-secure-operator-password', 12);
    expect(prisma.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: operatorId },
        data: {
          email: 'nuevo@example.test',
          passwordHash: '$2b$12$stored-hash',
        },
      }),
    );
    expect(result).toEqual(updated);
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('does not change the stored password when the edit field is omitted', async () => {
    prisma.usuario.findFirst
      .mockResolvedValueOnce({
        id: operatorId,
        email: operator.email,
        rol: operator.rol,
      })
      .mockResolvedValueOnce(null);

    await service.actualizarOperador(operatorId, adminId, {
      email: 'nuevo@example.test',
    });

    expect(hashMock).not.toHaveBeenCalled();
    expect(prisma.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { email: 'nuevo@example.test' },
      }),
    );
  });

  it('rejects an empty update and passwords exceeding bcrypt byte limits', async () => {
    await expect(
      service.actualizarOperador(operatorId, adminId, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.crearOperador({
        email: 'operador2@example.test',
        password: 'á'.repeat(37),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not allow modifying the current account', async () => {
    await expect(
      service.actualizarEstado(operatorId, operatorId, false),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.usuario.findFirst).not.toHaveBeenCalled();
    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });

  it('does not expose ADMIN accounts through operator updates', async () => {
    prisma.usuario.findFirst.mockResolvedValue(null);

    await expect(
      service.actualizarEstado(adminId, operatorId, false),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'activates or deactivates an operator (%s)',
    async (activo) => {
      prisma.usuario.findFirst.mockResolvedValue({
        id: operatorId,
        email: operator.email,
        rol: operator.rol,
      });
      prisma.usuario.update.mockResolvedValue({ ...operator, activo });

      const result = await service.actualizarEstado(
        operatorId,
        adminId,
        activo,
      );

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: operatorId },
          data: { activo },
        }),
      );
      expect(result.activo).toBe(activo);
      expect(result).not.toHaveProperty('passwordHash');
    },
  );
});
