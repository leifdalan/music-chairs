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

`scripts/smoke.sh` builds the app, serves it on port 3917 (or the port given as its argument) with a throwaway database, and checks creating a group, the invite and join pages, adding availability, proposing and confirming a rehearsal on the schedule page, not-found pages and that data survives a server restart.

To try the app from a phone on the same network, start the development server with `corepack pnpm run dev --host` and open the network URL it prints.

## Data

Groups and members are stored in a SQLite database through Node's built-in `node:sqlite` module, so there is no database service to install or run. By default the database is the file `data/music-chairs.sqlite`, relative to the directory the server starts in (this one, for every command above); it is created on first use and survives restarts. Set `MUSIC_CHAIRS_DB` to use a different file:

```sh
MUSIC_CHAIRS_DB=/tmp/music-chairs-demo.sqlite corepack pnpm run dev
```

Stop the server and delete `data/` to start over with an empty database. Until the first release the schema changes without migrations, so after pulling a change to it, delete `data/` before starting the server (the server refuses an older database and names the file to move or delete). Tests never touch it: each test file uses an in-memory database or a temporary file of its own.

## Layout

- `app/` — routes (`app/routes.ts`, `app/routes/`), the document shell and error page (`app/root.tsx`), styles (`app/app.css`) and shared modules (`app/lib/`, `app/components/`).
- `app/.server/` — server-only modules: the SQLite store and the cookie that remembers which member a device is.
- `tests/` — Vitest tests, which run headlessly in Node.
