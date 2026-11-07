import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
    extends PrismaClient
    implements OnModuleInit, OnModuleDestroy {
    constructor() {
        const connectionString = process.env.NEST_DATABASE_URL;
        if (!connectionString) {
            throw new Error('NEST_DATABASE_URL is required for the NestJS database.');
        }

        super({ adapter: new PrismaPg({ connectionString }) });
    }

    async onModuleInit(): Promise<void> {
        await this.$connect();
    }

    async onModuleDestroy(): Promise<void> {
        await this.$disconnect();
    }
}