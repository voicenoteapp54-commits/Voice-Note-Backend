
import { prisma } from "./lib/prisma.js";

async function main() {
  await prisma.$connect();

  const result = await prisma.$queryRaw<
    { database_time: Date }[]
  >`SELECT NOW() AS database_time`;

  console.log("Database connection successful!");
  console.log("Database time:", result[0]?.database_time);
}

main()
  .catch((error) => {
    console.error("Database connection failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
