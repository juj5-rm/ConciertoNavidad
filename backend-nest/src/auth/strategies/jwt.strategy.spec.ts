import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';
import type { SecurityConfiguration } from '../../config/security.config';
import {
  createJwtStrategyOptions,
  JwtStrategy,
  extractJwtFromAuthCookie,
} from './jwt.strategy';

jest.mock('@nestjs/passport', () => ({
  PassportStrategy: (Strategy: new (options: unknown) => object) =>
    class extends Strategy {
      constructor(options: unknown) {
        super(options);
      }
    },
}));

jest.mock('passport-jwt', () => ({
  Strategy: class {
    constructor(readonly options: unknown) { }
  },
}));

describe('JwtStrategy', () => {
  const security: SecurityConfiguration = {
    environment: 'development',
    port: 3001,
    jwtSecret: 'test-secret-with-at-least-thirty-two-bytes',
    jwtExpiresIn: '1h',
    corsOrigins: ['http://localhost:3000'],
    authCookieName: 'session_cookie',
    authCookieSameSite: 'lax',
    authCookieSecure: false,
    authCookiePath: '/',
    authCookieMaxAge: 60 * 60 * 1000,
  };
  const userId = '550e8400-e29b-41d4-a716-446655440000';
  let prisma: { usuario: { findUnique: jest.Mock } };
  let strategy: JwtStrategy;

  beforeEach(() => {
    prisma = {
      usuario: {
        findUnique: jest.fn().mockResolvedValue({
          id: userId,
          email: 'current@example.com',
          rol: RolUsuario.ADMIN,
          activo: true,
        }),
      },
    };
    strategy = new JwtStrategy(security, prisma as unknown as PrismaService);
  });

  it('extracts the token only from the configured cookie', () => {
    expect(
      extractJwtFromAuthCookie(
        {
          headers: {
            cookie: 'other=value; session_cookie=header.jwt.value',
          },
        },
        security.authCookieName,
      ),
    ).toBe('header.jwt.value');
    expect(
      extractJwtFromAuthCookie(
        { headers: { authorization: 'Bearer header.jwt.value' } },
        security.authCookieName,
      ),
    ).toBeNull();
    expect(
      extractJwtFromAuthCookie(
        { headers: { cookie: 'other=value' } },
        security.authCookieName,
      ),
    ).toBeNull();
  });

  it('rejects duplicate configured cookies rather than choosing an ambiguous value', () => {
    expect(
      extractJwtFromAuthCookie(
        {
          headers: {
            cookie:
              'session_cookie=first.jwt.value; session_cookie=second.jwt.value',
          },
        },
        security.authCookieName,
      ),
    ).toBeNull();
  });

  it('validates claims and returns the current database user and role', async () => {
    const now = Math.floor(Date.now() / 1000);
    const result = await strategy.validate({
      sub: userId,
      role: RolUsuario.OPERADOR,
      iat: now,
      exp: now + 3600,
    });

    expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
      where: { id: userId },
      select: { id: true, email: true, rol: true, activo: true },
    });
    expect(result).toEqual({
      id: userId,
      email: 'current@example.com',
      rol: RolUsuario.ADMIN,
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it.each([
    ['malformed subject', { sub: 'not-a-uuid', role: RolUsuario.ADMIN }],
    ['unsupported role', { sub: userId, role: 'SUPERADMIN' }],
    ['missing role', { sub: userId }],
  ])('rejects %s before querying the user', async (_scenario, payload) => {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      strategy.validate({ ...payload, iat: now, exp: now + 3600 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an absent database user', async () => {
    const now = Math.floor(Date.now() / 1000);
    prisma.usuario.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({
        sub: userId,
        role: RolUsuario.ADMIN,
        iat: now,
        exp: now + 3600,
      }),
    ).rejects.toMatchObject({
      status: 401,
      message: 'No autenticado.',
    });
  });

  it('rejects an inactive database user', async () => {
    const now = Math.floor(Date.now() / 1000);
    prisma.usuario.findUnique.mockResolvedValue({
      id: userId,
      email: 'current@example.com',
      rol: RolUsuario.ADMIN,
      activo: false,
    });

    await expect(
      strategy.validate({
        sub: userId,
        role: RolUsuario.ADMIN,
        iat: now,
        exp: now + 3600,
      }),
    ).rejects.toMatchObject({
      status: 401,
      message: 'No autenticado.',
    });
  });

  it('returns a generic internal error for Prisma failures', async () => {
    const now = Math.floor(Date.now() / 1000);
    prisma.usuario.findUnique.mockRejectedValue(
      new Error('sensitive database failure'),
    );

    const error = await strategy
      .validate({
        sub: userId,
        role: RolUsuario.ADMIN,
        iat: now,
        exp: now + 3600,
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as Error).message).toBe('No fue posible validar la sesión.');
    expect((error as Error).message).not.toContain(
      'sensitive database failure',
    );
  });

  it('uses the configured cookie, secret, algorithm, and expiration checks', () => {
    const options = createJwtStrategyOptions(security);

    expect(options.secretOrKey).toBe(security.jwtSecret);
    expect(options.ignoreExpiration).toBe(false);
    expect(options.algorithms).toEqual(['HS256']);
    expect(options.maxAge).toBe('1h');
    expect(
      options.jwtFromRequest({
        headers: {
          cookie: 'session_cookie=only.from.cookie',
        },
      }),
    ).toBe('only.from.cookie');
    expect(
      options.jwtFromRequest({
        headers: {
          authorization: 'Bearer not-accepted',
        },
      }),
    ).toBeNull();
    expect(strategy).toBeInstanceOf(JwtStrategy);
  });

  it('accepts a valid real HS256 token from the configured secret', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        sub: userId,
        role: RolUsuario.ADMIN,
        iat: now,
        exp: now + 3600,
      },
      security.jwtSecret,
      { algorithm: 'HS256' },
    );

    const verified = jwt.verify(token, security.jwtSecret, {
      algorithms: ['HS256'],
    });

    await expect(strategy.validate(verified)).resolves.toEqual({
      id: userId,
      email: 'current@example.com',
      rol: RolUsuario.ADMIN,
    });
  });

  it('rejects a token with an invalid signature', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        sub: userId,
        role: RolUsuario.ADMIN,
        iat: now,
        exp: now + 3600,
      },
      'different-secret-than-configured',
      { algorithm: 'HS256' },
    );

    expect(() =>
      jwt.verify(token, security.jwtSecret, { algorithms: ['HS256'] }),
    ).toThrow();
  });

  it('rejects a token signed with a non-HS256 algorithm', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        sub: userId,
        role: RolUsuario.ADMIN,
        iat: now,
        exp: now + 3600,
      },
      security.jwtSecret,
      { algorithm: 'HS384' },
    );

    expect(() =>
      jwt.verify(token, security.jwtSecret, { algorithms: ['HS256'] }),
    ).toThrow();
  });

  it('rejects an expired token', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        sub: userId,
        role: RolUsuario.ADMIN,
        iat: now - 3700,
        exp: now - 1,
      },
      security.jwtSecret,
      { algorithm: 'HS256' },
    );

    expect(() =>
      jwt.verify(token, security.jwtSecret, { algorithms: ['HS256'] }),
    ).toThrow();
  });

  it('rejects tokens without exp', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: userId,
      role: RolUsuario.ADMIN,
      iat: now,
    };

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects tokens without iat', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: userId,
      role: RolUsuario.ADMIN,
      exp: now + 3600,
    };

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token whose age exceeds one hour', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: userId,
      role: RolUsuario.ADMIN,
      iat: now - 3700,
      exp: now + 100,
    };

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a token whose age is within one hour', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: userId,
      role: RolUsuario.ADMIN,
      iat: now - 3590,
      exp: now + 100,
    };

    await expect(strategy.validate(payload)).resolves.toEqual({
      id: userId,
      email: 'current@example.com',
      rol: RolUsuario.ADMIN,
    });
  });
});
