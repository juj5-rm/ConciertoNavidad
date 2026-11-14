# Configuración base de autenticación

El backend implementa login, validación de sesión JWT desde cookie y logout. Autorización por roles, CSRF y rate limiting quedan pendientes.

## Arquitectura prevista

- `AuthModule` implementa `POST /auth/login`, la estrategia Passport JWT, `GET /auth/me` y `POST /auth/logout`.
- El JWT se transporta exclusivamente en una cookie `HttpOnly`; no se devuelve en el cuerpo ni debe guardarse en `localStorage` o `sessionStorage`.
- `UsersModule` no se agrega todavía: el modelo `Usuario` existente permite comenzar desde `AuthService` sin duplicar módulos.
- La contraseña se compara con bcryptjs; solo usuarios activos pueden iniciar sesión.
- `AuthService` selecciona los campos necesarios y devuelve al controlador únicamente `id`, `email` y `rol`; nunca expone `passwordHash`.
- El JWT incluye `sub` (UUID del usuario) y `role`. La autenticación no implica rol `ADMIN`: la autorización se implementará por separado.
- No se implementan refresh tokens ni blacklist. Logout elimina la cookie del navegador, pero no invalida un JWT robado antes de su expiración.

## Variables de entorno

Copiar `.env.example` a `.env` para desarrollo y completar valores localmente. No guardar secretos reales en Git.

| Variable                | Propósito                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`              | `development`, `production` o `test` (este último solo para pruebas locales).                                                                            |
| `NEST_DATABASE_URL`     | URL PostgreSQL del backend NestJS. No reutilizar la conexión del backend Express.                                                                        |
| `JWT_SECRET`            | Secreto obligatorio, mínimo 32 bytes y sin valor por defecto. Generar uno criptográficamente aleatorio y guardarlo en el gestor de secretos del entorno. |
| `JWT_EXPIRES_IN`        | Duración obligatoria y fijada en `1h`; también determina el `Max-Age` de la cookie.                                                                      |
| `PORT`                  | Puerto HTTP. Por defecto es `3001`; Render puede inyectar el puerto de servicio.                                                                         |
| `CORS_ORIGINS`          | Orígenes frontend explícitos separados por coma; no admite `*`.                                                                                          |
| `AUTH_COOKIE_NAME`      | Nombre de la futura cookie de autenticación.                                                                                                             |
| `AUTH_COOKIE_SAME_SITE` | `lax`, `strict` o `none`.                                                                                                                                |
| `AUTH_COOKIE_SECURE`    | `false` solo en desarrollo/pruebas locales; debe ser `true` en producción.                                                                               |
| `AUTH_COOKIE_DOMAIN`    | Opcional. Dejar vacío para cookie host-only; no se fija dominio en el código.                                                                            |

La validación de configuración no incluye valores secretos en sus errores. La URL de base de datos se valida sintácticamente al iniciar, pero esta validación no intenta conectarse a PostgreSQL.

## Desarrollo local

Create React App usa `http://localhost:3000` por defecto. Nest escucha en `http://localhost:3001` para evitar el conflicto de puertos.

Configuración de ejemplo:

```dotenv
NODE_ENV=development
PORT=3001
CORS_ORIGINS=http://localhost:3000
AUTH_COOKIE_SAME_SITE=lax
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_DOMAIN=
```

Completar `NEST_DATABASE_URL` y generar un `JWT_SECRET` local de al menos 32 bytes. `JWT_EXPIRES_IN` debe ser `1h`; el arranque rechaza cualquier otro valor. No usar `SameSite=None` para este modo HTTP local.

## Vercel y Render temporales

Configurar en Render `NODE_ENV=production`, un `JWT_SECRET` aleatorio y `JWT_EXPIRES_IN=1h`. `CORS_ORIGINS` debe contener el origen HTTPS exacto de la aplicación Vercel, sin ruta ni barra final. No usar comodines ni incluir el origen del API como sustituto del frontend.

Como el host temporal de Vercel y el de Render normalmente pertenecen a sitios registrables distintos, una futura cookie JWT usada entre ellos requerirá `AUTH_COOKIE_SAME_SITE=none` y `AUTH_COOKIE_SECURE=true`. No se configura automáticamente. Los navegadores pueden bloquear cookies de terceros incluso con esos atributos; por tanto, el despliegue temporal puede no ser una plataforma de prueba fiable para sesiones con cookies.

