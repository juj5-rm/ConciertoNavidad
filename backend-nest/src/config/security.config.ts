import type { CookieOptions } from 'express';

export type RuntimeEnvironment = 'development' | 'production' | 'test';
export type CookieSameSite = 'lax' | 'strict' | 'none';

export interface SecurityConfiguration {
  environment: RuntimeEnvironment;
  port: number;
  jwtSecret: string;
  jwtExpiresIn: '1h';
  corsOrigins: string[];
  authCookieName: string;
  authCookieSameSite: CookieSameSite;
  authCookieSecure: boolean;
  authCookieDomain?: string;
  authCookiePath: '/';
  authCookieMaxAge: number;
}

const DURATION_MULTIPLIERS = {
  s: 1000n,
  m: 60_000n,
  h: 3_600_000n,
  d: 86_400_000n,
} as const;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function requiredString(config: Record<string, unknown>, name: string): string {
  const value = config[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid environment configuration: ${name} is required.`);
  }
  return value.trim();
}

function validateJwtSecret(value: string): string {
  if (
    Buffer.byteLength(value, 'utf8') < 32 ||
    /^(.)\1{15,}$/.test(value) ||
    /^(change[-_ ]?me|replace[-_ ]?me|your[-_ ]?secret)$/i.test(value)
  ) {
    throw new Error(
      'Invalid environment configuration: JWT_SECRET must contain at least 32 non-placeholder bytes.',
    );
  }
  return value;
}

function parseJwtDuration(value: string): number {
  if (value !== '1h') {
    throw new Error(
      'Invalid environment configuration: JWT_EXPIRES_IN must be 1h.',
    );
  }

  const milliseconds = 1n * DURATION_MULTIPLIERS.h;

  if (milliseconds > MAX_SAFE_INTEGER_BIGINT) {
    throw new Error(
      'Invalid environment configuration: JWT_EXPIRES_IN is too large.',
    );
  }

  return Number(milliseconds);
}

function validateDatabaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      'Invalid environment configuration: NEST_DATABASE_URL must be a PostgreSQL URL.',
    );
  }

  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname.slice(1)
  ) {
    throw new Error(
      'Invalid environment configuration: NEST_DATABASE_URL must be a PostgreSQL URL.',
    );
  }
}

function validateCorsOrigins(
  value: string,
  environment: RuntimeEnvironment,
): string[] {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0 || origins.includes('*')) {
    throw new Error(
      'Invalid environment configuration: CORS_ORIGINS must contain explicit origins and cannot contain *.',
    );
  }

  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(
        'Invalid environment configuration: CORS_ORIGINS contains an invalid origin.',
      );
    }

    const isLocalHttp =
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      url.origin !== origin ||
      (environment === 'production' ? url.protocol !== 'https:' : !isLocalHttp)
    ) {
      throw new Error(
        'Invalid environment configuration: CORS_ORIGINS contains an origin incompatible with NODE_ENV.',
      );
    }
  }

  return [...new Set(origins)];
}

function validateCookieDomain(value: unknown): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new Error(
      'Invalid environment configuration: AUTH_COOKIE_DOMAIN is invalid.',
    );
  }

  const domain = value.trim().replace(/^\./, '');
  let url: URL;
  try {
    url = new URL(`http://${domain}`);
  } catch {
    throw new Error(
      'Invalid environment configuration: AUTH_COOKIE_DOMAIN is invalid.',
    );
  }

  if (
    !domain ||
    url.hostname !== domain ||
    url.port ||
    url.pathname !== '/' ||
    domain.includes('..')
  ) {
    throw new Error(
      'Invalid environment configuration: AUTH_COOKIE_DOMAIN is invalid.',
    );
  }
  return domain;
}

