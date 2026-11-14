import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AUTH_ACCESS_POLICY_METADATA,
  isAuthAccessPolicy,
  isRolUsuario,
} from '../auth-access-policy';
import { UNAUTHENTICATED_MESSAGE } from '../auth.constants';

interface RequestWithUser {
  user?: { rol?: unknown } | null;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<unknown>(
      AUTH_ACCESS_POLICY_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (isAuthAccessPolicy(policy) && policy.type === 'public') return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request?.user) {
      throw new UnauthorizedException(UNAUTHENTICATED_MESSAGE);
    }

    if (!isAuthAccessPolicy(policy) || policy.type !== 'roles') {
      throw new ForbiddenException('Acceso denegado.');
    }

    if (
      !isRolUsuario(request.user.rol) ||
      !policy.roles.includes(request.user.rol)
    ) {
      throw new ForbiddenException('Acceso denegado.');
    }

    return true;
  }
}
