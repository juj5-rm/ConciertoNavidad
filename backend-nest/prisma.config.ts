import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

const isProduction = process.env.NODE_ENV === 'production';
let databaseUrl: string | undefined;

if (isProduction) {
  databaseUrl = process.env.NEST_DATABASE_URL;
} else {
  const localEnv = dotenv.config({
    path: resolve(__dirname, '.env.local'),
    override: true,
  });
  if (localEnv.error) {
    throw new Error('Prisma database configuration is invalid.');
  }
  databaseUrl = localEnv.parsed?.NEST_DATABASE_URL;
}

if (!databaseUrl) {
  throw new Error('Prisma database configuration is invalid.');
}

let databaseTarget: URL;
try {
  databaseTarget = new URL(databaseUrl);
} catch {
  throw new Error('Prisma database configuration is invalid.');
}

const hostname = databaseTarget.hostname.replace(/^\[|\]$/g, '').toLowerCase();
if (
  !['postgres:', 'postgresql:'].includes(databaseTarget.protocol) ||
  !hostname ||
  !databaseTarget.pathname.slice(1)
) {
  throw new Error('Prisma database configuration is invalid.');
}

if (isProduction) {
  const isLoopbackHost =
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '::1' ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname) ||
    hostname === '0.0.0.0';
  if (isLoopbackHost) {
    throw new Error('Prisma production database configuration is invalid.');
  }
} else if (
  hostname !== '127.0.0.1' ||
  databaseTarget.port !== '5433' ||
  databaseTarget.pathname !== '/conciertonavidad_dev'
) {
  throw new Error('Prisma local database configuration is invalid.');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
