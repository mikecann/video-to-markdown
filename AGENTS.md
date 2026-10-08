# Video to Markdown - Agent Instructions

## Project Overview

A web app that converts YouTube URLs into markdown snippets with decorated thumbnails. Users paste a YouTube URL, and the app generates a markdown image link with a play-button overlay thumbnail hosted on Cloudflare R2. Thumbnails are periodically re-checked for changes via a scheduled monitoring system.

**Live site:** https://video-to-markdown.com/

## Package Manager

**Always use `bun`** — not npm, yarn, or pnpm.

- Install deps: `bun install`
- Add a dep: `bun add <package>`
- Add a dev dep: `bun add -d <package>`
- Remove a dep: `bun remove <package>`
- Run scripts: `bun run dev`, `bun run build`, etc.
- Update all deps: `bun update --latest`

The lockfile is `bun.lock` (not `package-lock.json`).

## Tech Stack

### Frontend
- **React 19** with TypeScript
- **Mantine v8** for UI components (dark theme, red primary color)
- **Mantine Notifications** for toast-style error messages
- **type-route** for URL-based routing (pagination uses `?page=N` query params)
- **Vite** for bundling

### Backend
- **Convex** for the database, serverless functions, and scheduling
- **fluent-convex** for defining Convex functions with a fluent builder API (see `convex/fluent.ts`)
- **Cloudflare R2** via `@convex-dev/r2` for thumbnail storage
- **Jimp** for image processing (adding play button overlays to thumbnails)

## Key Architecture

### Convex Functions (in `convex/`)
All Convex functions use the **fluent-convex** builder pattern, NOT the standard `query()`/`mutation()` imports from `_generated/server`. The builder is defined in `convex/fluent.ts`:

```ts
import { convex } from "./fluent";

// Public query
export const myQuery = convex.query().input({...}).handler(fn).public();

// Internal mutation
export const myMutation = convex.mutation().input({...}).handler(fn).internal();

// Public action
export const myAction = convex.action().input({...}).handler(fn).public();
```

### Thumbnail Monitoring
- When a video is added, an initial thumbnail check is scheduled for 24h later
- Checks use exponential backoff: 1d → 2d → 4d → 8d → 16d → 32d
- If a thumbnail changes, it resets to 1d interval and the new image overwrites the R2 object under the same key, so pasted URLs keep working
- Only rows shaped like `processVideoUrl`'s output, whose `thumbnailKey` no other row shares, are refreshed. Other rows are skipped and backed off (see `hasProcessedThumbnailShape` and `getVideoForCheck`)
- A daily cron (`convex/crons.ts`) runs `repairStaleSchedules` at 3:00 UTC as a safety net to reschedule any orphaned checks

### Routing
- `src/router.ts` defines routes using type-route
- Currently a single `home` route with an optional `page` query param
- Pagination is URL-driven: `/?page=0`, `/?page=1`, etc.
- `getVideos` only reads the newest rows up to the end of the requested page. The total for the page numbers comes from the single `videoStats` row, which `createVideo` increments and a daily cron (`recountVideos`, 3:30 UTC) recounts. Run `recountVideos` by hand after deleting rows in the dashboard.

## Deployment

The app deploys Convex functions and frontend together:

```bash
bun run build          # TypeScript check + Vite build
npx convex deploy -y   # Deploy functions to production
```

The production deployment is `quirky-squirrel-220.convex.cloud`.

## Git Conventions

- Branch names: always prefix with `mikec/` (e.g. `mikec/add-pagination`)
- Keep commits focused and descriptive

## File Structure

```
convex/           # Convex backend
  fluent.ts       # fluent-convex builder instance
  videos.ts       # Video CRUD + processing action
  thumbnailMonitor.ts  # Scheduled thumbnail checking
  crons.ts        # Daily crons (schedule repair, video recount)
  schema.ts       # Database schema
  utils.ts        # Shared utilities (oEmbed, image processing, hashing)
src/              # React frontend
  router.ts       # type-route router definition
  App.tsx          # Main app layout
  main.tsx         # Entry point with providers
  components/
    VideoForm.tsx   # URL input form
    VideoCard.tsx   # Individual video card with copy-to-clipboard
    VideosList.tsx  # Paginated grid of video cards
    GitHubCorner.tsx
    ConvexCorner.tsx
```
