import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { config } from "../config";

export interface UploadResult {
  totalFiles: number;
  totalSizeBytes: number;
  files: { path: string; sizeBytes: number }[];
  deployUrl: string;
}

function getAllFiles(dirPath: string): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        results.push(fullPath);
      }
    }
  }

  walk(dirPath);
  return results;
}

const CF_API = "https://api.cloudflare.com/client/v4";

async function ensurePagesProject(slug: string): Promise<void> {
  const res = await fetch(
    `${CF_API}/accounts/${config.CF_ACCOUNT_ID}/pages/projects/${slug}`,
    { headers: { Authorization: `Bearer ${config.CF_API_TOKEN}` } }
  );

  if (res.ok) return;

  const createRes = await fetch(
    `${CF_API}/accounts/${config.CF_ACCOUNT_ID}/pages/projects`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: slug,
        production_branch: "main",
      }),
    }
  );

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    const msg = (err as any)?.errors?.[0]?.message || createRes.statusText;
    throw new Error(`Failed to create Pages project "${slug}": ${msg}`);
  }
}

async function getPagesSubdomain(slug: string): Promise<string> {
  const res = await fetch(
    `${CF_API}/accounts/${config.CF_ACCOUNT_ID}/pages/projects/${slug}`,
    { headers: { Authorization: `Bearer ${config.CF_API_TOKEN}` } }
  );

  if (res.ok) {
    const data = (await res.json()) as { result: { subdomain: string } };
    return data.result.subdomain;
  }

  return `${slug}.pages.dev`;
}

function runWrangler(
  args: string[],
  onLog: (msg: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const output: string[] = [];
    const p = spawn("bunx", ["wrangler", ...args], {
      stdio: "pipe",
      env: {
        ...process.env,
        CLOUDFLARE_ACCOUNT_ID: config.CF_ACCOUNT_ID,
        CLOUDFLARE_API_TOKEN: config.CF_API_TOKEN,
      },
    });

    p.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      lines.forEach((line) => {
        output.push(line);
        onLog(line);
      });
    });

    p.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      lines.forEach((line) => {
        output.push(line);
        onLog(line);
      });
    });

    p.on("error", reject);

    p.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Wrangler exited with code ${code}`));
      } else {
        resolve(output.join("\n"));
      }
    });
  });
}

export async function uploadDirectory(
  dirPath: string,
  slug: string,
  onLog: (msg: string) => void
): Promise<UploadResult> {
  const filePaths = getAllFiles(dirPath);
  onLog(`Deploying ${filePaths.length} files to Cloudflare Pages...`);

  let totalSizeBytes = 0;
  const files: { path: string; sizeBytes: number }[] = [];

  for (const filePath of filePaths) {
    const relativePath = path.relative(dirPath, filePath);
    const stat = fs.statSync(filePath);
    totalSizeBytes += stat.size;
    files.push({ path: relativePath, sizeBytes: stat.size });
  }

  await ensurePagesProject(slug);

  await runWrangler(
    ["pages", "deploy", dirPath, "--project-name", slug, "--branch", "main", "--commit-dirty=true"],
    onLog
  );

  const subdomain = await getPagesSubdomain(slug);
  const deployUrl = `https://${subdomain}`;
  onLog(`Deployed to ${deployUrl}`);

  return { totalFiles: filePaths.length, totalSizeBytes, files, deployUrl };
}
