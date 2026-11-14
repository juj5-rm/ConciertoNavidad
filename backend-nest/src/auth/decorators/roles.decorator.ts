import { SetMetadata } from '@nestjs/common';
import type { RolUsuario } from '@prisma/client';
import { isRolUsuario } from '../auth-access-policy';
import {
  AUTH_ACCESS_POLICY_METADATA,
  type AuthAccessPolicy,
} from '../auth-access-policy';

export function Roles(
  ...roles: RolUsuario[]
): MethodDecorator & ClassDecorator {
  if (roles.length === 0) {
    throw new Error('@Roles requires at least one role.');
  }
  if (!roles.every(isRolUsuario)) {
    throw new Error('@Roles requires valid RolUsuario values.');
  }

  return SetMetadata(AUTH_ACCESS_POLICY_METADATA, {
    type: 'roles',
    roles,
  } satisfies AuthAccessPolicy);
}
