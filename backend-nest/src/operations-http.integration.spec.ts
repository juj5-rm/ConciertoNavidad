import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { RolUsuario, TipoAsistente } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AsistentesController } from './asistentes/asistentes.controller';
import { AsistentesService } from './asistentes/asistentes.service';
import { CapacidadController } from './capacidad/capacidad.controller';
import { CapacidadService } from './capacidad/capacidad.service';
import { RolesGuard } from './auth/guards/roles.guard';

class TestAuthenticationGuard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { rol: RolUsuario };
    }>();
    const role = request.headers['x-test-role'];

    if (role !== RolUsuario.ADMIN && role !== RolUsuario.OPERADOR) {
      throw new UnauthorizedException('No autenticado.');
    }

    request.user = { rol: role };
    return true;
  }
}

describe('authorized business HTTP routes', () => {
  let app: INestApplication<App>;
  const asistentesService = {
    verificarIngreso: jest.fn().mockResolvedValue({
      resultado: 'INGRESO_REGISTRADO',
      numeroBoleta: 12,
      tipo: TipoAsistente.ADULTO,
      validadoAt: new Date('2026-11-10T12:00:00.000Z'),
    }),
    listar: jest.fn().mockResolvedValue({
      asistentes: [
        {
          numeroBoleta: 12,
          nombre: 'Ana',
          tipo: TipoAsistente.ADULTO,
          validado: true,
          validadoAt: new Date('2026-11-10T12:00:00.000Z'),
        },
      ],
      total: 1,
    }),
  };
  const capacidadService = {
    getAdministrativeSnapshot: jest.fn().mockResolvedValue({
      capacidadMaxima: 100,
      asistentesRegistrados: 12,
      reservasVigentes: 0,
      ocupacionTotal: 12,
      disponibles: 88,
    }),
    updateMaximumCapacity: jest.fn().mockResolvedValue({
      capacidadMaxima: 80,
      asistentesRegistrados: 12,
      reservasVigentes: 0,
      ocupacionTotal: 12,
      disponibles: 68,
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AsistentesController, CapacidadController],
      providers: [
        { provide: AsistentesService, useValue: asistentesService },
        { provide: CapacidadService, useValue: capacidadService },
        { provide: APP_GUARD, useClass: TestAuthenticationGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows ADMIN and OPERADOR to verify a QR entry', async () => {
    for (const role of [RolUsuario.ADMIN, RolUsuario.OPERADOR]) {
      const response = await request(app.getHttpServer())
        .post('/asistentes/verificar-qr')
        .set('x-test-role', role)
        .send({ codigoQr: 'A'.repeat(43) });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        resultado: 'INGRESO_REGISTRADO',
        numeroBoleta: 12,
        tipo: TipoAsistente.ADULTO,
      });
    }
    expect(asistentesService.verificarIngreso).toHaveBeenCalledTimes(2);
  });

  it('allows only ADMIN to list attendees', async () => {
    const adminResponse = await request(app.getHttpServer())
      .get('/asistentes')
      .set('x-test-role', RolUsuario.ADMIN);
    const operatorResponse = await request(app.getHttpServer())
      .get('/asistentes')
      .set('x-test-role', RolUsuario.OPERADOR);

    expect(adminResponse.status).toBe(200);
    expect((adminResponse.body as { total: number }).total).toBe(1);
    expect(operatorResponse.status).toBe(403);
    expect(asistentesService.listar).toHaveBeenCalledTimes(1);
  });

  it('allows only ADMIN to consult or update capacity', async () => {
    const adminRead = await request(app.getHttpServer())
      .get('/capacidad')
      .set('x-test-role', RolUsuario.ADMIN);
    const operatorRead = await request(app.getHttpServer())
      .get('/capacidad')
      .set('x-test-role', RolUsuario.OPERADOR);
    const adminUpdate = await request(app.getHttpServer())
      .patch('/capacidad')
      .set('x-test-role', RolUsuario.ADMIN)
      .send({ capacidadMaxima: 80 });
    const operatorUpdate = await request(app.getHttpServer())
      .patch('/capacidad')
      .set('x-test-role', RolUsuario.OPERADOR)
      .send({ capacidadMaxima: 80 });

    expect(adminRead.status).toBe(200);
    expect((adminRead.body as { disponibles: number }).disponibles).toBe(88);
    expect(operatorRead.status).toBe(403);
    expect(adminUpdate.status).toBe(200);
    expect(
      (adminUpdate.body as { capacidadMaxima: number }).capacidadMaxima,
    ).toBe(80);
    expect(operatorUpdate.status).toBe(403);
    expect(capacidadService.getAdministrativeSnapshot).toHaveBeenCalledTimes(1);
    expect(capacidadService.updateMaximumCapacity).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid payloads and requests without an authenticated role', async () => {
    const malformedQr = await request(app.getHttpServer())
      .post('/asistentes/verificar-qr')
      .set('x-test-role', RolUsuario.ADMIN)
      .send({ codigoQr: 'invalid' });
    const extraQrField = await request(app.getHttpServer())
      .post('/asistentes/verificar-qr')
      .set('x-test-role', RolUsuario.ADMIN)
      .send({ codigoQr: 'A'.repeat(43), extra: true });
    const invalidCapacity = await request(app.getHttpServer())
      .patch('/capacidad')
      .set('x-test-role', RolUsuario.ADMIN)
      .send({ capacidadMaxima: 100.5 });
    const unauthenticated = await request(app.getHttpServer()).get(
      '/capacidad',
    );

    expect(malformedQr.status).toBe(400);
    expect(extraQrField.status).toBe(400);
    expect(invalidCapacity.status).toBe(400);
    expect(unauthenticated.status).toBe(401);
    expect(asistentesService.verificarIngreso).not.toHaveBeenCalled();
    expect(capacidadService.updateMaximumCapacity).not.toHaveBeenCalled();
  });
});
