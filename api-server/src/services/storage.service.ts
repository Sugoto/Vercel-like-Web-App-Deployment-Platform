import fs from "fs";
import path from "path";
import { StorageClient } from "@supabase/storage-js";
import mime from "mime-types";
import { config } from "../config";

const storageClient = new StorageClient(
  `${config.SUPABASE_URL}/storage/v1`,
  {
    apikey: config.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${config.SUPABASE_SERVICE_KEY}`,
  }
);

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

export async function uploadDirectory(
  dirPath: string,
  slug: string,
  onLog: (msg: string) => void
): Promise<void> {
  const files = getAllFiles(dirPath);
  onLog(`Uploading ${files.length} files...`);

  for (const filePath of files) {
    const relativePath = path.relative(dirPath, filePath);
    const key = `__outputs/${slug}/${relativePath}`;
    const contentType = mime.lookup(filePath) || "application/octet-stream";
    const fileBuffer = fs.readFileSync(filePath);

    const { error } = await storageClient
      .from(config.SUPABASE_BUCKET)
      .upload(key, fileBuffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Failed to upload ${relativePath}: ${error.message}`);
    }

    onLog(`Uploaded ${relativePath}`);
  }
}