El API debe usar HTTPS. CORS habilita credenciales únicamente junto con los orígenes explícitos validados. CORS controla el acceso desde navegadores, no es autenticación ni reemplaza CSRF.

## Cookies

`createAuthCookieOptions` centraliza `HttpOnly`, `Secure`, `SameSite`, `Path=/`, dominio opcional y `Max-Age` derivado de `JWT_EXPIRES_IN`. En desarrollo y pruebas exige `Secure=false` y `SameSite=Lax`; en producción exige `Secure=true`; cualquier `SameSite=None` exige `Secure=true`.

El logout limpia la cookie con el mismo nombre, `Path`, `Domain` (si existe), `Secure` y `SameSite` usados al establecerla, y devuelve una respuesta sin JWT. Limpiar la cookie no revoca copias del token previamente robadas.

## Inicio de sesión

`POST /auth/login` recibe JSON:

```json
{
  "email": "usuario@ejemplo.com",
  "password": "contraseña"
}
```

El DTO exige correo válido y contraseña no vacía; el `ValidationPipe` global rechaza propiedades desconocidas. El correo se busca exactamente como se envía, sin modificar ni normalizar el valor persistido. Las credenciales se verifican con bcryptjs. Correo inexistente, contraseña incorrecta y cuenta inactiva producen el mismo `401` y mensaje: `Credenciales inválidas o cuenta inactiva.` Los fallos de base de datos, bcrypt o firma JWT devuelven un error interno genérico y no se convierten en `401`.

Si las credenciales son válidas, se firma un JWT de una hora con payload mínimo `{ "sub": "<uuid>", "role": "ADMIN|OPERADOR" }`, se actualiza `lastLoginAt` y se establece la cookie con la configuración central. La respuesta HTTP 200 es:

```json
{
  "message": "Inicio de sesión exitoso.",
  "user": {
    "id": "uuid-del-usuario",
    "email": "usuario@ejemplo.com",
    "rol": "ADMIN"
  }
}
```

La respuesta no contiene el token ni `passwordHash`. Si falla la actualización de `lastLoginAt`, no se informa éxito ni se establece la cookie. Las pruebas de servicio y controlador usan mocks; no escriben en PostgreSQL.

## Validación de sesión y cierre

Passport extrae el JWT exclusivamente de la cookie indicada por `AUTH_COOKIE_NAME`; no acepta token en query string, encabezado `Authorization` ni cuerpo. La estrategia valida firma HS256 y expiración con el secreto de configuración y rechaza payloads sin UUID `sub`, rol permitido, `iat` y `exp`.

En cada solicitud protegida, consulta por `sub` el registro actual de `Usuario`. Usuarios inexistentes o inactivos reciben `401 No autenticado.`; errores de Prisma se mantienen como errores internos genéricos, no se convierten en 401. El rol y email del contexto autenticado se toman de la base actual, no de claims históricos del JWT. El guard `JwtAuthGuard` es reutilizable, pero no está registrado globalmente ni protege todavía rutas de negocio.

`GET /auth/me` requiere `JwtAuthGuard` y responde únicamente con el usuario público del contexto:

```json
{
  "user": {
    "id": "uuid",
    "email": "usuario@ejemplo.com",
    "rol": "ADMIN"
  }
}
```

`POST /auth/logout` es idempotente y no requiere una cookie válida. Limpia la cookie configurada con el mismo nombre, `Path`, `Domain` opcional y atributos de seguridad, usando expiración inmediata y sin reutilizar el `Max-Age` de una hora. Responde `{ "message": "Sesión cerrada." }` y no consulta la base. Esto solo elimina la copia del navegador: no revoca ni invalida otras copias del JWT; cualquier token robado continúa válido hasta su expiración de una hora.

La política es igual en desarrollo local y despliegue respecto a credenciales, payload y duración. Cambian los atributos de cookie y el origen CORS: local usa HTTP, `SameSite=Lax` y `Secure=false`; Vercel/Render temporales usan HTTPS y, al ser cross-site, la cookie necesita `SameSite=None; Secure`. Las restricciones de cookies de terceros pueden bloquear el flujo temporal.

## CORS y protección general

