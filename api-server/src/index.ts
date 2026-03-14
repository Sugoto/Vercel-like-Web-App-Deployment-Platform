import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { rateLimiter } from "hono-rate-limiter";
import { logger } from "hono/logger";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { generateSlug } from "random-word-slugs";
import { config } from "./config";
import { db, type Project } from "./db";
import {
  initRedis,
  disconnectRedis,
  getRedisStatus,
  subscribeSocket,
  unsubscribeSocket,
} from "./services/log.service";
import { enqueueBuild, getQueueLength } from "./services/build.service";

const app = new Hono();

app.use("*", logger());
app.use("*", secureHeaders({ crossOriginResourcePolicy: "cross-origin" }));
app.use("*", cors({ origin: config.CLIENT_URL }));

const deployLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 3,
  keyGenerator: () => "global",
});

const createProjectSchema = z.object({
  gitURL: z
    .string()
    .url("Must be a valid URL")
    .regex(
      /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/,
      "Must be a valid public GitHub repository URL (https://github.com/owner/repo)"
    ),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens")
    .min(3)
    .max(48)
    .optional(),
});

function toApiProject(p: Project) {
  return {
    id: p.id,
    slug: p.slug,
    gitUrl: p.git_url,
    status: p.status,
    createdAt: p.created_at,
    buildDurationMs: p.build_duration_ms,
    totalFiles: p.total_files,
    totalSizeBytes: p.total_size_bytes,
    buildLog: p.build_log,
    screenshotUrl: p.screenshot_url,
    shortUrl: p.short_url,
  };
}

app.get("/", (c) => c.json({ name: "Verse API", version: "3.0.0" }));

app.get("/health", async (c) => {
  const redis = await getRedisStatus();
  return c.json({
    status: redis === "connected" ? "healthy" : "degraded",
    uptime: Math.floor(process.uptime()),
    redis,
  });
});

app.post(
  "/projects",
  deployLimiter,
  zValidator("json", createProjectSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Validation failed", details: result.error.flatten().fieldErrors }, 400);
    }
  }),
  async (c) => {
    const { gitURL, slug: requestedSlug } = c.req.valid("json");
    const slug = requestedSlug || generateSlug();

    const existing = await db.getBySlug(slug);
    if (existing) {
      return c.json({ error: `Slug "${slug}" is already taken.` }, 409);
    }

    const project = await db.insert(slug, gitURL, "queued");
    const deployUrl = `${config.DEPLOY_BASE_URL.replace(/\/$/, "")}/${slug}`;
    const queuePosition = getQueueLength() + 1;

    setTimeout(() => {
      enqueueBuild(slug, gitURL);
    }, 2000);

    return c.json({
      status: "queued",
      data: { projectSlug: project!.slug, url: deployUrl, queuePosition },
    }, 201);
  }
);

app.get("/projects", async (c) => {
  const allProjects = await db.getAll();
  return c.json({ data: allProjects.map(toApiProject) });
});

app.get("/projects/:slug", async (c) => {
  const project = await db.getBySlug(c.req.param("slug"));
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }
  return c.json({ data: toApiProject(project) });
});

app.get("/screenshots/:slug", async (c) => {
  const project = await db.getBySlug(c.req.param("slug"));
  if (!project?.screenshot_url) {
    return c.json({ error: "Screenshot not found" }, 404);
  }
  const res = await fetch(project.screenshot_url);
  if (!res.ok) {
    return c.json({ error: "Failed to fetch screenshot" }, 502);
  }
  return new Response(res.body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
      "cross-origin-resource-policy": "cross-origin",
    },
  });
});

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

initRedis();

const server = Bun.serve({
  port: config.PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const origin = req.headers.get("origin") || "";
      if (config.CLIENT_URL !== "*" && origin !== config.CLIENT_URL) {
        return new Response("Forbidden", { status: 403 });
      }
      if (server.upgrade(req, { data: { channel: undefined } as any })) return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    return app.fetch(req, { ip: server.requestIP(req) });
  },
  websocket: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    message(ws: any, message: any) {
      try {
        const parsed = JSON.parse(String(message));
        if (parsed.type === "subscribe" && typeof parsed.channel === "string") {
          subscribeSocket(ws, parsed.channel);
        }
      } catch {}
    },
    close(ws: any) {
      unsubscribeSocket(ws);
    },
  },
});

console.log(`Verse API running on port ${config.PORT}`);

function gracefulShutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  server.stop();
  disconnectRedis();
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
