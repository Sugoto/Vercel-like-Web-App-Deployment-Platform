# Verse — Deploy Static Sites from GitHub

A Vercel-inspired deployment platform that takes a GitHub repository URL, builds it, and deploys the static output to Cloudflare's edge network — all on free-tier infrastructure with no credit card required.

## Architecture

```
┌──────────────┐  POST /projects   ┌─────────────────────────────┐
│    Client     │─────────────────▶│        API Server            │
│   (Next.js)   │◀────────────────│      Bun + Hono              │
│   on Vercel   │   WebSocket logs │  Builds in-process           │
└──────────────┘                   │       on Railway              │
                                   └──────────┬──────────────────┘
                                        deploy │   ▲▼ pub/sub
                                   ┌───────────▼──┐  ┌───────────┐
                                   │  Cloudflare   │  │  Upstash  │
                                   │    Pages      │  │   Redis   │
                                   │  (edge CDN)   │  └───────────┘
                                   └──────────────┘
                                          │
                                   ┌──────▼────────────┐
                                   │   Supabase DB      │
                                   │  (project metadata) │
                                   └───────────────────┘
```

**How it works:**

1. User pastes a public GitHub repo URL in the client and clicks **Deploy**
2. API server clones the repo, runs `bun install && bun run build`
3. Build output (`dist/`, `build/`, or `out/`) is deployed to Cloudflare Pages via the Direct Upload API
4. Build logs stream to the client in real-time via Redis pub/sub + WebSocket
5. Deployed site is served natively from Cloudflare's edge network at `{slug}.pages.dev`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js, React, TypeScript, Tailwind CSS, shadcn/ui |
| API Server | Bun, Hono, TypeScript |
| Database | Supabase (PostgreSQL) |
| Edge Hosting | Cloudflare Pages (Direct Upload API) |
| Pub/Sub | Upstash Redis |
| Hosting | Vercel (client), Railway (API) |

## Project Structure

```
├── api-server/          # Hono API + build logic + WebSocket
│   ├── src/
│   │   ├── index.ts           # Entry point
│   │   ├── config.ts          # Environment validation (zod)
│   │   ├── db/                # Supabase DB client
│   │   └── services/          # Build, storage (CF Pages), log services
│   ├── Dockerfile
│   └── .env.example
├── client/              # Next.js frontend
│   ├── app/
│   │   ├── page.tsx           # Deploy UI + log viewer
│   │   └── deployments/       # Deployment history page
│   ├── components/            # UI components
│   └── lib/                   # Types, utils
└── docker-compose.yml   # Local dev (Redis + API)
```

## Prerequisites

- [Bun](https://bun.sh/) 1.0+
- [Git](https://git-scm.com/)
- [Docker](https://www.docker.com/) (optional, for local Redis)

## External Services (All Free, No Credit Card)

| Service | What For | Sign Up |
|---------|----------|---------|
| [Cloudflare Pages](https://dash.cloudflare.com) | Edge hosting for deployed sites (unlimited bandwidth) | No credit card needed |
| [Supabase](https://supabase.com/dashboard) | PostgreSQL database for project metadata | No credit card needed |
| [Upstash](https://console.upstash.com) | Redis for real-time log streaming | No credit card needed |
| [Railway](https://railway.app) | Hosting the API server | No credit card needed |
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
# Fill in your Supabase, Upstash, and Cloudflare credentials
bun install
bun run dev
```

### 3. Set up the client

```bash
cd client
# Create .env.local with:
#   NEXT_PUBLIC_API_URL=http://localhost:9000
bun install
bun run dev
```

### 4. (Optional) Use Docker Compose for Redis

If you don't want to use Upstash during local dev, start a local Redis:

```bash
# From the project root
docker compose up redis -d
# Then set REDIS_URL=redis://localhost:6379 in api-server/.env
```

## Deployment

### API Server → Railway

1. Go to [railway.app](https://railway.app), create a new project
2. Connect your GitHub repo, set the **Root Directory** to `api-server`
3. **Build Command**: `bun install`
4. **Start Command**: `bun run start`
5. Add all environment variables from `api-server/.env.example`

### Client → Vercel

1. Go to [vercel.com](https://vercel.com), import your GitHub repo
2. Set the **Root Directory** to `client`
3. Add env variable: `NEXT_PUBLIC_API_URL` = your Railway service URL

### Cloudflare Pages Setup

1. Create a Cloudflare account at [dash.cloudflare.com](https://dash.cloudflare.com)
2. Note your **Account ID** from the dashboard sidebar
3. Create an API Token: My Profile → API Tokens → Create Token
   - Use the "Edit Cloudflare Pages" template
4. Add `CF_ACCOUNT_ID` and `CF_API_TOKEN` to your API server environment

Pages projects are created automatically when you deploy — no manual setup needed.

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
    "url": "https://brave-red-whale.pages.dev"
  }
}
```

## Limitations

- **One build at a time**: Builds run sequentially to keep resource usage predictable
- **Cold starts**: Railway free tier may spin down after inactivity — first request can take a few seconds
- **Static sites only**: Only supports projects that output static files via `bun run build` (Vite, CRA, vanilla, etc.)
- **Public repos only**: Private GitHub repositories require authentication which is not supported
- **500 deploys/month**: Cloudflare Pages free tier limit
- **25 MB max file size**: Individual files in the build output cannot exceed 25 MB

## License

MIT