La allowlist es explícita. Los métodos habilitados son `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE` y `OPTIONS`; los encabezados permitidos son `Content-Type` y `X-CSRF-Token`. Las solicitudes OPTIONS de preflight reciben la respuesta del middleware CORS. Las peticiones sin encabezado `Origin` (por ejemplo, herramientas de servidor) no reciben una decisión de autorización de usuario por CORS y deben protegerse mediante autenticación/autorización cuando corresponda.

Nest aplica Helmet, un `ValidationPipe` global con transformación, whitelist y rechazo de propiedades no permitidas, y un límite de 100 KiB para cuerpos JSON. Los filtros actuales de Nest siguen dando el manejo HTTP de excepciones; el login deberá mantener errores públicos genéricos y no registrar contraseñas, JWT ni cookies.

## Diseño CSRF propuesto (no implementado)

Las cookies se adjuntan automáticamente por el navegador. CSRF pretende impedir que un sitio ajeno fuerce al navegador de un usuario autenticado a realizar acciones con su cookie.

Diseño propuesto para aprobación en una subfase posterior:

1. Emitir un nonce aleatorio y una expiración dentro de un token firmado con HMAC-SHA-256. Derivar la clave CSRF con separación de propósito desde el secreto de entorno; no reutilizar el JWT como token CSRF.
2. Entregar el token en JSON desde un endpoint CSRF y mantenerlo solo en memoria del frontend. No hace falta una cookie CSRF adicional: el JWT de autenticación permanece exclusivamente en la cookie `HttpOnly`.
3. En solicitudes mutables, exigir `X-CSRF-Token` y validar firma, expiración y propósito. Para operaciones autenticadas, vincular el token a la identidad/sesión del JWT (por ejemplo, su `jti`); usar un propósito distinto para solicitar login. Comparar valores sensibles en tiempo constante cuando aplique.
4. Proteger `POST`, `PUT`, `PATCH` y `DELETE`, incluido login/logout; `GET`, `HEAD` y `OPTIONS` deben permanecer sin efectos mutables. Verificar además `Origin` y Fetch Metadata como defensas adicionales, no como único mecanismo.
5. El navegador ajeno no debe poder leer el token JSON: CORS solo permite los orígenes frontend explícitos. El encabezado personalizado provoca preflight y el servidor debe rechazar preflights de orígenes no autorizados.
6. En local, mantener `SameSite=Lax`; en el despliegue Vercel/Render cross-site se necesitará `SameSite=None; Secure` para la cookie JWT. La entrega del token CSRF requiere CORS con credenciales y origen autorizado. El bloqueo de cookies de terceros puede impedir el flujo en ciertos navegadores.

La generación, duración, rotación y validación CSRF, además del endpoint de entrega, no se implementan en esta subfase. El login también debe incluir protección contra login-CSRF antes de producción. El diseño deberá revisarse y aprobarse antes de escribir esa lógica. Este enfoque evita almacenamiento de sesión adicional; si la política requiere revocación inmediata o tokens de un solo uso, hará falta evaluar estado compartido y el cambio de alcance correspondiente.

## Limitaciones pendientes antes de producción

- El endpoint de login todavía no tiene rate limiting ni protección específica contra intentos repetidos.
- CSRF no está implementado. CORS y `SameSite` son defensas complementarias, no sustituyen por sí solos protección CSRF.
- No hay revocación ni refresh tokens. El token robado puede usarse hasta su expiración.
- No se implementa todavía autorización por roles ni se protegen rutas de negocio.

## Transición a dominios propios

Cuando existan `app.midominio.com` y `api.midominio.com`, actualizar `CORS_ORIGINS` con el origen exacto del frontend y definir explícitamente `AUTH_COOKIE_SAME_SITE` y `AUTH_COOKIE_SECURE` según el flujo acordado. Al compartir sitio registrable puede bastar `SameSite=Lax`; la cookie puede permanecer host-only en `api.midominio.com`. Solo configurar `AUTH_COOKIE_DOMAIN` si se demuestra que compartirla entre subdominios es necesario.

## Próximas subfases

- Implementar y probar guards de roles, decoradores y autorización `ADMIN`/`OPERADOR`; el guard de autenticación JWT ya existe.
- Aprobar e implementar CSRF, incluida la protección del login.
- Definir e implementar rate limiting para login.
