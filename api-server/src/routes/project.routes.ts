import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { generateSlug } from "random-word-slugs";
import { db } from "../db";
import { projects } from "../db/schema";
import { config } from "../config";
import { validate, createProjectSchema } from "../middleware/validate";
import { deployLimiter } from "../middleware/rate-limit";
import { enqueueBuild, getQueueLength } from "../services/build.service";

const router = Router();

router.post("/projects", deployLimiter, validate(createProjectSchema), async (req, res) => {
  const { gitURL, slug: requestedSlug } = req.body;
  const slug = requestedSlug || generateSlug();

  const existing = db.select().from(projects).where(eq(projects.slug, slug)).get();
  if (existing) {
    res.status(409).json({ error: `Slug "${slug}" is already taken.` });
    return;
  }

  const project = db
    .insert(projects)
    .values({
      slug,
      gitUrl: gitURL,
      status: "queued",
      createdAt: new Date(),
    })
    .returning()
    .get();

  const deployUrl = `${config.DEPLOY_BASE_URL.replace(/\/$/, "")}/${slug}`;
  const queuePosition = getQueueLength() + 1;

  // Delay build start to give the client time to connect via WebSocket
  setTimeout(() => {
    enqueueBuild(slug, gitURL);
  }, 2000);

  res.status(201).json({
    status: "queued",
    data: {
      projectSlug: project.slug,
      url: deployUrl,
      queuePosition,
    },
  });
});

router.get("/projects", async (_req, res) => {
  const allProjects = db
    .select()
    .from(projects)
    .orderBy(desc(projects.createdAt))
    .limit(50)
    .all();

  res.json({ data: allProjects });
});

router.get("/projects/:slug", async (req, res) => {
  const project = db
    .select()
    .from(projects)
    .where(eq(projects.slug, req.params.slug))
    .get();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.json({ data: project });
});

export default router;
