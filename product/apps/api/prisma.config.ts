import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Only the Prisma CLI reads this (generate, migrate dev). The server reads DATABASE_URL itself.
    url: process.env.DATABASE_URL || "postgres://rookbox:rookbox@127.0.0.1:5432/rookbox",
  },
});
