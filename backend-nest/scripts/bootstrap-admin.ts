import 'dotenv/config';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { StringDecoder } from 'node:string_decoder';
import { hash } from 'bcryptjs';
import { RolUsuario } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

class BootstrapError extends Error { }

function requireInteractiveTerminal(): void {
    if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== 'function') {
        throw new BootstrapError(
            'An interactive terminal with password input support is required.',
        );
    }
}

async function promptEmail(): Promise<string> {
    const terminal = createInterface({ input: stdin, output: stdout });
    try {
        return (await terminal.question('Administrator email: '))
            .trim()
            .toLowerCase();
    } finally {
        terminal.close();
    }
}

function promptHidden(prompt: string): Promise<string> {
    const previousRawMode = stdin.isRaw;
    const decoder = new StringDecoder('utf8');
    let value = '';
    let readingEscapeSequence = false;

    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();

    return new Promise((resolve, reject) => {
        let finished = false;

        const cleanup = (): void => {
            if (finished) return;
            finished = true;
            stdin.off('data', onData);
            stdin.setRawMode(previousRawMode);
            stdout.write('\n');
        };

        const onData = (chunk: Buffer | string): void => {
            const input = typeof chunk === 'string' ? chunk : decoder.write(chunk);

            for (const character of input) {
                if (character === '\u0003' || character === '\u0004') {
                    cleanup();
                    reject(new BootstrapError('Input cancelled.'));
                    return;
                }
                if (readingEscapeSequence) {
                    if (/[A-Za-z~]/.test(character)) readingEscapeSequence = false;
                    continue;
                }
                if (character === '\u001b') {
                    readingEscapeSequence = true;
                    continue;
                }
                if (character === '\r' || character === '\n') {
                    cleanup();
                    resolve(value);
                    return;
                }
                if (character === '\u007f' || character === '\b') {
                    value = Array.from(value).slice(0, -1).join('');
                    continue;
                }
                if (!/[\u0000-\u001f\u007f]/.test(character)) {
                    value += character;
                }
            }
        };

        stdin.on('data', onData);
    });
}

function safeErrorMessage(error: unknown): string {
    if (error instanceof BootstrapError) return error.message;

    if (typeof error !== 'object' || error === null) {
        return 'Bootstrap failed. No safe error details were available.';
    }

    const details = error as {
        code?: unknown;
        meta?: { code?: unknown; message?: unknown };
    };
    const redact = (value: string): string =>
        value
            .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_DATABASE_URL]')
            .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
            .replace(
                /\b(passwordHash|password|passwd|pwd|token|secret|hash)\b\s*([=:])\s*[^\s,;]+/gi,
                '$1$2[REDACTED]',
            )
            .replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, '[REDACTED_HASH]')
            .replace(/\b[a-f0-9]{64}\b/gi, '[REDACTED_HASH]');

    const output = ['Bootstrap failed.'];
    if (typeof details.code === 'string') {
        output.push(`Prisma error code: ${redact(details.code)}.`);
    }
    if (typeof details.meta?.code === 'string') {
        output.push(`Database error code: ${redact(details.meta.code)}.`);
    }
    if (typeof details.meta?.message === 'string') {
        output.push(
            `Database error message: ${redact(details.meta.message).slice(0, 300)}`,
        );
    }

    return output.join(' ');
}

async function bootstrapFirstAdmin(): Promise<void> {
    requireInteractiveTerminal();

    const email = await promptEmail();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new BootstrapError('A valid email address is required.');
    }

    const password = await promptHidden('Administrator password: ');
    const confirmation = await promptHidden('Confirm password: ');

    if (password.length < 12) {
        throw new BootstrapError('The password must be at least 12 characters.');
    }
    if (password !== confirmation) {
        throw new BootstrapError('The password entries do not match.');
    }

    const passwordHash = await hash(password, 12);

    const prisma = new PrismaService();

    try {
        await prisma.$connect();

        await prisma.$transaction(async (transaction) => {
            await transaction.$executeRaw`SELECT pg_advisory_xact_lock(814720261)`;
            const existingUsers = await transaction.usuario.count();

            if (existingUsers !== 0) {
                throw new BootstrapError(
                    'Bootstrap refused because the Usuario table is not empty.',
                );
            }

            await transaction.usuario.create({
                data: {
                    email,
                    passwordHash,
                    rol: RolUsuario.ADMIN,
                    activo: true,
                },
            });
        });
    } finally {
        await prisma.$disconnect();
    }

    stdout.write('First administrator created successfully.\n');
}

void bootstrapFirstAdmin().catch((error: unknown) => {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
});