import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class {
      handleRequest(): unknown {
        return undefined;
      }
    },
}));

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard();
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

  it('does not convert infrastructure errors into unauthorized responses', () => {
    const error = new Error('database unavailable');

    expect(() => guard.handleRequest(error, null, undefined, context)).toThrow(
      error,
    );
  });
});
