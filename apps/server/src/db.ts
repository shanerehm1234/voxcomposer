import { PrismaClient } from '@prisma/client';

/** Shared Prisma client (single connection pool for the process). */
export const prisma = new PrismaClient();
