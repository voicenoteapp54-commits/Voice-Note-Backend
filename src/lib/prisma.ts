import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { config } from "../../config/env.ts";

const adapter = new PrismaPg({
  connectionString: config.databaseUrl,
  ssl: {
    ca: config.databaseCaCert,
    rejectUnauthorized: true,
  },
});

export const prisma = new PrismaClient({ adapter });