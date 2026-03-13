import { Router } from "express";
import { getRedisStatus } from "../services/log.service";

const router = Router();

router.get("/health", async (_req, res) => {
  const redis = await getRedisStatus();
  const status = redis === "connected" ? "healthy" : "degraded";

  res.json({
    status,
    uptime: Math.floor(process.uptime()),
    redis,
  });
});

export default router;
