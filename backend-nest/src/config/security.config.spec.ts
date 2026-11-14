import {
  createAuthCookieClearOptions,
  createAuthCookieOptions,
  createCorsOptions,
  validateEnvironment,
} from './security.config';

describe('security configuration', () => {
  const validEnvironment = () => ({
    NODE_ENV: 'development',
    NEST_DATABASE_URL:
      'postgresql://user:password@localhost:5432/concierto_nest',
    JWT_SECRET: 'a-secure-test-secret-with-at-least-32-bytes',
    JWT_EXPIRES_IN: '1h',
    CORS_ORIGINS: 'http://localhost:3000',
    AUTH_COOKIE_NAME: 'concierto_auth',
    AUTH_COOKIE_SAME_SITE: 'lax',
    AUTH_COOKIE_SECURE: 'false',
    AUTH_COOKIE_DOMAIN: '',
    PORT: '3001',
  });

  it.each(['', undefined, 'short'])(
    'rejects a missing or weak JWT secret (%s)',
    (jwtSecret) => {
      expect(() =>
        validateEnvironment({
          ...validEnvironment(),
          JWT_SECRET: jwtSecret,
        }),
      ).toThrow(/JWT_SECRET/);
    },
  );

  it('rejects missing required variables and invalid database URLs', () => {
    const missingDatabase: Record<string, unknown> = {
      ...validEnvironment(),
    };
    delete missingDatabase.NEST_DATABASE_URL;

    expect(() => validateEnvironment(missingDatabase)).toThrow(
      /NEST_DATABASE_URL/,
    );
    expect(() =>
      validateEnvironment({
        ...validEnvironment(),
        NEST_DATABASE_URL: 'https://example.test/database',
      }),
    ).toThrow(/NEST_DATABASE_URL/);
    expect(() =>
      validateEnvironment({
        ...validEnvironment(),
        JWT_EXPIRES_IN: '15m',
      }),
    ).toThrow(/JWT_EXPIRES_IN must be 1h/);
    expect(() =>
      validateEnvironment({
        ...validEnvironment(),
        NODE_ENV: 'staging',
      }),
    ).toThrow(/NODE_ENV/);
  });

  it('rejects wildcard and non-local development origins', () => {
    for (const origin of ['*', 'https://frontend.example.test']) {
      expect(() =>
        validateEnvironment({
          ...validEnvironment(),
          CORS_ORIGINS: origin,
        }),
      ).toThrow(/CORS_ORIGINS/);
    }
  });

  it('accepts explicitly allowed origins and rejects other origins', () => {
    const config = validateEnvironment({
      ...validEnvironment(),
      CORS_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
    }).security;
    const cors = createCorsOptions(config);
    const allowed = jest.fn();
    const rejected = jest.fn();

    cors.origin('http://localhost:3000', allowed);
    cors.origin('http://localhost:4000', rejected);

    expect(allowed).toHaveBeenCalledWith(null, true);
    expect(rejected).toHaveBeenCalledWith(null, false);
    expect(cors.credentials).toBe(true);
    expect(cors.methods).not.toContain('*');
    expect(cors.allowedHeaders).toEqual(['Content-Type', 'X-CSRF-Token']);
  });

  it('rejects a wildcard even when credentials are enabled', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment(),
        CORS_ORIGINS: 'http://localhost:3000,*',
      }),
    ).toThrow(/CORS_ORIGINS/);
  });

  it('builds local development cookie options', () => {
    const config = validateEnvironment(validEnvironment()).security;

    expect(createAuthCookieOptions(config)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 1000,
    });
  });

  it('builds secure production cookie options for temporary cross-site hosting', () => {
    const config = validateEnvironment({
      ...validEnvironment(),
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://frontend.example.test',
      AUTH_COOKIE_SAME_SITE: 'none',
      AUTH_COOKIE_SECURE: 'true',
      AUTH_COOKIE_DOMAIN: 'example.test',
    }).security;

    expect(createAuthCookieOptions(config)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      domain: 'example.test',
      maxAge: 60 * 60 * 1000,
    });
  });

  it('rejects incompatible cookie security settings', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment(),
        AUTH_COOKIE_SAME_SITE: 'none',
      }),
    ).toThrow(/AUTH_COOKIE_SECURE=true/);
    expect(() =>
      validateEnvironment({
        ...validEnvironment(),
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://frontend.example.test',
        AUTH_COOKIE_SECURE: 'false',
      }),
    ).toThrow(/AUTH_COOKIE_SECURE/);
    expect(() =>
      validateEnvironment({
        ...validEnvironment(),
        AUTH_COOKIE_SECURE: 'true',
      }),
    ).toThrow(/development and test cookies/);
  });

  it('does not disclose secret values in configuration errors', () => {
    const secret = 'a-secret-that-must-not-appear-in-the-error';

    try {
      validateEnvironment({
        ...validEnvironment(),
        JWT_SECRET: secret,
        CORS_ORIGINS: '*',
      });
      throw new Error('Expected configuration validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(secret);
      expect((error as Error).message).toContain('CORS_ORIGINS');
    }
  });

  it('allows an omitted cookie domain without adding one to options', () => {
    const config = validateEnvironment(validEnvironment()).security;

    expect(createAuthCookieOptions(config)).not.toHaveProperty('domain');
  });

  it('creates immediate cookie-clear options without reusing maxAge', () => {
    const config = validateEnvironment({
      ...validEnvironment(),
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://frontend.example.test',
      AUTH_COOKIE_SAME_SITE: 'none',
      AUTH_COOKIE_SECURE: 'true',
      AUTH_COOKIE_DOMAIN: 'example.test',
    }).security;

    expect(createAuthCookieClearOptions(config)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      domain: 'example.test',
      expires: new Date(0),
    });
    expect(createAuthCookieClearOptions(config)).not.toHaveProperty('maxAge');
  });
});