export function validateEnvironment(config: Record<string, unknown>): {
  security: SecurityConfiguration;
} {
  const environment = requiredString(config, 'NODE_ENV');
  if (!['development', 'production', 'test'].includes(environment)) {
    throw new Error(
      'Invalid environment configuration: NODE_ENV must be development or production.',
    );
  }
  const runtimeEnvironment = environment as RuntimeEnvironment;

  const databaseUrl = requiredString(config, 'NEST_DATABASE_URL');
  validateDatabaseUrl(databaseUrl);

  const jwtSecret = validateJwtSecret(requiredString(config, 'JWT_SECRET'));
  const jwtExpiresIn = requiredString(config, 'JWT_EXPIRES_IN');
  if (jwtExpiresIn !== '1h') {
    throw new Error(
      'Invalid environment configuration: JWT_EXPIRES_IN must be 1h.',
    );
  }
  const authCookieMaxAge = parseJwtDuration(jwtExpiresIn);
  const corsOrigins = validateCorsOrigins(
    requiredString(config, 'CORS_ORIGINS'),
    runtimeEnvironment,
  );
  const authCookieName = requiredString(config, 'AUTH_COOKIE_NAME');
  if (!/^[A-Za-z0-9_-]+$/.test(authCookieName)) {
    throw new Error(
      'Invalid environment configuration: AUTH_COOKIE_NAME is invalid.',
    );
  }

  const sameSite = requiredString(
    config,
    'AUTH_COOKIE_SAME_SITE',
  ).toLowerCase();
  if (!['lax', 'strict', 'none'].includes(sameSite)) {
    throw new Error(
      'Invalid environment configuration: AUTH_COOKIE_SAME_SITE must be Lax, Strict, or None.',
    );
  }
  const authCookieSameSite = sameSite as CookieSameSite;

  const secureValue = requiredString(
    config,
    'AUTH_COOKIE_SECURE',
  ).toLowerCase();
  if (!['true', 'false'].includes(secureValue)) {
    throw new Error(
      'Invalid environment configuration: AUTH_COOKIE_SECURE must be true or false.',
    );
  }
  const authCookieSecure = secureValue === 'true';
  if (authCookieSameSite === 'none' && !authCookieSecure) {
    throw new Error(
      'Invalid environment configuration: SameSite=None requires AUTH_COOKIE_SECURE=true.',
    );
  }
  if (runtimeEnvironment === 'production' && !authCookieSecure) {
    throw new Error(
      'Invalid environment configuration: AUTH_COOKIE_SECURE must be true in production.',
    );
  }
  if (
    runtimeEnvironment !== 'production' &&
    (authCookieSecure || authCookieSameSite !== 'lax')
  ) {
    throw new Error(
      'Invalid environment configuration: development and test cookies require Secure=false and SameSite=Lax.',
    );
  }

  const portValue = config.PORT;
  const port =
    portValue === undefined || portValue === '' ? 3001 : Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      'Invalid environment configuration: PORT must be an integer from 1 to 65535.',
    );
  }

  return {
    security: {
      environment: runtimeEnvironment,
      port,
      jwtSecret,
      jwtExpiresIn,
      corsOrigins,
      authCookieName,
      authCookieSameSite,
      authCookieSecure,
      authCookieDomain: validateCookieDomain(config.AUTH_COOKIE_DOMAIN),
      authCookiePath: '/',
      authCookieMaxAge,
    },
  };
}

export function createAuthCookieOptions(
  config: SecurityConfiguration,
): CookieOptions {
  return {
    httpOnly: true,
    secure: config.authCookieSecure,
    sameSite: config.authCookieSameSite,
    path: config.authCookiePath,
    ...(config.authCookieDomain ? { domain: config.authCookieDomain } : {}),
    maxAge: config.authCookieMaxAge,
  };
}

export function createAuthCookieClearOptions(
  config: SecurityConfiguration,
): CookieOptions {
  const options = createAuthCookieOptions(config);
  delete options.maxAge;
  return {
    ...options,
    expires: new Date(0),
  };
}

export interface CorsConfiguration {
  origin: (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
  ) => void;
  credentials: true;
  methods: string[];
  allowedHeaders: string[];
  optionsSuccessStatus: 204;
}

export function createCorsOptions(
  config: SecurityConfiguration,
): CorsConfiguration {
  const allowedOrigins = new Set(config.corsOrigins);
  return {
    origin: (origin, callback) => {
      callback(null, !origin || allowedOrigins.has(origin));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    optionsSuccessStatus: 204,
  };
}
