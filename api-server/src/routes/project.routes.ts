import { Router } from "express";
import { generateSlug } from "random-word-slugs";
import { queries, type Project } from "../db";
import { config } from "../config";
import { validate, createProjectSchema } from "../middleware/validate";
import { deployLimiter } from "../middleware/rate-limit";
import { enqueueBuild, getQueueLength } from "../services/build.service";

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

const router = Router();

router.post("/projects", deployLimiter, validate(createProjectSchema), async (req, res) => {
  const { gitURL, slug: requestedSlug } = req.body;
  const slug = requestedSlug || generateSlug();

  const existing = queries.getBySlug.get(slug);
  if (existing) {
    res.status(409).json({ error: `Slug "${slug}" is already taken.` });
    return;
  }

  const project = queries.insert.get(slug, gitURL, "queued", Date.now());

  const deployUrl = `${config.DEPLOY_BASE_URL.replace(/\/$/, "")}/${slug}`;
  const queuePosition = getQueueLength() + 1;

  setTimeout(() => {
    enqueueBuild(slug, gitURL);
  }, 2000);

  res.status(201).json({
    status: "queued",
    data: {
      projectSlug: project!.slug,
      url: deployUrl,
      queuePosition,
    },
  });
});

router.get("/projects", async (_req, res) => {
  const allProjects = queries.getAll.all();
  res.json({ data: allProjects.map(toApiProject) });
});

router.get("/projects/:slug", async (req, res) => {
  const project = queries.getBySlug.get(req.params.slug);

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.json({ data: toApiProject(project) });
});

export default router;
