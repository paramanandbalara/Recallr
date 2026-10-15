# Deploying Recallr

The server and the website run as **one container**: the API on `/api`, the website on every other path. The desktop
app is built separately and talks to the same address.

## 1. Database (Amazon RDS for MySQL)

1. Create a MySQL 8 instance (db.t4g.micro is plenty to start). Turn on automated backups.
2. Create a database and a user:
   ```sql
   CREATE DATABASE recallr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'recallr'@'%' IDENTIFIED BY 'a-long-password';
   GRANT ALL ON recallr.* TO 'recallr'@'%';
   ```
3. Only let the app's security group reach port 3306.

`DATABASE_URL=mysql://recallr:a-long-password@<endpoint>:3306/recallr`

## 2. Server settings

Set these in the host's environment or secret store (never commit them):

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` (set by the image) |
| `DATABASE_URL` | from step 1 |
| `JWT_SECRET` | `openssl rand -hex 32`. Changing it signs everyone out. |
| `ENCRYPTION_KEY` | `openssl rand -hex 32`. Encrypts the keys saved in Admin → Settings: set it once and never change it. |
| `WEB_ORIGIN` | `https://your-domain.com` (comma-separated if more than one) |
| `ADMIN_EMAIL` | your email: registering with it makes you the admin |

AI keys, Razorpay keys, the webhook secret, offline payment details, the support email and download links are
**not** environment variables any more: after the first start, sign in as the admin and fill them in under
**Admin → Settings** (each key has a Test button). They're stored encrypted in the database.

## 3. Build and run

```bash
docker build -t recallr .
docker run -d -p 4000:4000 --env-file production.env --restart unless-stopped recallr
```

Migrations run automatically on start (`prisma migrate deploy`). A database created with the old migrations (before
`20261015000000_init`) won't upgrade: drop and recreate it (step 1) before the first start, which deletes its data.
The first time, add the example plans and the free trial (then change them in Admin → Plans):

```bash
docker exec <container> npm run db:seed:prod
```

Where to run it: AWS App Runner or ECS Fargate (point it at the image, port 4000, health check `/api/health`), or a
small EC2 / Lightsail instance with Docker behind Nginx or Caddy. Put HTTPS in front either way.
The health check is `GET /api/health`.

Without Docker: `cd server && npm ci && npm run build`, `cd web && npm ci && NODE_ENV=production npm run build`,
then start the server with `WEB_DIST=../web/dist npm run start:prod`.

Serve the website from the server like this (the Docker image already does). Then the server fills in each public
page before sending it: the interview question pages arrive with their title, description, content and structured
data in the HTML, so Google indexes them well. It also serves `/sitemap.xml` (every published question) and
`/robots.txt`. Set `PUBLIC_URL` to your real address (e.g. `https://recallr.app`), since the links in both use it,
and add the sitemap in Google Search Console once. A newly published question appears at once.

## 4. Razorpay

1. Razorpay needs these pages before it activates live payments, and they already exist on the site:
   `/terms`, `/privacy`, `/refunds`, `/contact`. **Read them and adjust them for your business first.**
2. Dashboard → Account & Settings → Webhooks → Add:
   - URL: `https://your-domain.com/api/billing/webhook`
   - Events: `payment.captured` and `order.paid`
   - Secret: any long random string → Admin → Settings → Razorpay → Webhook secret
3. Test with test keys first: a test payment should add the pack and show up under Admin → Payments.

## 5. Desktop app

```bash
cd desktop
printf 'VITE_API_URL=https://your-domain.com\nVITE_WEB_URL=https://your-domain.com\n' > .env
NODE_ENV=production npm run dist
```

Build the Windows installer on Windows and the macOS one on a Mac. Upload them (GitHub Releases, S3...) and paste the links
in Admin → Settings → Website. Unsigned builds show a SmartScreen / Gatekeeper warning; the guide tells users how
to get past it. Code-signing certificates remove it.

### Updates that install inside the app

1. Bump `version` in `desktop/package.json` and build with `npm run dist`. Next to the installers, `dist-installers/`
   now has `latest.yml` (Windows) and `latest-mac.yml` plus a `.zip` (macOS).
2. Upload all of them to one folder that is served over HTTPS (S3 + CloudFront, R2, any static host), e.g.
   `https://downloads.your-domain.com/recallr/`. Upload the installers first and the `.yml` files last.
3. In Admin → Settings → App versions set **Update files address** to that folder, **Latest app version** to the new
   version, and **What's new**.

Apps then show the update popup (never while listening). **Update** downloads it inside the app with a progress bar,
then **Restart now** installs it and opens the new version; **Later** installs it the next time the app quits. The
download is checked against the checksum in the `.yml` file. Without the address, Update opens the download link as before.

On macOS, in-app updates only work for builds signed with a Developer ID certificate (Apple's rule); unsigned Mac builds
fall back to "Open download page". The `publish` URL in `desktop/package.json` is only a placeholder: the app uses the
address from Admin → Settings.

## 6. After launch

- Register with `ADMIN_EMAIL`, then check Admin → Plans (prices and the free trial).
- Watch Admin → Dashboard for offline payments to approve.
- Database backups: RDS automated backups, plus a manual snapshot before big changes.
- Logs: the container writes to stdout (CloudWatch on App Runner / ECS).
