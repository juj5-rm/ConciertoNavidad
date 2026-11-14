import { RolUsuario } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import {
  AUTH_ACCESS_POLICY_METADATA,
  AuthAccessPolicy,
  isAuthAccessPolicy,
} from '../auth-access-policy';
import { Public } from './public.decorator';
import { Roles } from './roles.decorator';

@Public()
class PublicController {}

@Roles(RolUsuario.ADMIN)
class AdminController {
  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  sharedRoute(this: void): void {}
}

class MethodPolicyController {
  @Public()
  publicRoute(this: void): void {}

  @Roles(RolUsuario.OPERADOR)
  operatorRoute(this: void): void {}
}

describe('authorization decorators', () => {
  const reflector = new Reflector();

  it('accepts plain role and public policies', () => {
    expect(
      isAuthAccessPolicy({
        type: 'roles',
        roles: [RolUsuario.ADMIN, RolUsuario.OPERADOR],
      }),
    ).toBe(true);
    expect(isAuthAccessPolicy({ type: 'public' })).toBe(true);
  });

  it.each([
    [
      'role policy with a custom prototype',
      Object.assign(Object.create({ inherited: true }), {
        type: 'roles',
        roles: [RolUsuario.ADMIN],
      }),
    ],
    [
      'public policy with a custom prototype',
      Object.assign(Object.create({ inherited: true }), {
        type: 'public',
      }),
    ],
    [
      'policy with an inherited additional property',
      Object.assign(Object.create({ additional: true }), {
        type: 'roles',
        roles: [RolUsuario.ADMIN],
      }),
    ],
    [
      'class instance with valid-looking properties',
      new (class {
        type = 'roles';
        roles = [RolUsuario.ADMIN];
      })(),
    ],
  ])('rejects %s', (_scenario, policy) => {
    expect(isAuthAccessPolicy(policy)).toBe(false);
  });

  it('rejects an object created without a prototype', () => {
    const policy: unknown = Object.create(null);
    if (typeof policy === 'object' && policy !== null) {
      Reflect.set(policy, 'type', 'roles');
      Reflect.set(policy, 'roles', [RolUsuario.ADMIN]);
    }

    expect(isAuthAccessPolicy(policy)).toBe(false);
  });

  it('stores public metadata on a class and a method', () => {
    expect(
      reflector.get<AuthAccessPolicy>(
        AUTH_ACCESS_POLICY_METADATA,
        PublicController,
      ),
    ).toEqual({ type: 'public' });
    expect(
      reflector.get<AuthAccessPolicy>(
        AUTH_ACCESS_POLICY_METADATA,
        MethodPolicyController.prototype.publicRoute,
      ),
    ).toEqual({ type: 'public' });
  });

  it('stores roles on a class and allows method metadata to override it', () => {
    expect(
      reflector.get<AuthAccessPolicy>(
        AUTH_ACCESS_POLICY_METADATA,
        AdminController,
      ),
    ).toEqual({ type: 'roles', roles: [RolUsuario.ADMIN] });
    expect(
      reflector.get<AuthAccessPolicy>(
        AUTH_ACCESS_POLICY_METADATA,
        AdminController.prototype.sharedRoute,
      ),
    ).toEqual({
      type: 'roles',
      roles: [RolUsuario.ADMIN, RolUsuario.OPERADOR],
    });
    expect(
      reflector.get<AuthAccessPolicy>(
        AUTH_ACCESS_POLICY_METADATA,
        MethodPolicyController.prototype.operatorRoute,
      ),
    ).toEqual({ type: 'roles', roles: [RolUsuario.OPERADOR] });
  });

  it('rejects an empty roles list', () => {
    expect(() => Roles()).toThrow('@Roles requires at least one role.');
  });

  it('rejects a role outside the Prisma enum at runtime', () => {
    expect(() => Roles('ROL_INEXISTENTE' as RolUsuario)).toThrow(
      '@Roles requires valid RolUsuario values.',
    );
  });
});
