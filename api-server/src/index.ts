import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { rateLimiter } from "hono-rate-limiter";
import { logger } from "hono/logger";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { serve } from "@hono/node-server";
import { Server as SocketIOServer } from "socket.io";
import { generateSlug } from "random-word-slugs";
import { config } from "./config";
import { queries, type Project } from "./db";
import { initRedis, disconnectRedis, getRedisStatus } from "./services/log.service";
import { enqueueBuild, getQueueLength } from "./services/build.service";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", secureHeaders());
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
    createdAt: new Date(p.created_at).toISOString(),
    buildDurationMs: p.build_duration_ms,
    totalFiles: p.total_files,
    totalSizeBytes: p.total_size_bytes,
    buildLog: p.build_log,
    screenshotUrl: p.screenshot_url,
  };
}

// Routes
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

    const existing = queries.getBySlug.get(slug);
    if (existing) {
      return c.json({ error: `Slug "${slug}" is already taken.` }, 409);
    }

    const project = queries.insert.get(slug, gitURL, "queued", Date.now());
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

app.get("/projects", (c) => {
  const allProjects = queries.getAll.all();
  return c.json({ data: allProjects.map(toApiProject) });
});

app.get("/projects/:slug", (c) => {
  const project = queries.getBySlug.get(c.req.param("slug"));
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }
  return c.json({ data: toApiProject(project) });
});

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Serve Hono via Node HTTP server so Socket.IO can attach to same port
const httpServer = serve({ fetch: app.fetch, port: config.PORT });

const io = new SocketIOServer(httpServer, {
  cors: { origin: config.CLIENT_URL, methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  socket.on("subscribe", (channel: string) => {
    socket.join(channel);
    socket.emit("message", JSON.stringify({ log: `Joined ${channel}` }));
  });
});

initRedis(io);

console.log(`Verse API running on port ${config.PORT}`);

function gracefulShutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  httpServer.close();
  disconnectRedis();
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
