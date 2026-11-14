import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UNAUTHENTICATED_MESSAGE } from '../auth.constants';
import type { AuthenticatedUser } from '../auth.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
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
