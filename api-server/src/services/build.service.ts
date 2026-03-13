import { spawn } from "child_process";
import fs from "fs";
import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { db } from "../db";
import { config } from "../config";
import { publishLog } from "./log.service";
import { uploadDirectory } from "./storage.service";

interface QueuedBuild {
  slug: string;
  gitUrl: string;
}

const buildQueue: QueuedBuild[] = [];
let buildInProgress = false;

export function isBuildInProgress(): boolean {
  return buildInProgress;
}

export function getQueuePosition(slug: string): number {
  const idx = buildQueue.findIndex((b) => b.slug === slug);
  return idx === -1 ? -1 : idx + 1;
}

export function getQueueLength(): number {
  return buildQueue.length;
}

export function enqueueBuild(slug: string, gitUrl: string) {
  buildQueue.push({ slug, gitUrl });
  processQueue();
}

async function processQueue() {
  if (buildInProgress || buildQueue.length === 0) return;
  const next = buildQueue.shift()!;
  await runBuild(next.slug, next.gitUrl);
  processQueue();
}

const OUTPUT_DIR_CANDIDATES = ["dist", "build", "out"];

function detectOutputDir(projectRoot: string): string | null {
  for (const dir of OUTPUT_DIR_CANDIDATES) {
    const fullPath = path.join(projectRoot, dir);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      return fullPath;
    }
  }
  return null;
}

function runCommand(
  cmd: string,
  args: string[],
  onLog: (msg: string) => void,
  options?: { cwd?: string; timeout?: number }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      cwd: options?.cwd,
      stdio: "pipe",
      timeout: options?.timeout,
    });

    p.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      lines.forEach((line) => onLog(line));
    });

    p.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      lines.forEach((line) => onLog(line));
    });

    p.on("error", reject);

    p.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Command "${cmd} ${args.join(" ")}" exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

function publishEvent(slug: string, event: Record<string, unknown>) {
  publishLog(slug, JSON.stringify(event));
}

const BUILD_TIMEOUT = 5 * 60 * 1000;

async function runBuild(slug: string, gitUrl: string): Promise<void> {
  buildInProgress = true;
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), `verse-${slug}-`));
  const buildStartTime = Date.now();
  const logLines: string[] = [];
  const phases: { name: string; durationMs: number }[] = [];

  const log = (msg: string) => {
    logLines.push(msg);
    publishLog(slug, msg);
  };

  try {
    await db.updateStatus(slug, "building");

    log("Build started...");

    let phaseStart = Date.now();
    log("Cloning repository...");
    await runCommand("git", ["clone", "--depth", "1", gitUrl, tmpDir], log, {
      timeout: BUILD_TIMEOUT,
    });
    let phaseDuration = Date.now() - phaseStart;
    phases.push({ name: "clone", durationMs: phaseDuration });
    publishEvent(slug, { type: "metric", phase: "clone", durationMs: phaseDuration });

    phaseStart = Date.now();
    log("Installing dependencies...");
    await runCommand("bun", ["install"], log, {
      cwd: tmpDir,
      timeout: BUILD_TIMEOUT,
    });
    phaseDuration = Date.now() - phaseStart;
    phases.push({ name: "install", durationMs: phaseDuration });
    publishEvent(slug, { type: "metric", phase: "install", durationMs: phaseDuration });

    phaseStart = Date.now();
    log("Building project...");
    await runCommand("bun", ["run", "build"], log, {
      cwd: tmpDir,
      timeout: BUILD_TIMEOUT,
    });
    phaseDuration = Date.now() - phaseStart;
    phases.push({ name: "build", durationMs: phaseDuration });
    publishEvent(slug, { type: "metric", phase: "build", durationMs: phaseDuration });

    const outputDir = detectOutputDir(tmpDir);
    if (!outputDir) {
      throw new Error(
        `No build output found. Checked: ${OUTPUT_DIR_CANDIDATES.join(", ")}`
      );
    }

    phaseStart = Date.now();
    log(`Found output in ${path.basename(outputDir)}/`);
    const uploadResult = await uploadDirectory(outputDir, slug, log);
    phaseDuration = Date.now() - phaseStart;
    phases.push({ name: "upload", durationMs: phaseDuration });
    publishEvent(slug, { type: "metric", phase: "upload", durationMs: phaseDuration });

    const buildDurationMs = Date.now() - buildStartTime;

    publishEvent(slug, {
      type: "summary",
      totalFiles: uploadResult.totalFiles,
      totalSizeBytes: uploadResult.totalSizeBytes,
      buildDurationMs,
      phases,
      files: uploadResult.files,
    });

    const deployUrl = `${config.DEPLOY_BASE_URL.replace(/\/$/, "")}/${slug}`;
    const screenshotUrl = `https://image.thum.io/get/width/1280/crop/720/${deployUrl}`;

    await db.updateDeployed(
      slug,
      buildDurationMs,
      uploadResult.totalFiles,
      uploadResult.totalSizeBytes,
      JSON.stringify(logLines),
      screenshotUrl
    );

    publishEvent(slug, { type: "screenshot", url: screenshotUrl });

    log("Done");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Build failed: ${message}`);

    const buildDurationMs = Date.now() - buildStartTime;

    await db.updateFailed(slug, buildDurationMs, JSON.stringify(logLines));
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    buildInProgress = false;
  }
}
