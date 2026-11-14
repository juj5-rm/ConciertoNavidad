jest.mock('@nestjs/passport', () => {
  const nestCommon =
    jest.requireActual<typeof import('@nestjs/common')>('@nestjs/common');
  const { UnauthorizedException } = nestCommon;
  const jwt = jest.requireActual<typeof import('jsonwebtoken')>('jsonwebtoken');
  const testSecret = 'a-secure-test-secret-with-at-least-32-bytes';

  return {
    AuthGuard: () =>
      class {
        canActivate(context: {
          switchToHttp(): {
            getRequest(): {
              headers: { cookie?: string };
              user?: unknown;
            };
          };
        }): boolean {
          const request = context.switchToHttp().getRequest();
          const token = request.headers.cookie
            ?.split(';')
            .map((part) => part.trim())
            .find((part) => part.startsWith('auth_session='))
            ?.slice('auth_session='.length);
          if (!token) throw new UnauthorizedException('No autenticado.');

          let subject: string;
          try {
            const payload = jwt.verify(token, testSecret, {
              algorithms: ['HS256'],
            });
            if (
              typeof payload === 'string' ||
              typeof payload.sub !== 'string'
            ) {
              throw new Error('Invalid test JWT subject.');
            }
            subject = payload.sub;
          } catch {
            throw new UnauthorizedException('No autenticado.');
          }

          const users: Record<
            string,
            { id: string; email: string; rol: string }
          > = {
            '550e8400-e29b-41d4-a716-446655440000': {
              id: '550e8400-e29b-41d4-a716-446655440000',
              email: 'admin@example.test',
              rol: 'ADMIN',
            },
            '550e8400-e29b-41d4-a716-446655440001': {
              id: '550e8400-e29b-41d4-a716-446655440001',
              email: 'operator@example.test',
              rol: 'OPERADOR',
            },
          };
          const user = users[subject];

          if (!user) throw new UnauthorizedException('No autenticado.');
          request.user = user;
          return true;
        }

        handleRequest(): unknown {
          return undefined;
        }
      },
  };
});

jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import type { Request } from 'express';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import jwt from 'jsonwebtoken';
import { RolUsuario } from '@prisma/client';
import { AppController } from '../../app.controller';
import { AppService } from '../../app.service';
import { AUTH_SECURITY_CONFIGURATION } from '../auth.constants';
import { AuthController } from '../auth.controller';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { AuthService } from '../auth.service';
import type { SecurityConfiguration } from '../../config/security.config';

const TEST_SECRET = 'a-secure-test-secret-with-at-least-32-bytes';
const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440000';
const OPERATOR_ID = '550e8400-e29b-41d4-a716-446655440001';
const ADMIN_TOKEN = jwt.sign(
  { sub: ADMIN_ID, role: RolUsuario.OPERADOR },
  TEST_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' },
);
const OPERATOR_TOKEN = jwt.sign(
  { sub: OPERATOR_ID, role: RolUsuario.ADMIN },
  TEST_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' },
);

@Controller('__authorization-test')
class AuthorizationTestController {
  @Get('admin')
  @Roles(RolUsuario.ADMIN)
  adminOnly(@Req() request: Request & { user: { rol: string } }) {
    return { role: request.user.rol };
  }

  @Get('unconfigured')
  unconfigured() {
    return { message: 'must not be accessible' };
  }
}

describe('authorization HTTP integration (Passport boundary stubbed)', () => {
  let app: INestApplication<App>;
  const security: SecurityConfiguration = {
    environment: 'test',
    port: 3001,
    jwtSecret: TEST_SECRET,
    jwtExpiresIn: '1h',
    corsOrigins: ['http://localhost:3000'],
    authCookieName: 'auth_session',
    authCookieSameSite: 'lax',
    authCookieSecure: false,
    authCookiePath: '/',
    authCookieMaxAge: 60 * 60 * 1000,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController, AuthController, AuthorizationTestController],
      providers: [
        { provide: AppService, useValue: { getHello: () => 'public route' } },
        {
          provide: AuthService,
          useValue: {
            login: jest.fn().mockResolvedValue({
              token: 'test-issued-token',
              user: {
                id: '550e8400-e29b-41d4-a716-446655440000',
                email: 'admin@example.test',
                rol: RolUsuario.ADMIN,
              },
            }),
          },
        },
        { provide: AUTH_SECURITY_CONFIGURATION, useValue: security },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows the explicitly public root route without a cookie', async () => {
    const response = await request(app.getHttpServer()).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toBe('public route');
  });

  it('allows the explicitly public login route without a cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.test', password: 'test-password' });

    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('allows the explicitly public logout route without a cookie', async () => {
    const response = await request(app.getHttpServer()).post('/auth/logout');

    expect(response.status).toBe(200);
    expect((response.body as { message: string }).message).toBe(
      'Sesión cerrada.',
    );
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('returns 401 for /auth/me without an authenticated cookie', async () => {
    const response = await request(app.getHttpServer()).get('/auth/me');

    expect(response.status).toBe(401);
    expect((response.body as { message: string }).message).toBe(
      'No autenticado.',
    );
  });

  it.each([
    ['ADMIN', ADMIN_TOKEN],
    ['OPERADOR', OPERATOR_TOKEN],
  ])('allows %s on /auth/me', async (_role, token) => {
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `auth_session=${token}`);

    expect(response.status).toBe(200);
    expect((response.body as { user: { rol: string } }).user.rol).toBe(_role);
  });

  it('returns 403 for OPERADOR on an ADMIN-only test route', async () => {
    const response = await request(app.getHttpServer())
      .get('/__authorization-test/admin')
      .set('Cookie', `auth_session=${OPERATOR_TOKEN}`);

    expect(response.status).toBe(403);
  });

  it('denies an authenticated request to a protected route without policy', async () => {
    const response = await request(app.getHttpServer())
      .get('/__authorization-test/unconfigured')
      .set('Cookie', `auth_session=${ADMIN_TOKEN}`);

    expect(response.status).toBe(403);
  });
});
