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

La aplicacion NestJS utiliza `NEST_DATABASE_URL`, independiente de las variables del backend Express. Prisma CLI carga `backend-nest/.env.local` con precedencia sobre el entorno heredado y rechaza destinos que no sean `127.0.0.1:5433/conciertonavidad_dev`. Mantener intacto `.env`; no copiar configuraciones de produccion a la base local.

Prisma 7 se configura en `prisma.config.ts`; el cliente usa el adaptador PostgreSQL `@prisma/adapter-pg`. El schema aprobado contiene `Usuario`, `Grupo`, `Asistente`, `Reserva` y `ConfiguracionEvento`. `TipoAsistente.NINO` es el identificador interno. Los tokens de reserva se almacenan como hash SHA-256 hexadecimal en `tokenHash`; el token original no se persiste.

### Integridad del modelo

Prisma genera las claves primarias, foraneas, indices y restricciones `UNIQUE` declaradas en el schema. No se deben duplicar esas restricciones con SQL.

Las restricciones PostgreSQL personalizadas no expresadas en el schema se mantienen en las migraciones. La migracion inicial valida los campos segun el tipo de asistente y las reservas positivas. La migracion aditiva `20261113120000_capacity_and_registration_consent` elimina el tope de 100 para capacidad y boletas, exige valores positivos para la capacidad y los numeros de boleta, y agrega a `Grupo` la fecha/hora y version del consentimiento con una restriccion de evidencia completa. Los grupos existentes conservan ambos campos en `NULL`.

La edad menor de 7 anos se valida en NestJS: no se agrega una expresion `CHECK` basada en la fecha actual, porque PostgreSQL no permite de forma fiable una funcion no inmutable en esa clase de constraint. La pertenencia simultanea como lider y miembro tambien requiere validacion transaccional del dominio; no es una restriccion de fila.

### Inicializacion

- `npm run db:seed` crea `capacidad_maxima = 100` si aun no existe y no sobrescribe un valor ya configurado.
- `npm run bootstrap:admin` crea el primer administrador solo cuando no existe ninguno. Requiere `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` en el entorno, rechaza contrasenas de menos de 12 caracteres y serializa intentos concurrentes con un bloqueo transaccional. No hay credenciales predeterminadas ni ruta publica de alta de administradores.
- El rol por defecto del modelo `Usuario` es `OPERADOR`. La API de gestion no tiene registro publico y solo ADMIN puede crear operadores; el rol de esas cuentas se fija en `OPERADOR`.

### Gestion de operadores

Solo ADMIN puede usar `GET` y `POST /usuarios/operadores`, `PATCH /usuarios/operadores/:id` y `PATCH /usuarios/operadores/:id/estado`. La creacion y el cambio opcional de contrasena usan bcrypt con costo 12; las respuestas nunca incluyen el hash. Los correos se normalizan y se validan sin distincion de mayusculas.

La eliminacion es logica: desactivar una cuenta conserva su historial y evita el inicio de sesion. `JwtStrategy` vuelve a comprobar `Usuario.activo` en cada solicitud protegida, por lo que tambien invalida las sesiones existentes del operador. No existe eliminacion fisica de usuarios desde esta API.

### Configuracion y capacidad del evento

`ConfiguracionService` valida `capacidad_maxima` como entero positivo compatible con PostgreSQL `Int`. ADMIN puede modificarla, pero no reducirla por debajo de la ocupacion actual. El valor `100` del seed es un valor inicial y el seed no sobrescribe una configuracion existente. `CapacidadService.getSnapshot()` bloquea la fila de configuracion antes de consultar la ocupacion y devuelve capacidad, asistentes registrados, reservas vigentes, ocupacion y cupos disponibles dentro de la transaccion del llamador.

`AsistentesService.registrarIndividual()` valida adultos y ninos, exige un cupo disponible, asigna el primer numero de boleta libre positivo compatible con PostgreSQL `Int` y genera un codigo QR seguro. La numeracion ya no tiene un tope de 100.

`POST /grupos/inscripcion` es el unico endpoint publico del modulo de grupos. Acepta uno o mas adultos y cero o mas ninos; el primer adulto es el lider. Requiere consentimiento y una version vigente del texto. `GruposService.crear()` vuelve a validar los participantes y, en una sola transaccion `ReadCommitted`, bloquea la capacidad vigente, comprueba los cupos de todo el grupo y crea lider, grupo y miembros. La fecha/hora y version del consentimiento se guardan en `Grupo`; no se crean reservas pendientes. La respuesta publica contiene solo nombre, tipo, QR y numero de boleta de cada integrante.

El servicio interno de reservas conserva su comportamiento legado; la inscripcion publica grupal no crea ni confirma reservas y no expone operaciones de reserva.

### Migraciones

Las migraciones de desarrollo se aplican unicamente despues de confirmar el destino local. La migracion aditiva de consentimiento y rangos de capacidad se aplico a `conciertonavidad_dev` en `127.0.0.1:5433`; no modifica ni reconstruye tablas y conserva los grupos existentes sin evidencia historica de consentimiento.

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
