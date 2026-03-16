import { readFile } from "fs/promises";
import fs from "fs";
import path from "path";
import { lookup } from "mrmime";
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

export async function uploadDirectory(
  dirPath: string,
  slug: string,
  onLog: (msg: string) => void
): Promise<UploadResult> {
  const filePaths = getAllFiles(dirPath);
  onLog(`Uploading ${filePaths.length} files to Cloudflare Pages...`);

  await ensurePagesProject(slug);

  const formData = new FormData();
  let totalSizeBytes = 0;
  const files: { path: string; sizeBytes: number }[] = [];

  for (const filePath of filePaths) {
    const relativePath = path.relative(dirPath, filePath);
    const contentType = lookup(filePath) || "application/octet-stream";
    const fileBuffer = await readFile(filePath);
    const sizeBytes = fileBuffer.length;

    totalSizeBytes += sizeBytes;
    files.push({ path: relativePath, sizeBytes });

    const blob = new Blob([fileBuffer], { type: contentType });
    formData.append(relativePath, blob, relativePath);
  }

  const deployRes = await fetch(
    `${CF_API}/accounts/${config.CF_ACCOUNT_ID}/pages/projects/${slug}/deployments`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${config.CF_API_TOKEN}` },
      body: formData,
    }
  );

  if (!deployRes.ok) {
    const err = await deployRes.json().catch(() => ({}));
    const msg = (err as any)?.errors?.[0]?.message || deployRes.statusText;
    throw new Error(`Cloudflare Pages deployment failed: ${msg}`);
  }

  const result = (await deployRes.json()) as {
    result: { url: string; environment: string };
  };

  const deployUrl = `https://${slug}.pages.dev`;
  onLog(`Deployed to ${deployUrl}`);

  return { totalFiles: filePaths.length, totalSizeBytes, files, deployUrl };
}
