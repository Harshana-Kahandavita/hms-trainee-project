import { PrismaClient } from '../prisma/generated/prisma';

interface CustomGlobal extends Global {
  prismaGlobal: PrismaClient;
}

declare const global: CustomGlobal;

const prismaClientSingleton = (): PrismaClient => {
  return new PrismaClient({
  });
};

const prisma = global.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prisma;
}

export default prisma;