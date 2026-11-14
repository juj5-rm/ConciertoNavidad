import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RolUsuario } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ActualizarOperadorDto } from './dto/actualizar-operador.dto';
import { CrearOperadorDto } from './dto/crear-operador.dto';

const OPERADOR_SELECT = {
  id: true,
  email: true,
  rol: true,
  activo: true,
  createdAt: true,
} satisfies Prisma.UsuarioSelect;

export type OperadorPublico = Prisma.UsuarioGetPayload<{
  select: typeof OPERADOR_SELECT;
}>;

const USER_OPERATION_FAILED =
  'No fue posible completar la operación de usuarios.';

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async listarOperadores(): Promise<OperadorPublico[]> {
    try {
      return await this.prisma.usuario.findMany({
        where: { rol: RolUsuario.OPERADOR },
        select: OPERADOR_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
    } catch {
      throw new InternalServerErrorException(USER_OPERATION_FAILED);
    }
  }

  async crearOperador(input: CrearOperadorDto): Promise<OperadorPublico> {
    const email = this.normalizeEmail(input.email);
    this.validatePassword(input.password);
    await this.assertEmailAvailable(email);
    const passwordHash = await this.hashPassword(input.password);

    try {
      return await this.prisma.usuario.create({
        data: {
          email,
          passwordHash,
          rol: RolUsuario.OPERADOR,
          activo: true,
        },
        select: OPERADOR_SELECT,
      });
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException('Ya existe una cuenta con ese correo.');
      }
      throw new InternalServerErrorException(USER_OPERATION_FAILED);
    }
  }

  async actualizarOperador(
    id: string,
    actorId: string,
    input: ActualizarOperadorDto,
  ): Promise<OperadorPublico> {
    this.assertNotSelf(id, actorId);
    if (input.email === undefined && input.password === undefined) {
      throw new BadRequestException(
        'Indica un correo o una nueva contraseña para actualizar.',
      );
    }

    const current = await this.findOperator(id);
    const data: Prisma.UsuarioUpdateInput = {};

    if (input.email !== undefined) {
      const email = this.normalizeEmail(input.email);
      await this.assertEmailAvailable(email, id);
      data.email = email;
    }

    if (input.password !== undefined) {
      this.validatePassword(input.password);
      data.passwordHash = await this.hashPassword(input.password);
    }

    try {
      return await this.prisma.usuario.update({
        where: { id: current.id },
        data,
        select: OPERADOR_SELECT,
      });
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException('Ya existe una cuenta con ese correo.');
      }
      if (this.isPrismaError(error, 'P2025')) {
        throw new NotFoundException('No se encontró el operador.');
      }
      throw new InternalServerErrorException(USER_OPERATION_FAILED);
    }
  }

  async actualizarEstado(
    id: string,
    actorId: string,
    activo: boolean,
  ): Promise<OperadorPublico> {
    this.assertNotSelf(id, actorId);
    const current = await this.findOperator(id);

    try {
      return await this.prisma.usuario.update({
        where: { id: current.id },
        data: { activo },
        select: OPERADOR_SELECT,
      });
    } catch (error) {
      if (this.isPrismaError(error, 'P2025')) {
        throw new NotFoundException('No se encontró el operador.');
      }
      throw new InternalServerErrorException(USER_OPERATION_FAILED);
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private validatePassword(password: string): void {
    const byteLength = Buffer.byteLength(password, 'utf8');
    if (password.length < 12 || byteLength > 72) {
      throw new BadRequestException(
        'La contraseña debe tener entre 12 y 72 bytes.',
      );
    }
  }

  private async hashPassword(password: string): Promise<string> {
    try {
      return await hash(password, 12);
    } catch {
      throw new InternalServerErrorException(USER_OPERATION_FAILED);
    }
  }

  private async assertEmailAvailable(
    email: string,
    excludeId?: string,
  ): Promise<void> {
    let existing: { id: string } | null;
    try {
      existing = await this.prisma.usuario.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
      });
    } catch {
      throw new InternalServerErrorException(USER_OPERATION_FAILED);
    }

    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese correo.');
    }
  }

  private async findOperator(
    id: string,
  ): Promise<Pick<OperadorPublico, 'id' | 'email' | 'rol'>> {
    let operator: Pick<OperadorPublico, 'id' | 'email' | 'rol'> | null;
    try {
      operator = await this.prisma.usuario.findFirst({
        where: { id, rol: RolUsuario.OPERADOR },
        select: { id: true, email: true, rol: true },
      });
    } catch {
      throw new InternalServerErrorException(USER_OPERATION_FAILED);
    }

    if (!operator) {
      throw new NotFoundException('No se encontró el operador.');
    }
    return operator;
  }

  private assertNotSelf(id: string, actorId: string): void {
    if (id === actorId) {
      throw new ForbiddenException(
        'No puedes modificar o desactivar tu propia cuenta.',
      );
    }
  }

  private isPrismaError(
    error: unknown,
    code: string,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === code
    );
  }
}
