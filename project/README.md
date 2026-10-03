# music-chairs

A web app that helps small music ensembles find times to rehearse together in person.

Built with React Router 8 in framework mode (server rendering, loaders and actions on React Router's own server), TypeScript and Vite.

## Requirements

- Node.js with `corepack` available, used only to launch the pnpm version pinned in `package.json`.
- pnpm installs the Node runtime the app runs on (pinned in `package.json` under `devEngines.runtime`), so the system Node version does not matter.

## Commands

Run each from this directory.

```sh
corepack pnpm install --frozen-lockfile
```

```sh
corepack pnpm run dev
```

```sh
corepack pnpm run test
```

```sh
corepack pnpm run typecheck
```

```sh
corepack pnpm run lint
```

```sh
corepack pnpm run build
```

```sh
corepack pnpm run preview
```

`dev` starts the development server; `preview` serves the production build from `build/`.

```sh
scripts/smoke.sh
```

`scripts/smoke.sh` builds the app, serves it on port 3917 (or the port given as its argument) with a throwaway database, and checks creating a group, the invite and join pages, adding availability, proposing, confirming and answering (RSVP) a rehearsal on the schedule page, not-found pages and that data survives a server restart.

To try the app from a phone on the same network, start the development server with `corepack pnpm run dev --host` and open the network URL it prints.

## Google sign-in

Members can sign in with Google besides joining by name. Sign-in is offered only when both `MUSIC_CHAIRS_GOOGLE_CLIENT_ID` and `MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET` are set; otherwise the buttons are hidden and `/auth/google` answers 503. To try it locally, set both in your shell before `corepack pnpm run dev` and open `http://localhost:5173` (the OAuth client lists `http://localhost:5173/auth/google/callback` as a redirect URI). Never commit the secret. The tests fake Google and need neither.

## Google Calendar and the calendar feed

A signed-in member linked in a group can import free time from their primary Google Calendar (**My availability → Import from Google Calendar**: the next four weeks, reviewed before saving) and turn on **Add rehearsals to my Google Calendar** on the Schedule page, which keeps one event per upcoming confirmed date in their primary calendar (dates they answered No and cancelled dates are left off). Each permission is asked for only when used; the app is unverified, so Google shows an "unverified app" warning first. Every member, signed in or not, also gets a private **calendar feed** link (`/calendar/<token>.ics`) on the Schedule page that any calendar app can subscribe to. Turning writing off removes the upcoming events the app added; the Google permission itself stays until the member removes it at myaccount.google.com → Security → Third-party apps (see `deploy/README.md`). Locally these need the same two environment variables as sign-in; the tests fake Google.

## Production

The app runs at https://rehearse.dalan.dev. Deploying, backups and restoring are described in [`deploy/README.md`](deploy/README.md).

## Data

Groups and members are stored in a SQLite database through Node's built-in `node:sqlite` module, so there is no database service to install or run. By default the database is the file `data/music-chairs.sqlite`, relative to the directory the server starts in (this one, for every command above); it is created on first use and survives restarts. Set `MUSIC_CHAIRS_DB` to use a different file:

```sh
MUSIC_CHAIRS_DB=/tmp/music-chairs-demo.sqlite corepack pnpm run dev
```

Stop the server and delete `data/` to start over with an empty database. Until the first release the schema changes without migrations. When the development server (`corepack pnpm run dev`) meets a database created by an earlier version, it renames that file (and its `-wal`/`-shm` files) to `music-chairs.sqlite.stale-<timestamp>` and starts a fresh one, logging where the old data went; nothing is deleted. `preview` and `start` run in production mode and refuse such a database instead, naming the file to move or delete. Tests never touch it: each test file uses an in-memory database or a temporary file of its own.

## Layout

- `app/` — routes (`app/routes.ts`, `app/routes/`), the document shell and error page (`app/root.tsx`), styles (`app/app.css`) and shared modules (`app/lib/`, `app/components/`).
- `app/.server/` — server-only modules: the SQLite store and the cookie that remembers which member a device is.
- `tests/` — Vitest tests, which run headlessly in Node.
