import { RolUsuario } from '@prisma/client';

export const AUTH_ACCESS_POLICY_METADATA = 'auth:access-policy';

export type AuthAccessPolicy =
  { type: 'public' } | { type: 'roles'; roles: readonly RolUsuario[] };

const VALID_ROLES = new Set<string>(Object.values(RolUsuario));

export function isRolUsuario(value: unknown): value is RolUsuario {
  return typeof value === 'string' && VALID_ROLES.has(value);
}

export function isAuthAccessPolicy(value: unknown): value is AuthAccessPolicy {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    !('type' in value)
  ) {
    return false;
  }

  const keys = Reflect.ownKeys(value);
  if (value.type === 'public') {
    return keys.length === 1 && keys[0] === 'type';
  }

  if (
    value.type !== 'roles' ||
    !('roles' in value) ||
    keys.length !== 2 ||
    !keys.includes('type') ||
    !keys.includes('roles')
  ) {
    return false;
  }

  const roles = value.roles;
  return Array.isArray(roles) && roles.length > 0 && roles.every(isRolUsuario);
}
