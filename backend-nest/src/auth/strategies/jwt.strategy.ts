import {
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { RolUsuario } from '@prisma/client';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { SecurityConfiguration } from '../../config/security.config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AUTH_SECURITY_CONFIGURATION,
  UNAUTHENTICATED_MESSAGE,
} from '../auth.constants';
import type { AuthenticatedUser } from '../auth.service';
import type { JwtPayload } from '../auth.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_ROLES = new Set<string>(Object.values(RolUsuario));

export interface JwtCookieStrategyOptions {
  jwtFromRequest: (
    request: Pick<Request, 'headers'> | undefined,
  ) => string | null;
  secretOrKey: string;
  ignoreExpiration: false;
  algorithms: ['HS256'];
  maxAge: '1h';
}

export function createJwtStrategyOptions(
  security: SecurityConfiguration,
): JwtCookieStrategyOptions {
  return {
    jwtFromRequest: (request: Request | undefined) =>
      extractJwtFromAuthCookie(request, security.authCookieName),
    secretOrKey: security.jwtSecret,
    ignoreExpiration: false,
    algorithms: ['HS256'],
    maxAge: '1h',
  };
}

export function extractJwtFromAuthCookie(
  request: Pick<Request, 'headers'> | undefined,
  cookieName: string,
): string | null {
  const cookieHeader = request?.headers.cookie;
  if (typeof cookieHeader !== 'string') return null;

  const prefix = `${cookieName}=`;
  const matches = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(prefix));
  if (matches.length !== 1) return null;

  const token = matches[0].slice(prefix.length);
  return token.length > 0 ? token : null;
}

function isJwtPayload(value: unknown): value is JwtPayload {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === 'string' &&
    UUID_PATTERN.test(payload.sub) &&
    typeof payload.role === 'string' &&
    ALLOWED_ROLES.has(payload.role) &&
    typeof payload.iat === 'number' &&
    Number.isFinite(payload.iat) &&
    typeof payload.exp === 'number' &&
    Number.isFinite(payload.exp)
  );
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(AUTH_SECURITY_CONFIGURATION)
    security: SecurityConfiguration,
    private readonly prisma: PrismaService,
  ) {
    super({ ...createJwtStrategyOptions(security) });
  }

  async validate(payload: unknown): Promise<AuthenticatedUser> {
    if (!isJwtPayload(payload)) {
      throw new UnauthorizedException(UNAUTHENTICATED_MESSAGE);
    }

    // Validación de antigüedad máxima de 1h
    const now = Math.floor(Date.now() / 1000);
    const maxAgeSeconds = 60 * 60; // 1 hora
    if (
      typeof payload.iat !== 'number' ||
      !Number.isFinite(payload.iat) ||
      payload.iat > now ||
      now - payload.iat > maxAgeSeconds
    ) {
      throw new UnauthorizedException(UNAUTHENTICATED_MESSAGE);
    }

    let user: {
      id: string;
      email: string;
      rol: RolUsuario;
      activo: boolean;
    } | null;
    try {
      user = await this.prisma.usuario.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          rol: true,
          activo: true,
        },
      });
    } catch {
      throw new InternalServerErrorException(
        'No fue posible validar la sesión.',
      );
    }

    if (!user || !user.activo) {
      throw new UnauthorizedException(UNAUTHENTICATED_MESSAGE);
    }

    return {
      id: user.id,
      email: user.email,
      rol: user.rol,
    };
  }
}
