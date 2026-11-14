import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import type { SecurityConfiguration } from '../config/security.config';
import { AUTH_SECURITY_CONFIGURATION } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { createJwtOptions } from './jwt.options';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const security =
          configService.getOrThrow<SecurityConfiguration>('security');
        return createJwtOptions(security);
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    {
      provide: AUTH_SECURITY_CONFIGURATION,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        configService.getOrThrow<SecurityConfiguration>('security'),
    },
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule { }
