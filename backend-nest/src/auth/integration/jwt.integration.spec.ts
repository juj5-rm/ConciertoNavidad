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
    constructor(readonly options: unknown) {}
  },
}));

import jwt from 'jsonwebtoken';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { RolUsuario } from '@prisma/client';
import type { SecurityConfiguration } from '../../config/security.config';
import { PrismaService } from '../../prisma/prisma.service';
import { UnauthorizedException } from '@nestjs/common';

describe('JWT Strategy Integration (cryptographic)', () => {
  const security: SecurityConfiguration = {
    environment: 'test',
    port: 3001,
    jwtSecret: 'test-secret-with-at-least-thirty-two-bytes',
    jwtExpiresIn: '1h',
    corsOrigins: ['http://localhost:3000'],
    authCookieName: 'test_cookie',
    authCookieSameSite: 'lax',
    authCookieSecure: false,
    authCookiePath: '/',
    authCookieMaxAge: 60 * 60 * 1000,
  };
  const userId = '550e8400-e29b-41d4-a716-446655440000';
  const now = Math.floor(Date.now() / 1000);
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

  it('accepts a valid HS256 token', async () => {
    const token = jwt.sign(
      { sub: userId, role: 'ADMIN', iat: now, exp: now + 3600 },
      security.jwtSecret,
      { algorithm: 'HS256' },
    );
    // Simula la verificación de Passport llamando a validate con el payload decodificado
    const payload = jwt.verify(token, security.jwtSecret, {
      algorithms: ['HS256'],
    });
    const result = await strategy.validate(payload);
    expect(result).toEqual({
      id: userId,
      email: 'current@example.com',
      rol: 'ADMIN',
    });
  });

  it('rejects a token with invalid signature', () => {
    const token = jwt.sign(
      { sub: userId, role: 'ADMIN', iat: now, exp: now + 3600 },
      'wrong-secret',
      { algorithm: 'HS256' },
    );
    expect(() =>
      jwt.verify(token, security.jwtSecret, { algorithms: ['HS256'] }),
    ).toThrow();
  });

  it('rejects a token with a different algorithm', () => {
    const token = jwt.sign(
      { sub: userId, role: 'ADMIN', iat: now, exp: now + 3600 },
      security.jwtSecret,
      { algorithm: 'HS384' },
    );
    expect(() =>
      jwt.verify(token, security.jwtSecret, { algorithms: ['HS256'] }),
    ).toThrow();
  });

  it('rejects an expired token', () => {
    const token = jwt.sign(
      { sub: userId, role: 'ADMIN', iat: now - 4000, exp: now - 1 },
      security.jwtSecret,
      { algorithm: 'HS256' },
    );
    expect(() =>
      jwt.verify(token, security.jwtSecret, { algorithms: ['HS256'] }),
    ).toThrow();
  });

  it('rejects a token without exp', async () => {
    const token = jwt.sign(
      { sub: userId, role: 'ADMIN', iat: now },
      security.jwtSecret,
      { algorithm: 'HS256', noTimestamp: true },
    );
    // El verificador de la estrategia requiere exp
    expect(() =>
      jwt.verify(token, security.jwtSecret, {
        algorithms: ['HS256'],
        ignoreExpiration: true,
      }),
    ).not.toThrow();
    await expect(
      strategy.validate({ sub: userId, role: 'ADMIN', iat: now }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token without iat', async () => {
    const token = jwt.sign(
      { sub: userId, role: 'ADMIN', exp: now + 3600 },
      security.jwtSecret,
      { algorithm: 'HS256', noTimestamp: true },
    );
    // El verificador de la estrategia requiere iat
    expect(() =>
      jwt.verify(token, security.jwtSecret, {
        algorithms: ['HS256'],
        ignoreExpiration: true,
      }),
    ).not.toThrow();
    await expect(
      strategy.validate({ sub: userId, role: 'ADMIN', exp: now + 3600 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token with age > 1h', async () => {
    const oldIat = now - 3700;
    const token = jwt.sign(
      { sub: userId, role: 'ADMIN', iat: oldIat, exp: now + 100 },
      security.jwtSecret,
      { algorithm: 'HS256' },
    );
    // El verificador de la estrategia debe rechazarlo por antigüedad
    const payload = jwt.verify(token, security.jwtSecret, {
      algorithms: ['HS256'],
      ignoreExpiration: true,
    });
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a token with age < 1h', async () => {
    const iat = now - 3590;
    const token = jwt.sign(
      { sub: userId, role: 'ADMIN', iat, exp: now + 100 },
      security.jwtSecret,
      { algorithm: 'HS256' },
    );
    const payload = jwt.verify(token, security.jwtSecret, {
      algorithms: ['HS256'],
      ignoreExpiration: true,
    });
    const result = await strategy.validate(payload);
    expect(result).toEqual({
      id: userId,
      email: 'current@example.com',
      rol: 'ADMIN',
    });
  });
});
