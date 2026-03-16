import { readFile } from "fs/promises";
import { createHash } from "crypto";
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

function md5(data: Buffer): string {
  return createHash("md5").update(data).digest("hex");
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

  const manifest: Record<string, string> = {};
  const filesByHash = new Map<string, { buffer: Buffer; relativePath: string }>();
  let totalSizeBytes = 0;
  const files: { path: string; sizeBytes: number }[] = [];

  for (const filePath of filePaths) {
    const relativePath = path.relative(dirPath, filePath);
    const fileBuffer = await readFile(filePath);
    const sizeBytes = fileBuffer.length;
    const hash = md5(fileBuffer);

    totalSizeBytes += sizeBytes;
    files.push({ path: relativePath, sizeBytes });

    const manifestKey = `/${relativePath}`;
    manifest[manifestKey] = hash;
    filesByHash.set(hash, { buffer: fileBuffer, relativePath });
  }

  const formData = new FormData();
  formData.append("manifest", JSON.stringify(manifest));

  for (const [hash, { buffer }] of filesByHash) {
    formData.append(hash, new Blob([new Uint8Array(buffer)]));
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

  const deployUrl = `https://${slug}.pages.dev`;
  onLog(`Deployed to ${deployUrl}`);

  return { totalFiles: filePaths.length, totalSizeBytes, files, deployUrl };
}
