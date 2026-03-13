interface Env {
  STORAGE_BASE_URL: string;
}

async function fetchFromStorage(env: Env, key: string): Promise<Response> {
  const url = `${env.STORAGE_BASE_URL}/${key}`;
  return fetch(url);
}

const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  mjs: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml",
  webmanifest: "application/manifest+json",
  wasm: "application/wasm",
  map: "application/json",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
};

function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  return MIME_TYPES[ext] || "application/octet-stream";
}

function rewriteHtmlPaths(html: string, slug: string): string {
  return html
    .replaceAll('src="/', `src="/${slug}/`)
    .replaceAll('href="/', `href="/${slug}/`)
    .replaceAll("src='/", `src='/${slug}/`)
    .replaceAll("href='/", `href='/${slug}/`);
}

function hasContentHash(fileName: string): boolean {
  return /[-_.][a-f0-9]{8,}\./.test(fileName);
}

function getCacheControl(filePath: string): string {
  if (filePath.endsWith(".html")) {
    return "public, max-age=60, s-maxage=300";
  }
  if (hasContentHash(filePath)) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600";
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const cacheKey = new Request(url.toString(), request);
    const cache = (caches as unknown as { default: Cache }).default;

    // Check edge cache first
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) return cachedResponse;

    const pathSegments = url.pathname.split("/").filter(Boolean);
    const slug = pathSegments[0];

    if (!slug) {
      return new Response(
        "Verse — Enter a project slug in the URL, e.g. /my-project",
        { status: 200, headers: { "Content-Type": "text/plain" } }
      );
    }

    const filePath = pathSegments.slice(1).join("/") || "index.html";
    const key = `__outputs/${slug}/${filePath}`;

    let response = await fetchFromStorage(env, key);
    let servingFile = filePath;

    if (!response.ok && !filePath.includes(".")) {
      const fallbackKey = `__outputs/${slug}/${filePath}/index.html`;
      response = await fetchFromStorage(env, fallbackKey);
      if (response.ok) servingFile = `${filePath}/index.html`;
    }

    if (!response.ok) {
      const rootIndex = `__outputs/${slug}/index.html`;
      response = await fetchFromStorage(env, rootIndex);
      if (!response.ok) {
        return new Response("Not Found", { status: 404 });
      }
      servingFile = "index.html";
    }

    const contentType = getMimeType(servingFile);
    const cacheControl = getCacheControl(servingFile);
    const headers = new Headers();
    headers.set("content-type", contentType);
    headers.set("cache-control", cacheControl);

    let finalResponse: Response;

    if (servingFile.endsWith(".html")) {
      const html = await response.text();
      const rewritten = rewriteHtmlPaths(html, slug);
      finalResponse = new Response(rewritten, { status: 200, headers });
    } else {
      finalResponse = new Response(response.body, { status: 200, headers });
    }

    // Store in edge cache (don't await -- fire and forget)
    if (!servingFile.endsWith(".html")) {
      ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));
    }

    return finalResponse;
  },
};
