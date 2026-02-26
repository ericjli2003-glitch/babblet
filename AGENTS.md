# Babblet

AI-powered presentation grading app built with Next.js 14.

## Cursor Cloud specific instructions

### Overview

Single Next.js 14 application (not a monorepo). No Docker, no database migrations, no devcontainer. Uses npm as the package manager (`package-lock.json`).

### Running the app

- `npm run dev` — starts the Next.js dev server on port 3000
- `npm run build` — production build
- `npm run lint` — ESLint via `next lint`

### Authentication

The app uses simple password authentication via the `APP_PASSWORD` environment variable. A `.env.local` file with `APP_PASSWORD=dev` is created during setup. Public pages (`/`, `/about`, `/contact`, `/login`) do not require auth. Authenticated pages redirect to `/login`.

### ESLint

The repo ships without an `.eslintrc.json`; running `next lint` for the first time prompts interactively. A `.eslintrc.json` with `"extends": "next/core-web-vitals"` must exist (created during setup). Lint produces warnings only (react-hooks/exhaustive-deps) — no errors.

### External services

Most features (AI grading, transcription, bulk processing) require external API keys (Anthropic, Deepgram, OpenAI, etc.) and Vercel KV. The app starts and serves its UI without these — API routes will return errors when called without valid keys, but the dev server and all pages load fine.

### Gotchas

- Node.js 18+ required (v22 works).
- `sharp` (image processing) is a native dependency — `npm install` handles it, but if `node_modules` is corrupted, a clean `rm -rf node_modules && npm install` fixes it.
- The `.env.local` file is gitignored and must exist locally for auth to work during development.
