<div align="center">
  <img src="desktop/public/icon.png" alt="Recallr Logo" width="120" />
  <h1>Recallr 💬</h1>
  <p><strong>Your AI interview assistant, from prep to follow-up</strong></p>
</div>

Recallr is a desktop app that listens to a job interview and suggests answers built from the candidate's own resume,
job description and prepared answers. Users create an account on the website, get a free trial, buy plans
(Razorpay or offline UPI/bank), and sign in to the desktop app. The AI keys stay on the server, which counts every
user's listening time and AI tokens against their plan.

<p align="center">
  <img src="docs/media/demo-listen.gif" alt="Recallr hears the interviewer's question and streams an answer built from the resume" width="300" />
  <img src="docs/media/demo-screen.gif" alt="Recallr reads a coding question from the screen and answers it with code" width="300" />
</p>

The website's product clips and screenshots (`web/public/media`) are the real desktop app with a scripted example
interview; the GIF above is the same clip.

## Repository layout

```text
.
├── desktop/   Electron app (React + Vite): the interview assistant window
├── web/       Website (React + Vite): landing page, pricing, guide, user account, admin panel
├── server/    API (Express + Prisma + MySQL): accounts, plans, payments, AI proxy with usage limits
├── docs/      Deployment and admin guides
├── Dockerfile           One image: the API serving the built website
└── docker-compose.yml   MySQL + that image, for a one-machine setup
```

Each app has its own `package.json`, lockfile and `.env.example`, and installs separately (no workspaces: electron-builder
packages the desktop app from its own `node_modules`). The root `package.json` only has shortcuts.

```text
 desktop app ──┐                     ┌──> Groq / OpenAI (server's keys)
               ├──> server /api ─────┤
 website ──────┘    (JWT sign-in)    └──> MySQL (users, plans, payments, usage)
                                          Razorpay (orders, signature checks, webhook)
```

## How access works

| Step | What happens |
|------|--------------|
| Sign up (website) | Account created. If a plan is marked **free trial** (Admin → Plans), it's given once, straight away. |
| Sign in (desktop) | Same email and password. The app opens only with an **active plan** (trial or paid). |
| Use | Every answer and transcription goes through `/api/ai/*`. Tokens and audio seconds are taken from the pack that ends first. When one runs out the server answers `402` and the app asks the user to buy more. |
| Buy online | Razorpay Checkout → `/billing/verify` checks the signature → pack added. The webhook does the same if the browser closed. |
| Buy offline | User pays by UPI/bank and enters the reference → **Admin → Payments → Approve** → pack added. |
| Block | Admin → Users → Block: every request is refused from then on, including the desktop app's. |

Plans are packs (price, days, listening minutes, AI tokens; empty = unlimited). Packs stack, and editing a plan never
changes packs already sold. The desktop app checks the plan again every 10 minutes and whenever the server says it ran out.

## Local development

You need Node 20 (`.nvmrc`) and MySQL 8.

```bash
npm run install:all

# Server: settings, database, example plans and the free trial
cp server/.env.example server/.env        # set DATABASE_URL, JWT_SECRET (openssl rand -hex 32), ADMIN_EMAIL, GROQ_API_KEY...
npm run db:migrate
npm run db:seed

# In three terminals
npm run dev:server     # http://localhost:4000
npm run dev:web        # http://localhost:5174 (proxies /api to the server)
npm run dev:desktop    # Electron window, talking to http://localhost:4000
```

**Database naming:** tables and columns are snake_case in MySQL (`users.created_at`) and camelCase in code
(`user.createdAt`); `server/prisma/schema.prisma` maps them with `@map` / `@@map`. Every table has `created_at` and
`updated_at`. A database made before the migrations were replaced by `20261015000000_init` has to be rebuilt, which
deletes its data: in `server/`, run `npx prisma migrate reset`.

Register on the website with the `ADMIN_EMAIL` address to become the admin (the **Admin** link appears in the header), then add the AI keys under **Admin → Settings**.
Razorpay test keys (`rzp_test_...`) let you try online payments without real money.

> If your shell sets `NODE_ENV=development`, Vite makes development builds. Build releases with `NODE_ENV=production`.

## Tests

```bash
npm test               # server (needs a MySQL test database, see server/vitest.config.ts) and desktop
npm run typecheck      # all three apps
npm run lint           # desktop
```

The server tests rebuild their own database (`TEST_DATABASE_URL`, default `mysql://root:root@127.0.0.1:3306/recallr_test`)
and use fake AI and Razorpay gateways. CI (`.github/workflows/ci.yml`) runs all of it on every push.

## Configuration

| App | File | Main settings |
|-----|------|---------------|
| server | `server/.env` | `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `WEB_ORIGIN`, `ADMIN_EMAIL`, `WEB_DIST` |
| server | **Admin → Settings** (database) | Groq / OpenAI keys and provider order, Razorpay keys and webhook secret, offline payment details, business name, support email, download links. Secrets are encrypted with `ENCRYPTION_KEY` (AES-256-GCM); changes apply without a restart. The matching `.env` variables are only used until a value is saved there. |
| web | `web/.env` (build time) | `VITE_API_URL` (only if the API is on another domain) |
| desktop | `desktop/.env` (build time) | `VITE_API_URL`, `VITE_WEB_URL` (built into the installer) |

## Releasing

- **Server + website:** see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (Docker image, Amazon RDS, Razorpay webhook).
- **Desktop app:** see [Releasing the desktop app](#releasing-the-desktop-app) below.
- **Running it day to day:** see [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md).

## Releasing the desktop app

You need two installers: **`.exe` for Windows** (built on Windows) and **`.dmg` for macOS** (built on a Mac; Apple's
tools only run there). The easiest way is to let GitHub build both for you.

### Option A: GitHub builds them (recommended)

1. One time, in GitHub → the repository → **Settings → Secrets and variables → Actions → Variables**, add
   `RECALLR_API_URL` and `RECALLR_WEB_URL` (your live address, e.g. `https://recallr.app`; they're built into the app).
