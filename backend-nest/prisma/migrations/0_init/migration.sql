-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TipoAsistente" AS ENUM ('ADULTO', 'NINO');

-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ADMIN', 'OPERADOR');

-- CreateEnum
CREATE TYPE "EstadoGrupo" AS ENUM ('ACTIVO', 'CERRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('PENDIENTE', 'USADA', 'EXPIRADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL DEFAULT 'OPERADOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracionEvento" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "descripcion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grupo" (
    "id" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "createdById" TEXT,
    "estado" "EstadoGrupo" NOT NULL DEFAULT 'ACTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asistente" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "correo" TEXT,
    "identificacion" TEXT,
    "nacimiento" DATE,
    "tipo" "TipoAsistente" NOT NULL,
    "codigoQr" TEXT NOT NULL,
    "numeroBoleta" INTEGER NOT NULL,
    "validado" BOOLEAN NOT NULL DEFAULT false,
    "validadoAt" TIMESTAMP(3),
    "grupoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asistente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "expiracion" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionEvento_clave_key" ON "ConfiguracionEvento"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "Grupo_leaderId_key" ON "Grupo"("leaderId");

-- CreateIndex
CREATE UNIQUE INDEX "Asistente_codigoQr_key" ON "Asistente"("codigoQr");

-- CreateIndex
CREATE UNIQUE INDEX "Asistente_numeroBoleta_key" ON "Asistente"("numeroBoleta");

-- CreateIndex
CREATE INDEX "Asistente_grupoId_idx" ON "Asistente"("grupoId");

-- CreateIndex
CREATE INDEX "Asistente_tipo_idx" ON "Asistente"("tipo");

-- CreateIndex
CREATE INDEX "Asistente_validado_idx" ON "Asistente"("validado");

-- CreateIndex
CREATE UNIQUE INDEX "Reserva_tokenHash_key" ON "Reserva"("tokenHash");

-- CreateIndex
CREATE INDEX "Reserva_estado_expiracion_idx" ON "Reserva"("estado", "expiracion");

-- AddForeignKey
ALTER TABLE "Grupo" ADD CONSTRAINT "Grupo_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "Asistente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grupo" ADD CONSTRAINT "Grupo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asistente" ADD CONSTRAINT "Asistente_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "Asistente"
ADD CONSTRAINT "Asistente_tipo_campos_check"
CHECK (
    ("tipo" = 'ADULTO'
        AND length(btrim("nombre")) > 0
        AND "correo" IS NOT NULL
        AND length(btrim("correo")) > 0
        AND "identificacion" IS NOT NULL
        AND length(btrim("identificacion")) > 0
        AND "nacimiento" IS NULL)
    OR
    ("tipo" = 'NINO'
        AND length(btrim("nombre")) > 0
        AND "correo" IS NULL
        AND "identificacion" IS NULL
        AND "nacimiento" IS NOT NULL)
);

-- AddCheckConstraint
ALTER TABLE "Asistente"
ADD CONSTRAINT "Asistente_numeroBoleta_rango_check"
CHECK ("numeroBoleta" BETWEEN 1 AND 100);

-- AddCheckConstraint
ALTER TABLE "ConfiguracionEvento"
ADD CONSTRAINT "ConfiguracionEvento_valor_rango_check"
CHECK ("valor" BETWEEN 0 AND 100);

-- AddCheckConstraint
ALTER TABLE "Reserva"
ADD CONSTRAINT "Reserva_cantidad_positiva_check"
CHECK ("cantidad" > 0);
