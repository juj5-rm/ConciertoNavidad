import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { JwtModuleOptions } from '@nestjs/jwt';
import { RolUsuario } from '@prisma/client';
import { compare } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityConfiguration } from '../config/security.config';
import { createJwtOptions } from './jwt.options';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));
jest.mock('bcryptjs', () => ({ compare: jest.fn() }));

describe('AuthService', () => {
  const credentials: LoginDto = {
    email: 'admin@example.com',
    password: 'correct horse battery staple',
  };
  const storedUser = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: credentials.email,
    passwordHash: '$2b$12$stored-hash',
    rol: RolUsuario.ADMIN,
    activo: true,
  };
  type PublicUser = Pick<typeof storedUser, 'id' | 'email' | 'rol'>;
  let prisma: {
    usuario: {
      findUnique: jest.Mock<Promise<typeof storedUser | null>, [unknown]>;
      update: jest.Mock<Promise<PublicUser>, [unknown]>;
    };
  };
  let jwtService: {
    signAsync: jest.Mock<Promise<string>, [Record<string, unknown>]>;
  };
  let service: AuthService;
  const compareMock = compare as jest.Mock<Promise<boolean>, [string, string]>;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-10T15:00:00.000Z'));
    compareMock.mockReset().mockResolvedValue(true);
    prisma = {
      usuario: {
        findUnique: jest
          .fn<Promise<typeof storedUser | null>, [unknown]>()
          .mockResolvedValue(storedUser),
        update: jest.fn<Promise<PublicUser>, [unknown]>().mockResolvedValue({
          id: storedUser.id,
          email: storedUser.email,
          rol: storedUser.rol,
        }),
      },
    };
    jwtService = {
      signAsync: jest
        .fn<Promise<string>, [Record<string, unknown>]>()
        .mockResolvedValue('signed.jwt.token'),
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('authenticates an active user with a valid bcrypt password', async () => {
    const result = await service.login(credentials);

    expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
      where: { email: credentials.email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        rol: true,
        activo: true,
      },
    });
    expect(compareMock).toHaveBeenCalledWith(
      credentials.password,
      storedUser.passwordHash,
    );
    expect(result.user).toEqual({
      id: storedUser.id,
      email: storedUser.email,
      rol: RolUsuario.ADMIN,
    });
    expect(result.token).toBe('signed.jwt.token');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('uses the UUID subject and role in the JWT without sensitive fields', async () => {
    await service.login(credentials);

    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: storedUser.id,
      role: RolUsuario.ADMIN,
    });
    const payload = jwtService.signAsync.mock.calls[0][0];
    expect(payload).not.toHaveProperty('password');
    expect(payload).not.toHaveProperty('passwordHash');
    expect(payload).not.toHaveProperty('email');
  });

  it('updates lastLoginAt after credentials pass and before returning success', async () => {
    await service.login(credentials);

    expect(prisma.usuario.update).toHaveBeenCalledWith({
      where: { id: storedUser.id },
      data: { lastLoginAt: new Date('2026-11-10T15:00:00.000Z') },
      select: { id: true, email: true, rol: true },
    });
    expect(jwtService.signAsync.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.usuario.update.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ['unknown email', null],
    ['inactive user', { ...storedUser, activo: false }],
  ])('returns generic credentials error for %s', async (_scenario, user) => {
    prisma.usuario.findUnique.mockResolvedValue(user);

    const error = await service
      .login(credentials)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getStatus()).toBe(401);
    expect((error as UnauthorizedException).message).toBe(
      'Credenciales inválidas o cuenta inactiva.',
    );
    expect(prisma.usuario.update).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('returns the same generic credentials error for an incorrect password', async () => {
    compareMock.mockResolvedValue(false);

    await expect(service.login(credentials)).rejects.toMatchObject({
      status: 401,
      message: 'Credenciales inválidas o cuenta inactiva.',
    });
    expect(prisma.usuario.update).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('does not disclose Prisma lookup failures as credential errors', async () => {
    prisma.usuario.findUnique.mockRejectedValue(
      new Error('sensitive database failure'),
    );

    const error = await service
      .login(credentials)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as Error).message).toBe('No fue posible iniciar sesión.');
    expect((error as Error).message).not.toContain(
      'sensitive database failure',
    );
  });

  it('does not disclose JWT signing failures or update the login timestamp', async () => {
    jwtService.signAsync.mockRejectedValue(
      new Error('sensitive signing failure'),
    );

    const error = await service
      .login(credentials)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as Error).message).toBe('No fue posible iniciar sesión.');
    expect((error as Error).message).not.toContain('sensitive signing failure');
    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });

  it('does not report success when updating lastLoginAt fails', async () => {
    prisma.usuario.update.mockRejectedValue(
      new Error('sensitive database failure'),
    );

    await expect(service.login(credentials)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});

describe('JWT module options', () => {
  it('uses the validated one-hour duration and signing secret', () => {
    const security: SecurityConfiguration = {
      environment: 'development',
      port: 3001,
      jwtSecret: 'test-secret-with-at-least-thirty-two-bytes',
      jwtExpiresIn: '1h',
      corsOrigins: ['http://localhost:3000'],
      authCookieName: 'concierto_auth',
      authCookieSameSite: 'lax',
      authCookieSecure: false,
      authCookiePath: '/',
      authCookieMaxAge: 60 * 60 * 1000,
    };
    const options = createJwtOptions(security);

    expect(options).toEqual({
      secret: security.jwtSecret,
      signOptions: { expiresIn: '1h' },
    } satisfies JwtModuleOptions);
  });
});
