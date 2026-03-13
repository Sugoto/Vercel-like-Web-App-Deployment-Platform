import { readFile } from "fs/promises";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { lookup } from "mrmime";
import { config } from "../config";

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);

export interface UploadResult {
  totalFiles: number;
  totalSizeBytes: number;
  files: { path: string; sizeBytes: number }[];
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

const UPLOAD_CONCURRENCY = 5;

export async function uploadDirectory(
  dirPath: string,
  slug: string,
  onLog: (msg: string) => void
): Promise<UploadResult> {
  const filePaths = getAllFiles(dirPath);
  onLog(`Uploading ${filePaths.length} files...`);

  let totalSizeBytes = 0;
  const files: { path: string; sizeBytes: number }[] = [];

  // Process uploads in parallel batches
  for (let i = 0; i < filePaths.length; i += UPLOAD_CONCURRENCY) {
    const batch = filePaths.slice(i, i + UPLOAD_CONCURRENCY);

    const results = await Promise.all(
      batch.map(async (filePath) => {
        const relativePath = path.relative(dirPath, filePath);
        const key = `__outputs/${slug}/${relativePath}`;
        const contentType = lookup(filePath) || "application/octet-stream";
        const fileBuffer = await readFile(filePath);
        const sizeBytes = fileBuffer.length;

    const { error } = await supabase.storage
      .from(config.SUPABASE_BUCKET)
      .upload(key, fileBuffer, {
            contentType,
            upsert: true,
          });

        if (error) {
          throw new Error(`Failed to upload ${relativePath}: ${error.message}`);
        }

        onLog(`Uploaded ${relativePath}`);
        return { path: relativePath, sizeBytes };
      })
    );

    for (const r of results) {
      totalSizeBytes += r.sizeBytes;
      files.push(r);
    }
  }

  return { totalFiles: filePaths.length, totalSizeBytes, files };
}
