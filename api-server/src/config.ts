import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(9000),
  CLIENT_URL: z.string().default("http://localhost:3000"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  SUPABASE_URL: z.string().min(1, "SUPABASE_URL is required"),
  SUPABASE_SERVICE_KEY: z.string().min(1, "SUPABASE_SERVICE_KEY is required"),

  CF_ACCOUNT_ID: z.string().min(1, "CF_ACCOUNT_ID is required"),
  CF_API_TOKEN: z.string().min(1, "CF_API_TOKEN is required"),
});

const parsed = envSchema.safeParse(Bun.env);

if (!parsed.success) {
  console.error(
    "Missing or invalid environment variables:",
    parsed.error.flatten().fieldErrors
  );
  process.exit(1);
}

export const config = parsed.data;
