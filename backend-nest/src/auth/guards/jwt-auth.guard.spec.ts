import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class {
      canActivate(): boolean {
        return (
          (this as unknown as { passportResult?: boolean }).passportResult ??
          true
        );
      }

      handleRequest(): unknown {
        return undefined;
      }
    },
}));

describe('JwtAuthGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(undefined),
  } as unknown as Reflector;
  const guard = new JwtAuthGuard(reflector);
  const context = {} as ExecutionContext;
  const authenticatedUser = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'user@example.com',
    rol: 'OPERADOR' as const,
  };

  it.each([
    ['missing cookie', undefined],
    ['invalid token', new Error('invalid token')],
    ['expired token', new Error('jwt expired')],
    ['inactive user', undefined],
    ['missing user', undefined],
  ])('returns a generic 401 for %s', (_scenario, info) => {
    try {
      guard.handleRequest(null, false, info, context);
      throw new Error('Expected request to be rejected.');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getStatus()).toBe(401);
      expect((error as UnauthorizedException).message).toBe('No autenticado.');
    }
  });

  it('allows a user returned by the strategy', () => {
    expect(
      guard.handleRequest(null, authenticatedUser, undefined, context),
    ).toEqual(authenticatedUser);
  });

  it('allows public routes without invoking Passport', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue({ type: 'public' });
    const publicContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
    (guard as unknown as { passportResult: boolean }).passportResult = false;

    expect(guard.canActivate(publicContext)).toBe(true);
  });

  it('does not bypass Passport for malformed public metadata', () => {
    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValue({ type: 'public', roles: [] });
    const malformedPublicContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
    (guard as unknown as { passportResult: boolean }).passportResult = false;

    expect(guard.canActivate(malformedPublicContext)).toBe(false);
  });

  it('does not bypass Passport for public metadata with an unexpected prototype', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(
      Object.assign(Object.create({ inherited: true }), {
        type: 'public',
      }),
    );
    const unexpectedPrototypeContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
    (guard as unknown as { passportResult: boolean }).passportResult = false;

    expect(guard.canActivate(unexpectedPrototypeContext)).toBe(false);
  });

  it('delegates protected routes to Passport', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(undefined);
    const protectedContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
    (guard as unknown as { passportResult: boolean }).passportResult = false;

    expect(guard.canActivate(protectedContext)).toBe(false);
  });

  it('does not convert infrastructure errors into unauthorized responses', () => {
    const error = new Error('database unavailable');

    expect(() => guard.handleRequest(error, null, undefined, context)).toThrow(
      error,
    );
  });
});
