import type { Response } from 'express';
import {
  createAuthCookieClearOptions,
  createAuthCookieOptions,
  SecurityConfiguration,
} from '../config/security.config';
import { AuthService, LoginResult } from './auth.service';
import { AuthController } from './auth.controller';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedRequest } from './auth.types';

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class {
      handleRequest(): unknown {
        return undefined;
      }
    },
}));
jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService { },
}));

describe('AuthController', () => {
  const security: SecurityConfiguration = {
    environment: 'production',
    port: 3001,
    jwtSecret: 'test-secret-with-at-least-thirty-two-bytes',
    jwtExpiresIn: '1h',
    corsOrigins: ['https://frontend.example.test'],
    authCookieName: 'concierto_auth',
    authCookieSameSite: 'none',
    authCookieSecure: true,
    authCookieDomain: undefined,
    authCookiePath: '/',
    authCookieMaxAge: 60 * 60 * 1000,
  };
  const credentials: LoginDto = {
    email: 'admin@example.com',
    password: 'correct horse battery staple',
  };
  const user = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: credentials.email,
    rol: 'ADMIN' as const,
  };
  const token = 'signed.jwt.token';
  let authService: { login: jest.Mock };
  let response: { cookie: jest.Mock; clearCookie: jest.Mock };
  let controller: AuthController;

  beforeEach(() => {
    authService = {
      login: jest.fn().mockResolvedValue({ token, user } satisfies LoginResult),
    };
    response = { cookie: jest.fn(), clearCookie: jest.fn() };
    controller = new AuthController(
      authService as unknown as AuthService,
      security,
    );
  });

  it('calls the service with submitted credentials and sets the configured cookie', async () => {
    await controller.login(credentials, response as unknown as Response);

    expect(authService.login).toHaveBeenCalledWith(credentials);
    expect(response.cookie).toHaveBeenCalledWith(
      security.authCookieName,
      token,
      createAuthCookieOptions(security),
    );
  });

  it('returns only the public user and message, never the JWT or credentials', async () => {
    const body = await controller.login(
      credentials,
      response as unknown as Response,
    );

    expect(body).toEqual({
      message: 'Inicio de sesión exitoso.',
      user,
    });
    expect(JSON.stringify(body)).not.toContain(token);
    expect(JSON.stringify(body)).not.toContain(credentials.password);
    expect(JSON.stringify(body)).not.toContain('passwordHash');
    expect(JSON.stringify(body)).not.toContain(security.jwtSecret);
  });

  it('propagates authentication HTTP errors without setting a cookie', async () => {
    const error = new Error('authentication failed');
    authService.login.mockRejectedValue(error);

    await expect(
      controller.login(credentials, response as unknown as Response),
    ).rejects.toBe(error);
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('returns the authenticated request user without re-querying or exposing token fields', () => {
    const body = controller.getCurrentUser({
      user,
    } as AuthenticatedRequest);
    const descriptor = Object.getOwnPropertyDescriptor(
      AuthController.prototype,
      'getCurrentUser',
    );

    expect(body).toEqual({ user });
    expect(JSON.stringify(body)).not.toContain(token);
    expect(JSON.stringify(body)).not.toContain('passwordHash');
    expect(authService.login).not.toHaveBeenCalled();
    if (!descriptor || typeof descriptor.value !== 'function') {
      throw new Error('Expected the /auth/me handler to exist.');
    }
    const handler = descriptor.value as (...args: unknown[]) => unknown;
    expect(Reflect.getMetadata('__guards__', handler)).toContain(JwtAuthGuard);
  });

  it('clears the configured cookie with immediate expiration and no maxAge', () => {
    const responseForLogout = response as unknown as Response;
    const result = controller.logout(responseForLogout);
    const clearOptions = createAuthCookieClearOptions(security);

    expect(response.clearCookie.mock.calls).toEqual([
      [security.authCookieName, clearOptions],
    ]);
    expect(clearOptions).not.toHaveProperty('maxAge');
    expect(clearOptions.expires?.getTime()).toBe(0);
    expect(result).toEqual({ message: 'Sesión cerrada.' });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('preserves a configured cookie domain when clearing the cookie', () => {
    const domainSecurity = {
      ...security,
      authCookieDomain: 'example.test',
    };
    const domainController = new AuthController(
      authService as unknown as AuthService,
      domainSecurity,
    );
    const domainResponse = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };

    domainController.logout(domainResponse as unknown as Response);

    expect(domainResponse.clearCookie.mock.calls).toEqual([
      [
        domainSecurity.authCookieName,
        createAuthCookieClearOptions(domainSecurity),
      ],
    ]);
    expect(createAuthCookieClearOptions(domainSecurity).domain).toBe(
      'example.test',
    );
  });
});
