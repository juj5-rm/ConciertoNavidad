import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, TipoAsistente } from '@prisma/client';
import { CapacidadService } from '../capacidad/capacidad.service';
import { PrismaService } from '../prisma/prisma.service';

const NUMERO_BOLETA_MINIMO = 1;
const NUMERO_BOLETA_MAXIMO = 100;
const EDAD_MAXIMA_NINO = 7;
const CODIGO_QR_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface RegistroAsistenteInput {
  tipo: TipoAsistente;
  nombre: string;
  correo?: string | null;
  identificacion?: string | null;
  nacimiento?: Date | string | null;
}

export interface AsistenteRegistrado {
  id: string;
  nombre: string;
  tipo: TipoAsistente;
  codigoQr: string;
  numeroBoleta: number;
}

export interface AsistenteListado {
  numeroBoleta: number;
  nombre: string;
  tipo: TipoAsistente;
  validado: boolean;
  validadoAt: Date | null;
}

export type VerificacionIngresoResultado =
  | {
      resultado: 'INGRESO_REGISTRADO';
      numeroBoleta: number;
      tipo: TipoAsistente;
      validadoAt: Date;
    }
  | {
      resultado: 'YA_VALIDADO';
      numeroBoleta: number;
      tipo: TipoAsistente;
      validadoAt: Date;
    };

export interface DatosAsistenteValidados {
  tipo: TipoAsistente;
  nombre: string;
  correo: string | null;
  identificacion: string | null;
  nacimiento: Date | null;
}

