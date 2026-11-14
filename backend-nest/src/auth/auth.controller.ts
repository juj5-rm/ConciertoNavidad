import {
  Controller,
  Body,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import type { Response } from 'express';
import {
  createAuthCookieClearOptions,
  createAuthCookieOptions,
} from '../config/security.config';
import type { SecurityConfiguration } from '../config/security.config';
import { AUTH_SECURITY_CONFIGURATION } from './auth.constants';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { AuthService, AuthenticatedUser } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';
import { LoginDto } from './dto/login.dto';

interface LoginResponse {
  message: string;
  user: AuthenticatedUser;
}

@Controller('auth')
export class AuthController {
  private readonly security: SecurityConfiguration;

  constructor(
    private readonly authService: AuthService,
    @Inject(AUTH_SECURITY_CONFIGURATION)
    security: SecurityConfiguration,
  ) {
    this.security = security;
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() credentials: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.authService.login(credentials);
    response.cookie(
      this.security.authCookieName,
      result.token,
      createAuthCookieOptions(this.security),
    );

    return {
      message: 'Inicio de sesión exitoso.',
      user: result.user,
    };
  }

  @Get('me')
  @Roles(RolUsuario.ADMIN, RolUsuario.OPERADOR)
  getCurrentUser(@Req() request: AuthenticatedRequest): {
    user: AuthenticatedUser;
  } {
    return { user: request.user };
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) response: Response): {
    message: string;
  } {
    response.clearCookie(
      this.security.authCookieName,
      createAuthCookieClearOptions(this.security),
    );
    return { message: 'Sesión cerrada.' };
  }
}
