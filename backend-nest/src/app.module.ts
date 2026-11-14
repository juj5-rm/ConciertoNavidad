import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AsistentesModule } from './asistentes/asistentes.module';
import { AuthModule } from './auth/auth.module';
import { CapacidadModule } from './capacidad/capacidad.module';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { validateEnvironment } from './config/security.config';
import { GruposModule } from './grupos/grupos.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReservasModule } from './reservas/reservas.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    AuthModule,
    ConfiguracionModule,
    CapacidadModule,
    AsistentesModule,
    GruposModule,
    ReservasModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
