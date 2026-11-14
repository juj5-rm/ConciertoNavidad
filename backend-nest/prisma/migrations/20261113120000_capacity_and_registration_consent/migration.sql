ALTER TABLE "ConfiguracionEvento"
DROP CONSTRAINT "ConfiguracionEvento_valor_rango_check";

ALTER TABLE "ConfiguracionEvento"
ADD CONSTRAINT "ConfiguracionEvento_valor_rango_check"
CHECK ("valor" >= 0 AND ("clave" <> 'capacidad_maxima' OR "valor" > 0));

ALTER TABLE "Asistente"
DROP CONSTRAINT "Asistente_numeroBoleta_rango_check";

ALTER TABLE "Asistente"
ADD CONSTRAINT "Asistente_numeroBoleta_positivo_check"
CHECK ("numeroBoleta" > 0);

ALTER TABLE "Grupo"
ADD COLUMN "consentimientoAceptadoAt" TIMESTAMP(3),
ADD COLUMN "consentimientoVersion" TEXT;

ALTER TABLE "Grupo"
ADD CONSTRAINT "Grupo_consentimiento_evidencia_check"
CHECK (
  ("consentimientoAceptadoAt" IS NULL AND "consentimientoVersion" IS NULL)
  OR
  ("consentimientoAceptadoAt" IS NOT NULL AND "consentimientoVersion" IS NOT NULL)
);
