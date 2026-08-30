import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "sqlite",
    schema: "./db/schema.ts",
    out: "./db/migrations",
    dbCredentials: {
        url: process.env.DATABASE_URL ?? "./dev-data/app.sqlite",
    },
    strict: true,
    verbose: true,
});