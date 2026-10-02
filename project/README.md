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

## Layout

- `app/` — routes (`app/routes.ts`), the document shell (`app/root.tsx`) and modules.
- `tests/` — Vitest tests, which run headlessly in Node.
