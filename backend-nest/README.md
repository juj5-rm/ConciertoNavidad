<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Migracion de datos - Bloque 2

La aplicacion NestJS utiliza exclusivamente `NEST_DATABASE_URL`, independiente de las variables del backend Express. Configura esa variable localmente con la URL de la nueva base PostgreSQL de Render. No copies la conexion del backend anterior. `.env` esta excluido de Git; `.env.example` solo contiene marcadores, nunca credenciales.

Prisma 7 se configura en `prisma.config.ts`; el cliente usa el adaptador PostgreSQL `@prisma/adapter-pg`. El schema aprobado contiene `Usuario`, `Grupo`, `Asistente`, `Reserva` y `ConfiguracionEvento`. `TipoAsistente.NINO` es el identificador interno. Los tokens de reserva se almacenan como hash SHA-256 hexadecimal en `tokenHash`; el token original no se persiste.

### Integridad del modelo

Prisma genera las claves primarias, foraneas, indices y restricciones `UNIQUE` declaradas en el schema. No se deben duplicar esas restricciones con SQL.

La migracion inicial debe incluir estas restricciones PostgreSQL personalizadas, que Prisma no expresa en el schema:

```sql
ALTER TABLE "Asistente"
  ADD CONSTRAINT "Asistente_tipo_campos_check"
  CHECK (
    ("tipo" = 'ADULTO'
      AND length(btrim("nombre")) > 0
      AND "correo" IS NOT NULL AND length(btrim("correo")) > 0
      AND "identificacion" IS NOT NULL AND length(btrim("identificacion")) > 0
      AND "nacimiento" IS NULL)
    OR
    ("tipo" = 'NINO'
      AND length(btrim("nombre")) > 0
      AND "correo" IS NULL AND "identificacion" IS NULL
      AND "nacimiento" IS NOT NULL)
  );

ALTER TABLE "Asistente"
  ADD CONSTRAINT "Asistente_numeroBoleta_rango_check"
  CHECK ("numeroBoleta" BETWEEN 1 AND 100);

ALTER TABLE "ConfiguracionEvento"
  ADD CONSTRAINT "ConfiguracionEvento_capacidad_maxima_rango_check"
  CHECK ("clave" <> 'capacidad_maxima' OR "valor" BETWEEN 0 AND 100);

ALTER TABLE "Reserva"
  ADD CONSTRAINT "Reserva_cantidad_positiva_check"
  CHECK ("cantidad" > 0);
```

La edad menor de 7 anos se valida en NestJS: no se agrega una expresion `CHECK` basada en la fecha actual, porque PostgreSQL no permite de forma fiable una funcion no inmutable en esa clase de constraint. La pertenencia simultanea como lider y miembro tambien requiere validacion transaccional del dominio; no es una restriccion de fila.

### Inicializacion

- `npm run db:seed` crea `capacidad_maxima = 100` si aun no existe y no sobrescribe un valor ya configurado.
- `npm run bootstrap:admin` crea el primer administrador solo cuando no existe ninguno. Requiere `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` en el entorno, rechaza contrasenas de menos de 12 caracteres y serializa intentos concurrentes con un bloqueo transaccional. No hay credenciales predeterminadas ni ruta publica de alta de administradores.
- Los usuarios nuevos tienen el rol `OPERADOR` por defecto.

### Configuracion y capacidad del evento

`ConfiguracionService` consulta y valida la configuracion `capacidad_maxima`; no ofrece rutas para modificarla. `CapacidadService.getSnapshot()` recibe un cliente transaccional de Prisma, bloquea la fila de configuracion antes de consultar la ocupacion y devuelve la capacidad, asistentes registrados, reservas vigentes, ocupacion y cupos disponibles. La ocupacion suma cada asistente y la cantidad de reservas `PENDIENTE` cuya expiracion sea posterior a una unica hora de referencia. El llamador debe ejecutar esta operacion dentro de la misma transaccion que consuma o libere cupos.

`AsistentesService.registrarIndividual()` valida adultos y ninos, y registra cada asistente junto con el snapshot de capacidad en una transaccion `ReadCommitted`. Requiere un cupo disponible, asigna una boleta libre del 1 al 100, genera un codigo QR seguro y crea el registro sin grupo; no se expone mediante endpoints en esta subfase.

`GruposService.crear()` valida previamente al lider y todos los miembros con las mismas reglas, y dentro de una transaccion `ReadCommitted` bloquea capacidad, asigna boletas y crea en orden al lider, el grupo y sus miembros. El creador permanece `null` mientras no haya autenticacion; no se exponen endpoints.

`ReservasService.crear()` genera un token aleatorio, almacena solo su hash SHA-256 y crea una reserva `PENDIENTE` con vigencia de 24 horas. `confirmar()` requiere los datos completos de exactamente un asistente por cupo, valida cada uno con `AsistentesService` y crea los asistentes junto con la transición a `USADA` en una única transacción `ReadCommitted`. `expirarPendientesVencidas()` actualiza reservas vencidas bajo el bloqueo común de capacidad. No se implementa cancelación ni se exponen endpoints.

### Migracion inicial

Verifica que `NEST_DATABASE_URL` sea la URL de la base nueva y vacia de Render antes de crear la migracion. Ejecuta `npm run db:migrate:create -- --name init`; el script invoca `prisma migrate dev --create-only` y no aplica la migracion. Revisa el SQL generado y agrega las restricciones `CHECK` anteriores antes de aprobar cualquier aplicacion. No ejecutes `prisma migrate dev` sin `--create-only` en esta fase.

Estado de esta revision: schema validado y Prisma Client generado. La migracion no se ha creado ni aplicado porque `NEST_DATABASE_URL` no estaba definida en el entorno; por tanto, no fue posible confirmar el destino Render ni obtener el SQL generado por `migrate dev --create-only`. No se ejecutaron comandos contra la base Express.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
