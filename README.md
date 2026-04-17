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

See `.env.example`.
