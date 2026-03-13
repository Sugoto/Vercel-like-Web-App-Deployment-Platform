import { spawn } from "child_process";
import fs from "fs";
import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { projects } from "../db/schema";
import { publishLog } from "./log.service";
import { uploadDirectory } from "./storage.service";

let buildInProgress = false;

export function isBuildInProgress(): boolean {
  return buildInProgress;
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

const BUILD_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export async function buildProject(slug: string, gitUrl: string): Promise<void> {
  buildInProgress = true;
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), `verse-${slug}-`));

  const log = (msg: string) => publishLog(slug, msg);

  try {
    db.update(projects)
      .set({ status: "building" })
      .where(eq(projects.slug, slug))
      .run();

    log("Build started...");

    log("Cloning repository...");
    await runCommand("git", ["clone", "--depth", "1", gitUrl, tmpDir], log, {
      timeout: BUILD_TIMEOUT,
    });

    log("Installing dependencies...");
    try {
      await runCommand("npm", ["install"], log, {
        cwd: tmpDir,
        timeout: BUILD_TIMEOUT,
      });
    } catch {
      log("Retrying with --legacy-peer-deps...");
      await runCommand("npm", ["install", "--legacy-peer-deps"], log, {
        cwd: tmpDir,
        timeout: BUILD_TIMEOUT,
      });
    }

    log("Building project...");
    await runCommand("npm", ["run", "build"], log, {
      cwd: tmpDir,
      timeout: BUILD_TIMEOUT,
    });

    const outputDir = detectOutputDir(tmpDir);
    if (!outputDir) {
      throw new Error(
        `No build output found. Checked: ${OUTPUT_DIR_CANDIDATES.join(", ")}`
      );
    }

    log(`Found output in ${path.basename(outputDir)}/`);
    await uploadDirectory(outputDir, slug, log);

    db.update(projects)
      .set({ status: "deployed" })
      .where(eq(projects.slug, slug))
      .run();

    log("Done");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Build failed: ${message}`);

    db.update(projects)
      .set({ status: "failed" })
      .where(eq(projects.slug, slug))
      .run();
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    buildInProgress = false;
  }
}
