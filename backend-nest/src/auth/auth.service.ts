import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RolUsuario } from '@prisma/client';
import { compare } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { INVALID_CREDENTIALS_MESSAGE } from './auth.constants';
import { LoginDto } from './dto/login.dto';

export interface AuthenticatedUser {
  id: string;
  email: string;
  rol: RolUsuario;
}

export interface LoginResult {
  token: string;
  user: AuthenticatedUser;
}

const LOGIN_FAILURE_MESSAGE = 'No fue posible iniciar sesión.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(credentials: LoginDto): Promise<LoginResult> {
    let user: {
      id: string;
      email: string;
      passwordHash: string;
      rol: RolUsuario;
      activo: boolean;
    } | null;
    try {
      user = await this.prisma.usuario.findUnique({
        where: { email: credentials.email },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          rol: true,
          activo: true,
        },
      });
    } catch {
      throw new InternalServerErrorException(LOGIN_FAILURE_MESSAGE);
    }

    if (!user || !user.activo) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    let passwordMatches: boolean;
    try {
      passwordMatches = await compare(credentials.password, user.passwordHash);
    } catch {
      throw new InternalServerErrorException(LOGIN_FAILURE_MESSAGE);
    }

    if (!passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    let token: string;
    try {
      token = await this.jwtService.signAsync({
        sub: user.id,
        role: user.rol,
      });
    } catch {
      throw new InternalServerErrorException(LOGIN_FAILURE_MESSAGE);
    }

    let updatedUser: AuthenticatedUser;
    try {
      updatedUser = await this.prisma.usuario.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
        select: {
          id: true,
          email: true,
          rol: true,
        },
      });
    } catch {
      throw new InternalServerErrorException(LOGIN_FAILURE_MESSAGE);
    }

    return { token, user: updatedUser };
  }
}
