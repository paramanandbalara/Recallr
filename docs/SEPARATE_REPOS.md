# Moving to three repositories (github.com/RecallrX)

Recallr is three products that release on their own schedule, so each gets its own repository in the
[RecallrX](https://github.com/RecallrX) organization:

| Repository | Folder here | What it is | Deploys to |
|------------|-------------|------------|------------|
| `RecallrX/recallr-desktop` | `desktop/` | The Electron interview assistant (Windows `.exe`, macOS `.dmg`) | `https://downloads.recallr.in/recallr/` |
| `RecallrX/recallr-web` | `web/` | Website, user account and admin panel (React + Vite) | Built into the server image |
| `RecallrX/recallr-server` | `server/` | API: accounts, plans, payments, AI proxy (Express + Prisma + MySQL) | `https://recallr.in` (API on `/api`) |

Keep all three **private**. This repository can stay as the archive of the history before the split.

## 1. Create the empty repositories

As an owner of RecallrX: **New repository** → name from the table → Private → **no** README, licence or .gitignore
(they come from here). Do this three times.

## 2. Copy each folder with its history

`git subtree split` makes a branch with only that folder's commits, with the folder as the root:

```bash
git clone https://github.com/paramanandbalara/Recallr.git recallr-split && cd recallr-split
git checkout restructure/monorepo-apps

for app in desktop web server; do
  git subtree split --prefix="$app" -b "split-$app"
  git push "https://github.com/RecallrX/recallr-$app.git" "split-$app:main"
done
```

## 3. Files that live at the root here

Copy these into the new repositories (one commit each):

| File here | Goes to |
|-----------|---------|
| `.nvmrc`, `LICENSE`, `.gitignore` (the matching part) | all three |
| `docs/brand/` | all three (or only `recallr-web`, and link to it) |
| `.github/workflows/desktop-release.yml` | `recallr-desktop` (remove `working-directory: desktop`, `cd desktop` and the `desktop/` prefixes) |
| `.github/workflows/ci.yml` | split: the `server` job to `recallr-server`, the `web` job to `recallr-web`, the `desktop` job to `recallr-desktop`, without `working-directory` and the folder prefixes in cache paths |
| `docs/DEPLOYMENT.md`, `docs/ADMIN_GUIDE.md`, `Dockerfile`, `docker-compose.yml` | `recallr-server` |
| `README.md` | split: each repository gets the part about it |

The GitHub repository variables (`RECALLR_API_URL`, `RECALLR_WEB_URL` = `https://recallr.in`) and the AWS secrets
for uploads move to `recallr-desktop`.

## 4. One image from two repositories

The server serves the built website (and fills in public pages for Google), so the image still needs both. In
`recallr-server`, the Dockerfile takes the website from a second build context instead of a folder:

```dockerfile
FROM node:20-slim AS web
WORKDIR /app/web
COPY --from=webapp package*.json ./
RUN npm ci
COPY --from=webapp . ./
RUN NODE_ENV=production npm run build
```

and the server stage copies `package*.json`, `.` instead of `server/package*.json`, `server/`. Build with both
repositories checked out next to each other:

```bash
docker build --build-context webapp=../recallr-web -t recallr .
```

In `docker-compose.yml`: `build: { context: ., additional_contexts: { webapp: ../recallr-web } }`.
In a GitHub Actions deploy job of `recallr-server`, check out `RecallrX/recallr-web` into `web/` (with a token that
can read it) and pass `--build-context webapp=web`.

## 5. After the split

- Point Claude Code, CI and deploys at the new repositories.
- In this repository, add a line at the top of the README pointing to RecallrX and archive it
  (Settings → Archive), so nobody pushes here by mistake.
