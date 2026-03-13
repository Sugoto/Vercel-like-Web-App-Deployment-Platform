import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(9000),
  CLIENT_URL: z.string().default("http://localhost:3000"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // Supabase Storage
  SUPABASE_URL: z.string().min(1, "SUPABASE_URL is required"),
  SUPABASE_SERVICE_KEY: z.string().min(1, "SUPABASE_SERVICE_KEY is required"),
  SUPABASE_BUCKET: z.string().default("verse-outputs"),

  // Public URL where the deployed sites are served (Cloudflare Worker URL)
  DEPLOY_BASE_URL: z.string().min(1, "DEPLOY_BASE_URL is required"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Missing or invalid environment variables:",
    parsed.error.flatten().fieldErrors
  );
  process.exit(1);
}

export const config = parsed.data;
