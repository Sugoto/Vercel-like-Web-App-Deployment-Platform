# Verse — Deploy Static Sites from GitHub

A Vercel-inspired deployment platform that takes a GitHub repository URL, builds it, and serves the static output on a unique URL — all on free-tier infrastructure with no credit card required.

## Architecture

```
┌──────────────┐  POST /projects   ┌─────────────────────────────┐
│    Client     │─────────────────▶│        API Server            │
│   (Next.js)   │◀────────────────│  Express + Socket.IO + SQLite │
│   on Vercel   │   WebSocket logs │  Builds in-process           │
└──────────────┘                   │        on Render              │
                                   └──────────┬──────────────────┘
                                        upload │   ▲▼ pub/sub
                                   ┌───────────▼──┐  ┌───────────┐
                                   │   Supabase    │  │  Upstash  │
                                   │   Storage     │  │   Redis   │
                                   └──────┬────────┘  └───────────┘
                                          │ serves
                                   ┌──────▼────────────┐
                                   │ Cloudflare Worker  │
                                   │  (serves sites)    │
                                   └───────────────────┘
```

**How it works:**

1. User pastes a public GitHub repo URL in the client and clicks **Deploy**
2. API server clones the repo, runs `npm install && npm run build`
3. Build output (`dist/`, `build/`, or `out/`) is uploaded to Supabase Storage
4. Build logs stream to the client in real-time via Redis pub/sub + Socket.IO
5. Deployed site is served by a Cloudflare Worker reading from Supabase's public bucket URL

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, shadcn/ui |
| API Server | Express 5, Socket.IO, TypeScript, Drizzle ORM, SQLite |
| Storage | Supabase Storage (1 GB free) |
| Pub/Sub | Upstash Redis |
| Static Serving | Cloudflare Workers |
| Hosting | Vercel (client), Render (API) |

## Project Structure

```
├── api-server/          # Express API + build logic + Socket.IO
│   ├── src/
│   │   ├── index.ts           # Entry point
│   │   ├── config.ts          # Environment validation (zod)
│   │   ├── db/                # SQLite schema + connection
│   │   ├── services/          # Build, storage, log services
│   │   ├── middleware/        # Validation, error handling, rate limiting
│   │   └── routes/            # /projects, /health endpoints
│   ├── Dockerfile
│   └── .env.example
├── client/              # Next.js frontend
│   ├── app/
│   │   └── page.tsx           # Deploy UI + log viewer
│   ├── components/ui/         # shadcn/ui components
│   └── .env.example
├── worker/              # Cloudflare Worker (serves deployed sites)
│   ├── src/index.ts
│   └── wrangler.toml
└── docker-compose.yml   # Local dev (Redis + API)
```

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Git](https://git-scm.com/)
- [Docker](https://www.docker.com/) (optional, for local Redis)

## External Services (All Free, No Credit Card)

| Service | What For | Sign Up |
|---------|----------|---------|
| [Supabase](https://supabase.com/dashboard) | Storage for build output (1 GB free) | No credit card needed |
| [Upstash](https://console.upstash.com) | Redis for real-time log streaming | No credit card needed |
| [Cloudflare Workers](https://dash.cloudflare.com) | Serves deployed sites globally | No credit card needed |
| [Render](https://render.com) | Hosting the API server | No credit card needed |
| [Vercel](https://vercel.com) | Hosting the client | No credit card needed |

## Local Development

### 1. Clone the repo

```bash
git clone https://github.com/Sugoto/Vercel-like-Web-App-Deployment-Platform.git
cd Vercel-like-Web-App-Deployment-Platform
```

### 2. Set up the API server

```bash
cd api-server
cp .env.example .env
# Fill in your Supabase credentials, Upstash Redis URL, and Worker URL
npm install
npm run dev
```

### 3. Set up the client

```bash
cd client
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:9000
npm install
npm run dev
```

### 4. (Optional) Use Docker Compose for Redis

If you don't want to use Upstash during local dev, start a local Redis:

```bash
# From the project root
docker compose up redis -d
# Then set REDIS_URL=redis://localhost:6379 in api-server/.env
```

### 5. Deploy the Cloudflare Worker

```bash
cd worker
npm install
npx wrangler login
# Edit wrangler.toml — set STORAGE_BASE_URL to your Supabase public bucket URL
npm run deploy
```

## Deployment

### API Server → Render

1. Go to [render.com](https://render.com), create a new **Web Service**
2. Connect your GitHub repo, set the **Root Directory** to `api-server`
3. **Build Command**: `npm install`
4. **Start Command**: `npm start`
5. Add all environment variables from `api-server/.env.example`

### Client → Vercel

1. Go to [vercel.com](https://vercel.com), import your GitHub repo
2. Set the **Root Directory** to `client`
3. Add env variable: `NEXT_PUBLIC_API_URL` = your Render service URL

### Worker → Cloudflare

1. Run `cd worker && npm run deploy`
2. Set `STORAGE_BASE_URL` in `wrangler.toml` to:
   `https://<project_ref>.supabase.co/storage/v1/object/public/verse-outputs`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/projects` | Start a new deployment |
| `GET` | `/projects` | List all deployments |
| `GET` | `/projects/:slug` | Get deployment status |
| `GET` | `/health` | Health check (API + Redis status) |

### POST /projects

```json
{
  "gitURL": "https://github.com/owner/repo",
  "slug": "optional-custom-slug"
}
```

**Response:**
```json
{
  "status": "queued",
  "data": {
    "projectSlug": "brave-red-whale",
    "url": "https://verse-proxy.your-subdomain.workers.dev/brave-red-whale"
  }
}
```

## Limitations

- **One build at a time**: Render free tier has limited resources (0.1 CPU, 512 MB RAM), so concurrent builds are rejected
- **Cold starts**: Render free tier spins down after 15 minutes of inactivity — first request takes ~30-60 seconds
- **Ephemeral database**: SQLite runs on Render's ephemeral filesystem — deployment history resets on service restart (deployed sites on Supabase are unaffected)
- **Static sites only**: Only supports projects that output static files via `npm run build` (Vite, CRA, vanilla, etc.)
- **Public repos only**: Private GitHub repositories require authentication which is not supported
- **1 GB storage limit**: Supabase free tier provides 1 GB — sufficient for ~50-100 small project deployments

## License

MIT
