# AGENTS.md

## Cursor Cloud specific instructions

MarkdownMint is a pnpm workspace monorepo (`apps/*`, `packages/*`) that turns finished Markdown into deliverable PDF and standalone HTML. It has two runnable services and no database:

- `apps/web` — Nuxt 4 web UI (import → theme → configure → generate → result). Dev server on `http://localhost:3000`.
- `apps/renderer` — isolated Node HTTP service that compiles Markdown and renders PDF via Playwright Chromium. Dev server on `http://127.0.0.1:4310` (health at `/health`). The web app calls it via `NUXT_PUBLIC_RENDERER_URL` (default `http://127.0.0.1:4310`).

### Node version gotcha (important)

The VM's `/exec-daemon/node` (an older 22.x) is earlier on `PATH` than the nvm-installed Node `22.22.2` pinned by `.nvmrc`. Because `.npmrc` sets `engine-strict=true`, using the wrong Node breaks `pnpm install`. The setup adds a line to `~/.bashrc` that prepends `~/.nvm/versions/node/v22.22.2/bin` to `PATH`, so new login shells get the correct Node automatically. If you spawn a non-login shell and `node --version` is not `v22.22.2`, run `source ~/.bashrc` (or `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`).

### Running the two dev services

Run each in its own long-lived shell (e.g. a tmux session), not as one-off background commands:

- Renderer: `pnpm dev:renderer` (tsx watch; must be running for any PDF/HTML export to succeed).
- Web: `pnpm dev:web` (or `pnpm dev`).

Start the renderer before exercising the export flow; if it is down the UI shows "The renderer is not reachable."

### PDF rendering runtime dependencies

PDF export needs Playwright Chromium plus print fonts (`fonts-liberation`, `fonts-wqy-zenhei`). These are installed during environment setup, not by the startup update script. Chromium lives in `~/.cache/ms-playwright` (persisted in the snapshot). If PDF renders fail with a missing-browser error, reinstall with `pnpm --filter @markdown-mint/renderer exec playwright install --with-deps chromium`.

### Standard commands

Lint/test/build/dev commands are defined in the root `package.json` scripts (`lint`, `typecheck`, `test`, `test:coverage`, `build`, `dev`, `dev:web`, `dev:renderer`, `test:e2e:web`, `check`). `pnpm check` runs the full pre-submit gate (lint + typecheck + test + format:check). Renderer smoke scripts (`smoke:pdf`, `smoke:pressure`, etc.) live under `apps/renderer` and require a prior `pnpm --filter @markdown-mint/renderer... build`.
