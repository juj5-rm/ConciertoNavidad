jest.mock('@nestjs/passport', () => ({
    AuthGuard: () =>
        class {
            canActivate(): boolean {
                return false;
            }
        },
}));
jest.mock('@nestjs/jwt', () => ({
    JwtService: class JwtService { },
}));

import {
    INestApplication,
    UnauthorizedException,
    ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { validateEnvironment } from '../../config/security.config';
import type { SecurityConfiguration } from '../../config/security.config';
import {
    AUTH_SECURITY_CONFIGURATION,
    INVALID_CREDENTIALS_MESSAGE,
} from '../auth.constants';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';

const TOKEN = 'signed.jwt.token';
const CREDENTIALS = {
    email: 'admin@example.test',
    password: 'controlled-test-password',
};
const USER = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: CREDENTIALS.email,
    rol: 'ADMIN',
};

function createSecurityConfiguration(
    overrides: Record<string, string> = {},
): SecurityConfiguration {
    return validateEnvironment({
        NODE_ENV: 'test',
        NEST_DATABASE_URL: 'postgresql://user:password@localhost:5432/test_db',
        JWT_SECRET: 'a-secure-test-secret-with-at-least-32-bytes',
        JWT_EXPIRES_IN: '1h',
        CORS_ORIGINS: 'http://localhost:3000',
        AUTH_COOKIE_NAME: 'concierto_auth',
        AUTH_COOKIE_SAME_SITE: 'lax',
        AUTH_COOKIE_SECURE: 'false',
        AUTH_COOKIE_DOMAIN: '',
        ...overrides,
    }).security;
}

function firstSetCookie(response: {
    headers: Record<string, string | string[] | undefined>;
}): string {
    const header = response.headers['set-cookie'];
    const cookie = Array.isArray(header) ? header[0] : header;
    if (!cookie) throw new Error('Expected a Set-Cookie response header.');
    return cookie;
}

async function createHttpApp(
    authService: { login: jest.Mock },
    security: SecurityConfiguration,
): Promise<INestApplication<App>> {
    const moduleRef = await Test.createTestingModule({
        controllers: [AuthController],
        providers: [
            { provide: AuthService, useValue: authService },
            { provide: AUTH_SECURITY_CONFIGURATION, useValue: security },
        ],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
            forbidUnknownValues: true,
        }),
    );
    await app.init();
    return app;
}

describe('Auth HTTP integration (Express cookies)', () => {
    let app: INestApplication<App>;
    let authService: { login: jest.Mock };
    const security = createSecurityConfiguration();

    beforeEach(async () => {
        authService = {
            login: jest.fn().mockResolvedValue({ token: TOKEN, user: USER }),
        };
        app = await createHttpApp(authService, security);
    });

    afterEach(async () => {
        await app.close();
    });

    it('emits the configured HttpOnly cookie on a successful HTTP login', async () => {
        const response = await request(app.getHttpServer())
            .post('/auth/login')
            .send(CREDENTIALS);

        expect(response.status).toBe(200);
        expect(authService.login).toHaveBeenCalledWith(CREDENTIALS);
        const cookie = firstSetCookie(response);
        expect(cookie).toMatch(new RegExp(`^${security.authCookieName}=`));
        expect(cookie).toMatch(/;\s*httponly(?:;|$)/i);
        expect(cookie).toMatch(/;\s*path=\//i);
        expect(cookie).toMatch(/;\s*max-age=3600(?:;|$)/i);
        expect(cookie).toMatch(/;\s*expires=/i);
        expect(cookie).toMatch(/;\s*samesite=lax(?:;|$)/i);
        expect(cookie).not.toMatch(/;\s*secure(?:;|$)/i);
        expect(cookie).not.toMatch(/;\s*domain=/i);
        expect(response.body).toEqual({
            message: 'Inicio de sesión exitoso.',
            user: USER,
        });
        expect(JSON.stringify(response.body)).not.toContain(TOKEN);
        expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('returns generic authentication failure without issuing a cookie', async () => {
        authService.login.mockRejectedValue(
            new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE),
        );

        const response = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ ...CREDENTIALS, password: 'incorrect-test-password' });

        expect(response.status).toBe(401);
        expect((response.body as { message: string }).message).toBe(
            INVALID_CREDENTIALS_MESSAGE,
        );
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(JSON.stringify(response.body)).not.toContain(TOKEN);
        expect(JSON.stringify(response.body)).not.toContain('passwordHash');
        expect(JSON.stringify(response.body)).not.toContain('admin@example.test');
    });

    it('clears the cookie over HTTP without requiring a token or calling login', async () => {
        const response = await request(app.getHttpServer()).post('/auth/logout');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ message: 'Sesión cerrada.' });
        expect(authService.login).not.toHaveBeenCalled();
        const cookie = firstSetCookie(response);
        expect(cookie.startsWith(`${security.authCookieName}=`)).toBe(true);
        expect(cookie).toMatch(/;\s*path=\//i);
        expect(cookie).toMatch(/;\s*httponly(?:;|$)/i);
        expect(cookie).toMatch(/;\s*samesite=lax(?:;|$)/i);
        expect(cookie).not.toMatch(/;\s*max-age=/i);
        expect(cookie).toMatch(/;\s*expires=/i);
        const expires = /;\s*expires=([^;]+)/i.exec(cookie);
        expect(new Date(expires?.[1] ?? '').getTime()).toBeLessThan(Date.now());
        expect(JSON.stringify(response.body)).not.toContain(TOKEN);
    });

    it('clears the cookie on consecutive logout requests', async () => {
        const first = await request(app.getHttpServer()).post('/auth/logout');
        const second = await request(app.getHttpServer()).post('/auth/logout');

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        for (const response of [first, second]) {
            const cookie = firstSetCookie(response);
            expect(cookie.startsWith(`${security.authCookieName}=`)).toBe(true);
            expect(cookie).not.toMatch(/;\s*max-age=/i);
            const expires = /;\s*expires=([^;]+)/i.exec(cookie);
            expect(new Date(expires?.[1] ?? '').getTime()).toBeLessThan(Date.now());
        }
        expect(authService.login).not.toHaveBeenCalled();
    });

    it('uses the same configured domain when issuing and clearing the cookie', async () => {
        await app.close();
        const domainSecurity = createSecurityConfiguration({
            AUTH_COOKIE_DOMAIN: 'example.test',
        });
        app = await createHttpApp(authService, domainSecurity);

        const login = await request(app.getHttpServer())
            .post('/auth/login')
            .send(CREDENTIALS);
        const logout = await request(app.getHttpServer()).post('/auth/logout');
        const issuedCookie = firstSetCookie(login);
        const clearedCookie = firstSetCookie(logout);

        expect(login.status).toBe(200);
        expect(logout.status).toBe(200);
        expect(issuedCookie).toMatch(/;\s*domain=example\.test(?:;|$)/i);
        expect(clearedCookie).toMatch(/;\s*domain=example\.test(?:;|$)/i);
        expect(clearedCookie).not.toMatch(/;\s*max-age=/i);
        const expires = /;\s*expires=([^;]+)/i.exec(clearedCookie);
        expect(new Date(expires?.[1] ?? '').getTime()).toBeLessThan(Date.now());
        expect(authService.login).toHaveBeenCalledTimes(1);
    });
});
