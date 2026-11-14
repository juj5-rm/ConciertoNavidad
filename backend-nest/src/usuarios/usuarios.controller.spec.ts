import {
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { RolUsuario } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440000';
const OPERATOR_ID = '550e8400-e29b-41d4-a716-446655440001';

@Injectable()
class TestAuthenticationGuard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { id: string; email: string; rol: RolUsuario };
    }>();
    const role = request.headers['x-test-role'];

    if (role !== RolUsuario.ADMIN && role !== RolUsuario.OPERADOR) {
      throw new UnauthorizedException('No autenticado.');
    }

    request.user = {
      id: role === RolUsuario.ADMIN ? ADMIN_ID : OPERATOR_ID,
      email:
        role === RolUsuario.ADMIN
          ? 'admin@example.test'
          : 'operador@example.test',
      rol: role,
    };
    return true;
  }
}

describe('UsuariosController authorization HTTP integration', () => {
  let app: INestApplication<App>;
  const usuariosService = {
    listarOperadores: jest.fn(),
    crearOperador: jest.fn(),
    actualizarOperador: jest.fn(),
    actualizarEstado: jest.fn(),
  };
  const operator = {
    id: OPERATOR_ID,
    email: 'operador@example.test',
    rol: RolUsuario.OPERADOR,
    activo: true,
    createdAt: new Date('2026-11-14T12:00:00.000Z'),
  };

  beforeEach(() => jest.clearAllMocks());

  beforeAll(async () => {
    usuariosService.listarOperadores.mockResolvedValue([operator]);
    usuariosService.crearOperador.mockResolvedValue(operator);
    usuariosService.actualizarOperador.mockResolvedValue(operator);
    usuariosService.actualizarEstado.mockResolvedValue({
      ...operator,
      activo: false,
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [UsuariosController],
      providers: [
        { provide: UsuariosService, useValue: usuariosService },
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

  it('allows ADMIN to list and create only operator accounts', async () => {
    const list = await request(app.getHttpServer())
      .get('/usuarios/operadores')
      .set('x-test-role', RolUsuario.ADMIN);
    const create = await request(app.getHttpServer())
      .post('/usuarios/operadores')
      .set('x-test-role', RolUsuario.ADMIN)
      .send({
        email: 'operador@example.test',
        password: 'a-secure-operator-password',
      });

    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({
      operadores: [
        {
          email: operator.email,
          rol: RolUsuario.OPERADOR,
          activo: true,
        },
      ],
    });
    expect(create.status).toBe(201);
    expect(JSON.stringify(create.body)).not.toContain('passwordHash');
    expect(usuariosService.listarOperadores).toHaveBeenCalledTimes(1);
    expect(usuariosService.crearOperador).toHaveBeenCalledWith({
      email: 'operador@example.test',
      password: 'a-secure-operator-password',
    });
  });

  it('restricts all operator-management operations to ADMIN', async () => {
    const list = await request(app.getHttpServer())
      .get('/usuarios/operadores')
      .set('x-test-role', RolUsuario.OPERADOR);
    const create = await request(app.getHttpServer())
      .post('/usuarios/operadores')
      .set('x-test-role', RolUsuario.OPERADOR)
      .send({
        email: 'otro@example.test',
        password: 'a-secure-operator-password',
      });
    const edit = await request(app.getHttpServer())
      .patch(`/usuarios/operadores/${OPERATOR_ID}`)
      .set('x-test-role', RolUsuario.OPERADOR)
      .send({ email: 'nuevo@example.test' });
    const deactivate = await request(app.getHttpServer())
      .patch(`/usuarios/operadores/${OPERATOR_ID}/estado`)
      .set('x-test-role', RolUsuario.OPERADOR)
      .send({ activo: false });

    expect(list.status).toBe(403);
    expect(create.status).toBe(403);
    expect(edit.status).toBe(403);
    expect(deactivate.status).toBe(403);
    expect(usuariosService.listarOperadores).not.toHaveBeenCalled();
    expect(usuariosService.crearOperador).not.toHaveBeenCalled();
    expect(usuariosService.actualizarOperador).not.toHaveBeenCalled();
    expect(usuariosService.actualizarEstado).not.toHaveBeenCalled();
  });

  it('requires authentication and rejects requests that attempt to assign a role', async () => {
    const unauthenticated = await request(app.getHttpServer()).get(
      '/usuarios/operadores',
    );
    const roleAssignment = await request(app.getHttpServer())
      .post('/usuarios/operadores')
      .set('x-test-role', RolUsuario.ADMIN)
      .send({
        email: 'otro@example.test',
        password: 'a-secure-operator-password',
        rol: RolUsuario.ADMIN,
      });

    expect(unauthenticated.status).toBe(401);
    expect(roleAssignment.status).toBe(400);
    expect(usuariosService.crearOperador).not.toHaveBeenCalled();
  });
});
