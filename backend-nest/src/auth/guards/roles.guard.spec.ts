import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolUsuario } from '@prisma/client';
import { AUTH_ACCESS_POLICY_METADATA } from '../auth-access-policy';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

class PublicController {
  @Public()
  route(): void {}
}

class AdminController {
  @Roles(RolUsuario.ADMIN)
  route(): void {}
}

class OperatorController {
  @Roles(RolUsuario.OPERADOR)
  route(): void {}
}

class SharedController {
  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  route(): void {}
}

class UnconfiguredController {
  route(): void {}
}

@Roles(RolUsuario.ADMIN)
class MethodOverrideController {
  @Roles(RolUsuario.OPERADOR)
  route(): void {}
}

function createContext(
  controller: new () => object,
  methodName: string,
  request: unknown,
): ExecutionContext {
  const handler = Object.getOwnPropertyDescriptor(
    controller.prototype,
    methodName,
  )?.value as ((...args: never[]) => unknown) | undefined;
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function createPolicyContext(
  policy: unknown,
  request: unknown,
): ExecutionContext {
  const handler = () => undefined;
  Reflect.defineMetadata(AUTH_ACCESS_POLICY_METADATA, policy, handler);
  return {
    getHandler: () => handler,
    getClass: () => UnconfiguredController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('allows a route explicitly marked public without a user', () => {
    expect(
      guard.canActivate(createContext(PublicController, 'route', {})),
    ).toBe(true);
  });

  it('rejects a protected request without an authenticated user', () => {
    expect(() =>
      guard.canActivate(createContext(AdminController, 'route', {})),
    ).toThrow(UnauthorizedException);
  });

  it('allows ADMIN when the policy permits ADMIN', () => {
    expect(
      guard.canActivate(
        createContext(AdminController, 'route', {
          user: { rol: RolUsuario.ADMIN },
        }),
      ),
    ).toBe(true);
  });

  it('allows OPERADOR when the policy permits only OPERADOR', () => {
    expect(
      guard.canActivate(
        createContext(OperatorController, 'route', {
          user: { rol: RolUsuario.OPERADOR },
        }),
      ),
    ).toBe(true);
  });

  it('allows OPERADOR when the policy explicitly permits OPERADOR', () => {
    expect(
      guard.canActivate(
        createContext(SharedController, 'route', {
          user: { rol: RolUsuario.OPERADOR },
        }),
      ),
    ).toBe(true);
  });

  it('allows ADMIN when the policy permits both roles', () => {
    expect(
      guard.canActivate(
        createContext(SharedController, 'route', {
          user: { rol: RolUsuario.ADMIN },
        }),
      ),
    ).toBe(true);
  });

  it('returns 403 when the authenticated role is not permitted', () => {
    expect(() =>
      guard.canActivate(
        createContext(AdminController, 'route', {
          user: { rol: RolUsuario.OPERADOR },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('denies a protected route without role metadata', () => {
    expect(() =>
      guard.canActivate(
        createContext(UnconfiguredController, 'route', {
          user: { rol: RolUsuario.ADMIN },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it.each([
    ['string roles', { type: 'roles', roles: 'ADMIN' }],
    ['null roles', { type: 'roles', roles: null }],
    ['undefined roles', { type: 'roles', roles: undefined }],
    ['empty roles', { type: 'roles', roles: [] }],
    [
      'unknown role in the array',
      { type: 'roles', roles: [RolUsuario.ADMIN, 'ROL_INEXISTENTE'] },
    ],
    ['numeric roles', { type: 'roles', roles: 123 }],
    ['missing policy fields', { roles: [RolUsuario.ADMIN] }],
    ['unknown policy type', { type: 'permissions', roles: [RolUsuario.ADMIN] }],
    [
      'extra public policy field',
      { type: 'public', roles: [RolUsuario.ADMIN] },
    ],
    ['null policy', null],
    ['undefined policy', undefined],
    [
      'roles policy with a custom prototype',
      Object.assign(Object.create({ inherited: true }), {
        type: 'roles',
        roles: [RolUsuario.ADMIN],
      }),
    ],
  ])('denies malformed metadata: %s', (_scenario, policy) => {
    expect(() =>
      guard.canActivate(
        createPolicyContext(policy, {
          user: { rol: RolUsuario.ADMIN },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('uses method role metadata over class role metadata', () => {
    expect(
      guard.canActivate(
        createContext(MethodOverrideController, 'route', {
          user: { rol: RolUsuario.OPERADOR },
        }),
      ),
    ).toBe(true);
  });

  it('uses request.user.rol rather than a role claim attached to the request', () => {
    expect(() =>
      guard.canActivate(
        createContext(AdminController, 'route', {
          user: { rol: RolUsuario.OPERADOR },
          jwtPayload: { role: RolUsuario.ADMIN },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('does not convert internal errors into authorization failures', () => {
    const error = new Error('metadata lookup failed');
    const throwingGuard = new RolesGuard({
      getAllAndOverride: () => {
        throw error;
      },
    } as unknown as Reflector);
    const handler = () => undefined;
    const context = {
      getHandler: () => handler,
      getClass: () => UnconfiguredController,
    } as unknown as ExecutionContext;

    expect(() => throwingGuard.canActivate(context)).toThrow(error);
  });
});
