# Concierto Navidad — frontend

Aplicación React para el personal del evento. Las rutas activas usan la API NestJS:

- `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`
- `POST /asistentes/verificar-qr`, `GET /asistentes`
- `GET /capacidad`, `PATCH /capacidad`

El JWT solo se mantiene en la cookie HttpOnly gestionada por NestJS. El frontend no lo lee ni lo guarda.

## Desarrollo local

`npm start` conecta por defecto con `http://localhost:3001`. Para apuntar a otro servidor local, crear un `.env` con:

```env
REACT_APP_API_URL=http://localhost:3001
```

El origen local del frontend debe estar permitido por `CORS_ORIGINS` en NestJS. No es necesario añadir `/api` a la URL local.

## Vercel

En las variables de entorno del proyecto Vercel, configurar **`NEST_API_URL`** con el origen HTTPS del servicio NestJS desplegado, sin una ruta adicional. Esa URL todavía está pendiente de despliegue y no se fija en el repositorio. La función `api/proxy.js` toma esta variable del entorno del servidor y reenvía `/api/...` al endpoint NestJS equivalente, quitando el prefijo `/api`.

El frontend en producción usa `/api` en el mismo origen, por lo que las cookies HttpOnly de sesión se envían mediante `withCredentials`. El backend también debe tener la configuración de cookies y orígenes permitidos compatible con el dominio frontend de Vercel.

## Comandos

- `npm test -- --watchAll=false`: pruebas disponibles.
- `npm run build`: compilación de producción.