@Injectable()
export class AsistentesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacidadService: CapacidadService,
  ) {}

  async verificarIngreso(
    codigoQr: string,
  ): Promise<VerificacionIngresoResultado> {
    if (typeof codigoQr !== 'string' || !CODIGO_QR_PATTERN.test(codigoQr)) {
      throw new BadRequestException('El código QR no es válido.');
    }

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const validadoAt = new Date();
          const resultado = await transaction.asistente.updateMany({
            where: {
              codigoQr,
              validado: false,
              validadoAt: null,
            },
            data: {
              validado: true,
              validadoAt,
            },
          });

          const asistente = await transaction.asistente.findUnique({
            where: { codigoQr },
            select: {
              numeroBoleta: true,
              tipo: true,
              validado: true,
              validadoAt: true,
            },
          });

          if (!asistente) {
            throw new NotFoundException('La entrada no existe.');
          }

          if (!asistente.validado || !asistente.validadoAt) {
            throw new InternalServerErrorException(
              'No fue posible verificar el estado de la entrada.',
            );
          }

          return {
            resultado:
              resultado.count === 1 ? 'INGRESO_REGISTRADO' : 'YA_VALIDADO',
            numeroBoleta: asistente.numeroBoleta,
            tipo: asistente.tipo,
            validadoAt: asistente.validadoAt,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'No fue posible verificar la entrada.',
      );
    }
  }

  async listar(): Promise<{ asistentes: AsistenteListado[]; total: number }> {
    try {
      const asistentes = await this.prisma.asistente.findMany({
        select: {
          numeroBoleta: true,
          nombre: true,
          tipo: true,
          validado: true,
          validadoAt: true,
        },
        orderBy: { numeroBoleta: 'asc' },
      });

      return { asistentes, total: asistentes.length };
    } catch {
      throw new InternalServerErrorException(
        'No fue posible consultar el listado de asistentes.',
      );
    }
  }

  async registrarIndividual(
    input: RegistroAsistenteInput,
  ): Promise<AsistenteRegistrado> {
    const datos = this.validarDatos(input);

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const capacidad =
            await this.capacidadService.getSnapshot(transaction);

          if (capacidad.disponibles < 1) {
            throw new ConflictException(
              'La capacidad del evento está agotada.',
            );
          }

          const [numeroBoleta] = await this.obtenerNumerosBoletaDisponibles(
            transaction,
            1,
          );
          return this.crearAsistente(transaction, datos, numeroBoleta, null);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'No fue posible asignar datos únicos al asistente.',
        );
      }

      throw new InternalServerErrorException(
        'No fue posible registrar al asistente.',
      );
    }
  }

  validarDatos(input: RegistroAsistenteInput): DatosAsistenteValidados {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Los datos del asistente no son válidos.');
    }

    if ('codigoQr' in input || 'numeroBoleta' in input) {
      throw new BadRequestException(
        'El código QR y el número de boleta son asignados por el sistema.',
      );
    }

    if (
      input.tipo !== TipoAsistente.ADULTO &&
      input.tipo !== TipoAsistente.NINO
    ) {
      throw new BadRequestException('El tipo de asistente no es válido.');
    }

    if (typeof input.nombre !== 'string' || input.nombre.trim().length === 0) {
      throw new BadRequestException('El nombre del asistente es obligatorio.');
    }

    if (input.tipo === TipoAsistente.ADULTO) {
      if (input.nacimiento !== undefined && input.nacimiento !== null) {
        throw new BadRequestException(
          'Los adultos no deben tener fecha de nacimiento registrada.',
        );
      }

      const correo = this.validarTextoObligatorio(input.correo, 'correo');
      const identificacion = this.validarTextoObligatorio(
        input.identificacion,
        'identificación',
      );

      return {
        tipo: TipoAsistente.ADULTO,
        nombre: input.nombre.trim(),
        correo,
        identificacion,
        nacimiento: null,
      };
    }

    if (input.correo !== undefined && input.correo !== null) {
      throw new BadRequestException(
        'Los niños no deben tener correo registrado.',
      );
    }
    if (input.identificacion !== undefined && input.identificacion !== null) {
      throw new BadRequestException(
        'Los niños no deben tener identificación registrada.',
      );
    }

    const nacimiento = this.parsearFechaNacimiento(input.nacimiento);
    if (this.calcularEdad(nacimiento) >= EDAD_MAXIMA_NINO) {
      throw new UnprocessableEntityException(
        'El niño debe ser menor de 7 años.',
      );
    }

    return {
      tipo: TipoAsistente.NINO,
      nombre: input.nombre.trim(),
      correo: null,
      identificacion: null,
      nacimiento,
    };
  }

  private validarTextoObligatorio(
    value: string | null | undefined,
    fieldName: string,
  ): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`El campo ${fieldName} es obligatorio.`);
    }
    return value.trim();
  }

  private parsearFechaNacimiento(
    value: Date | string | null | undefined,
  ): Date {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        throw new BadRequestException('La fecha de nacimiento no es válida.');
      }
      return this.crearFechaUtc(
        value.getUTCFullYear(),
        value.getUTCMonth() + 1,
        value.getUTCDate(),
      );
    }

    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(
        'La fecha de nacimiento debe tener el formato AAAA-MM-DD.',
      );
    }

    const [year, month, day] = value.split('-').map(Number);
    return this.crearFechaUtc(year, month, day);
  }

  private crearFechaUtc(year: number, month: number, day: number): Date {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException('La fecha de nacimiento no es válida.');
    }
    return date;
  }

  private calcularEdad(nacimiento: Date): number {
    const today = new Date();
    let age = today.getUTCFullYear() - nacimiento.getUTCFullYear();
    const beforeBirthday =
      today.getUTCMonth() < nacimiento.getUTCMonth() ||
      (today.getUTCMonth() === nacimiento.getUTCMonth() &&
        today.getUTCDate() < nacimiento.getUTCDate());

    if (beforeBirthday) {
      age -= 1;
    }

    if (age < 0) {
      throw new BadRequestException(
        'La fecha de nacimiento no puede estar en el futuro.',
      );
    }

    return age;
  }

  async obtenerNumerosBoletaDisponibles(
    transaction: Prisma.TransactionClient,
    cantidad: number,
  ): Promise<number[]> {
    if (
      !Number.isInteger(cantidad) ||
      cantidad < 1 ||
      cantidad > NUMERO_BOLETA_MAXIMO
    ) {
      throw new ConflictException('No hay números de boleta disponibles.');
    }

    const asistentes = await transaction.asistente.findMany({
      select: { numeroBoleta: true },
      orderBy: { numeroBoleta: 'asc' },
    });
    const ocupados = new Set(
      asistentes.map((asistente) => asistente.numeroBoleta),
    );

    const disponibles: number[] = [];
    for (
      let numero = NUMERO_BOLETA_MINIMO;
      numero <= NUMERO_BOLETA_MAXIMO;
      numero += 1
    ) {
      if (!ocupados.has(numero)) {
        disponibles.push(numero);
        if (disponibles.length === cantidad) {
          return disponibles;
        }
      }
    }

    throw new ConflictException('No hay números de boleta disponibles.');
  }

  crearAsistente(
    transaction: Prisma.TransactionClient,
    datos: DatosAsistenteValidados,
    numeroBoleta: number,
    grupoId: string | null,
  ): Promise<AsistenteRegistrado> {
    if (
      !Number.isInteger(numeroBoleta) ||
      numeroBoleta < NUMERO_BOLETA_MINIMO ||
      numeroBoleta > NUMERO_BOLETA_MAXIMO
    ) {
      throw new ConflictException('El número de boleta asignado no es válido.');
    }

    return transaction.asistente.create({
      data: {
        ...datos,
        codigoQr: randomBytes(32).toString('base64url'),
        numeroBoleta,
        validado: false,
        validadoAt: null,
        grupoId,
      },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        codigoQr: true,
        numeroBoleta: true,
      },
    });
  }
}
