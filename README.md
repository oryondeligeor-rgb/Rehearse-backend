# Rehearse Backend

REST API for the Rehearse app — script browsing, user auth, and saved scripts.

Built with: Node.js, Express 5, TypeScript, Prisma, SQLite (dev).

## Quick start

```bash
cp .env.example .env          # fill in secrets
npm install
npm run db:generate           # generate Prisma client
npm run db:migrate            # create DB + run migrations
npm run db:seed               # populate sample scripts
npm run dev                   # start dev server with hot-reload
```

Server starts on `http://localhost:3100` by default (or `PORT` from `.env`).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with tsx watch (hot-reload) |
| `npm run build` | Compile TypeScript → dist/ |
| `npm start` | Run compiled output |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run migrations (creates DB if needed) |
| `npm run db:seed` | Seed 50 verified public-domain scripts |
| `npm run db:reset` | Drop + recreate DB and re-run migrations |
| `npm run scripts:import-assets` | Upload plain-text assets to cloud storage (requires `STORAGE_*` env vars) |
| `npm run scripts:import-assets:dry-run` | Fetch + validate all Gutenberg texts without uploading |

## API

All routes are prefixed with `/api`.

### Auth

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password }` | `{ accessToken, refreshToken }` |
| POST | `/api/auth/login` | `{ email, password }` | `{ accessToken, refreshToken }` |
| POST | `/api/auth/refresh` | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| POST | `/api/auth/forgot-password` | `{ email }` | `{ message }` |
| POST | `/api/auth/reset-password` | `{ token, password }` | `{ message }` |

### Scripts

| Method | Path | Auth | Query params | Response |
|---|---|---|---|---|
| GET | `/api/scripts` | Optional | `q, genre, length, era, cursor, limit` | `{ data: Script[], nextCursor }` |
| GET | `/api/scripts/trending` | Optional | — | `{ data: Script[] }` |

### User

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| PATCH | `/api/user/saved-scripts/:id` | Required | `{ saved: boolean }` | `{ saved }` |

## Seed data

The database is seeded with **50 verified public-domain stage plays** sourced
exclusively from [Project Gutenberg](https://www.gutenberg.org/). All works
were written by long-deceased authors and published before 1928, making them
safely public domain in the United States.

Authors include Shakespeare, Ibsen, Wilde, Shaw, Chekhov, Synge, Goldsmith,
Sheridan, and Marlowe.

Provenance metadata (source URL per Gutenberg ebook and a verification note)
is stored in every `Script` row via the `sourceName`, `sourceUrl`, and
`verificationNote` fields, and the full vetted JSON is checked in at
`prisma/public_domain_scripts_provenance.json`.

**Approximation caveats**

- `pageCount` is estimated from Gutenberg plain-text word count at ~275 words/page.
- `sceneCount` is counted from explicit scene headings where present; otherwise
  from act headings; otherwise defaults to 1 for one-act or heading-free texts.
- `durationLabel` uses the industry rule of thumb of ~1 min/page for stage performance.
- `thumbnailUrl`, `description`, `previewText`, `sceneId`, and `sceneTitle` are
  deterministic fallbacks generated at seed time — they are not sourced from
  Gutenberg content.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | `file:./dev.db` | Prisma database URL |
| `JWT_ACCESS_SECRET` | yes | — | Secret for signing access tokens |
| `JWT_REFRESH_SECRET` | yes | — | Secret for signing refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` | no | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | no | `30d` | Refresh token lifetime |
| `PORT` | no | `3100` | HTTP port |
| `OPENAI_API_KEY` | for AI extraction | — | OpenAI API key used for character + scene-title extraction |
| `OPENAI_SCRIPT_EXTRACTION_MODEL` | no | `gpt-4o-mini` | Model used for task-80 script extraction |
| `STORAGE_BUCKET` | for upload | — | S3-compatible bucket name |
| `STORAGE_REGION` | for upload | `auto` | Bucket region (`auto` works for Cloudflare R2) |
| `STORAGE_ACCESS_KEY_ID` | for upload | — | S3 access key ID |
| `STORAGE_SECRET_ACCESS_KEY` | for upload | — | S3 secret access key |
| `STORAGE_ENDPOINT` | no | — | Custom S3 endpoint (R2, B2, MinIO). Omit for native AWS S3. |
| `STORAGE_PUBLIC_BASE_URL` | no | — | CDN or custom domain prefix for public asset URLs |

See `.env.example` for provider-specific examples (Cloudflare R2, Backblaze B2, MinIO).

## AI extraction pipeline (task 80)

The backend now includes an `ai-extraction` library that takes the parsed script
output from task 79 and asks OpenAI to produce:

- a deduplicated list of speaking characters
- a scene list with 2 to 5 word titles
- chunk-aware extraction for scripts larger than ~50k tokens, using overlapping context windows

Current implementation lives under:

- `src/lib/ai-extraction/index.ts`
- `src/lib/ai-extraction/serializer.ts`
- `src/lib/ai-extraction/types.ts`

This is the reusable extraction layer. Later upload tasks still need to wire it
into the actual upload/import route flow.

## Cloud asset pipeline (task 70)

Each pre-loaded script has seven asset metadata fields on the `Script` model:

| Field | Description |
|---|---|
| `assetUrl` | Full public URL of the stored plain-text file |
| `assetObjectKey` | Bucket key, e.g. `scripts/gutenberg-1513.txt` |
| `assetFormat` | `"plain-text"` |
| `assetMimeType` | `"text/plain; charset=utf-8"` |
| `assetByteSize` | Byte size of uploaded content |
| `assetSourceUrl` | Gutenberg cache URL used for download |
| `assetValidatedAt` | Timestamp of last successful validate + upload |

### Running the pipeline

```bash
# 1. Validate content without uploading (works with no cloud credentials)
npm run scripts:import-assets:dry-run

# 2. Live upload (requires STORAGE_* vars in .env)
npm run scripts:import-assets

# 3. Re-process scripts that were already uploaded
npx tsx scripts/import-assets.ts --force
```

The script fetches each play's plain text from `https://www.gutenberg.org/cache/epub/<id>/pg<id>.txt`,
validates that the response is non-empty plain text (≥ 500 bytes, not HTML),
then uploads to `scripts/gutenberg-<id>.txt` in the configured bucket.

### Remaining blocker

Cloud uploads require provider credentials. Until `STORAGE_BUCKET`,
`STORAGE_ACCESS_KEY_ID`, and `STORAGE_SECRET_ACCESS_KEY` are set in `.env`,
running without `--dry-run` exits with a clear error listing the missing vars.
