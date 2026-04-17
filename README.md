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
| `npm run db:seed` | Seed sample scripts |
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

## Environment variables

See `.env.example`.
