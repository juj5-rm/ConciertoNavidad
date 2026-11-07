import 'dotenv/config';
import { PrismaService } from '../src/prisma/prisma.service';

async function seedEventCapacity(): Promise<void> {
    const prisma = new PrismaService();

    try {
        await prisma.$connect();
        await prisma.configuracionEvento.upsert({
            where: { clave: 'capacidad_maxima' },
            create: {
                clave: 'capacidad_maxima',
                valor: 100,
                descripcion: 'Capacidad máxima de asistentes del evento',
            },
            update: {},
        });
    } finally {
        await prisma.$disconnect();
    }
}

void seedEventCapacity().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});