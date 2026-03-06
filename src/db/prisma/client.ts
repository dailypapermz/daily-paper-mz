import { PrismaClient } from "../../generated/prisma";

declare global {
  var __prismaClient: PrismaClient | undefined;
}

export const prisma =
  global.__prismaClient ??
  new PrismaClient({
    log: ["warn", "error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.__prismaClient = prisma;
}
