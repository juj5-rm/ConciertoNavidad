import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import {
  AUTH_ACCESS_POLICY_METADATA,
  isAuthAccessPolicy,
} from '../auth-access-policy';
import { UNAUTHENTICATED_MESSAGE } from '../auth.constants';
import type { AuthenticatedUser } from '../auth.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const policy = this.reflector.getAllAndOverride<unknown>(
      AUTH_ACCESS_POLICY_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (isAuthAccessPolicy(policy) && policy.type === 'public') return true;

    return super.canActivate(context);
  }

  handleRequest<TUser = AuthenticatedUser>(
    error: unknown,
    user: TUser | null | false,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    void info;
    void context;
    void status;
    if (error instanceof Error) throw error;
    if (error) {
      throw new InternalServerErrorException(
        'No fue posible validar la sesión.',
      );
    }
    if (!user) throw new UnauthorizedException(UNAUTHENTICATED_MESSAGE);
    return user;
  }
}