2. Raise the version in `desktop/package.json` (e.g. `1.2.0`), commit, then tag and push:
   ```bash
   git tag v1.2.0 && git push origin v1.2.0
   ```
   (Or **Actions → Desktop release → Run workflow** without a tag.)
3. About 15 minutes later, **Releases** has a draft with the files. To have them uploaded to S3 as well, add the
   variable `S3_DOWNLOADS_PATH` (e.g. `my-bucket/recallr`) and the secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
   `AWS_REGION`. See `.github/workflows/desktop-release.yml`.

### Option B: build on your own computers

```bash
cd desktop
npm ci
printf 'VITE_API_URL=https://recallr.app\nVITE_WEB_URL=https://recallr.app\n' > .env   # your live address
NODE_ENV=production npm run dist:win    # on Windows → dist-installers/Recallr-Setup-1.2.0.exe
NODE_ENV=production npm run dist:mac    # on a Mac   → dist-installers/Recallr-1.2.0-universal.dmg (Intel + Apple silicon)
```

Each build also makes `latest.yml` (Windows) or `latest-mac.yml` + a `.zip` (macOS): these are for updates inside
the app, so upload them too.

### Where to upload, and the links to give people

Use storage that serves files over HTTPS to anyone. Note that downloads from a **private** GitHub repository's
releases need a GitHub login, so they don't work as public links.

| Where | Cost | Your download links |
|-------|------|---------------------|
| **Amazon S3 + CloudFront** (good with the rest on AWS) | a few rupees per GB downloaded | `https://downloads.your-domain.com/recallr/Recallr-Setup.exe`, `.../Recallr.dmg` |
| **Cloudflare R2** with a public bucket or custom domain | free downloads (no egress fees) | `https://downloads.your-domain.com/recallr/Recallr-Setup.exe` |
| **GitHub Releases** (public repository only) | free | `https://github.com/<you>/<repo>/releases/latest/download/Recallr-Setup-1.2.0.exe` |

S3 step by step: create a bucket (e.g. `recallr-downloads`, region Mumbai `ap-south-1`) → upload into a folder
`recallr/` → put CloudFront in front of it with your domain (`downloads.your-domain.com`, certificate from ACM in
us-east-1) → the links are `https://downloads.your-domain.com/recallr/<file name>`. The workflow above also
uploads each installer as `Recallr-Setup.exe` and `Recallr.dmg`, names that never change, so your website's buttons
always give the newest version.

Then, in **Admin → Settings**:
- **Website → Windows download link / macOS download link:** the two links above (the website's Download page and
  the buttons use them).
- **App versions → Update files address:** the folder, e.g. `https://downloads.your-domain.com/recallr/`, so
  installed apps download and install updates themselves. **Latest app version:** the new version, e.g. `1.2.0`.

### Signing (removes the "unknown publisher" warnings)

Unsigned installers work, but Windows SmartScreen and macOS Gatekeeper warn first (the website's guide explains how to
open them). To remove the warnings:
- **macOS:** an Apple Developer account (99 USD a year). Export your *Developer ID Application* certificate as a
  `.p12` and add it as the secrets `CSC_LINK` (base64 of the file) and `CSC_KEY_PASSWORD`, plus `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` for notarization. Signed Mac builds are also needed for updates
  inside the app on macOS.
- **Windows:** a code-signing certificate (OV or EV) as `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`.

## Features of the app

**Before the interview:** profiles per application, an interview calendar (a prep pack offered the day before, the
right profile switched on just before it starts), prepared answers (imported, drafted from the resume, or predicted
from the job description), a story bank for behavioural questions, company notes (or research notes made from the
company's website), mock interviews with scored feedback, and a pre-interview check (plan, answer speed, microphone,
call audio, screen reading).

**During:** live answers streamed in natural spoken English, "Call + mic" mode, regenerate / shorter / longer / simpler /
more technical, key-points view, likely follow-ups, code answers, read the question from the screen, a see-through
overlay, and global shortcuts (⌃⌥ on macOS, Ctrl+Alt+Shift elsewhere: **L** listen, **A** ask, **R** regenerate,
**N** new conversation, **S** read from screen).

**After:** searchable history, an interview review with a thank-you email draft, and PDF / Markdown export.

**Also:** the app's menus and screens in English or Hindi, updates that download and install inside the app, and a
weekly email with practice progress and one tip. The website's interview question pages are pre-rendered by the
server (with a sitemap) so search engines index them.

Users' resumes, answers and history stay on their own computer; the server keeps accounts, payments and usage amounts only.

## License

Free for personal, non-commercial use. Selling it, or sharing or redistributing it (or its source code) without
permission, is not allowed. See `LICENSE` for the full terms.
