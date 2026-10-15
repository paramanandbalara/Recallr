import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createAiFromSettings, type AiGateway } from './ai.js';
import { env } from './env.js';
import { errorHandler } from './http.js';
import { readCompanySite } from './research.js';
import { razorpayFromSettings, type RazorpayGateway } from './razorpay.js';
import { adminRoutes } from './routes/admin.js';
import { adminExtraRoutes } from './routes/adminExtra.js';
import { aiRoutes } from './routes/ai.js';
import { authRoutes } from './routes/auth.js';
import { billingRoutes } from './routes/billing.js';
import { planRoutes } from './routes/plans.js';
import { siteRoutes } from './routes/site.js';
import { backupRoutes } from './routes/backup.js';
import { contentRoutes } from './routes/content.js';
import { referralRoutes } from './routes/referrals.js';
import { supportRoutes } from './routes/support.js';
import { adminOrganizationRoutes, organizationPublicRoutes, organizationRoutes } from './routes/organizations.js';
import { practiceRoutes } from './routes/practice.js';
import { adminQuestionRoutes, publicQuestionRoutes, questionRoutes } from './routes/questions.js';
import { getSettings } from './settings.js';

// AI and Razorpay use the keys in Admin → Settings; tests pass fakes instead
export const createApp = (deps: { ai?: AiGateway; razorpay?: RazorpayGateway | null; readSite?: typeof readCompanySite } = {}) => {
  const ai = deps.ai ?? createAiFromSettings(getSettings);
  const getRazorpay = deps.razorpay === undefined ? razorpayFromSettings(getSettings) : async () => deps.razorpay ?? null;

  const app = express();
  app.set('trust proxy', 1); // Behind a load balancer in production (for rate limiting by IP)
  app.disable('x-powered-by');
  // Razorpay Checkout loads its own script and frames, so the website's pages can't use a strict policy
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  // The website, and the desktop app: "null" once installed (file://), any localhost port in development
  const origins: (string | RegExp)[] = [...env.WEB_ORIGIN.split(',').map(o => o.trim()).filter(Boolean), 'null'];
  if (env.NODE_ENV !== 'production') origins.push(/^http:\/\/localhost:\d+$/);
  app.use(cors({ origin: origins }));
  // The webhook needs the raw body, so it's registered before the JSON parser
  app.use('/api/billing', billingRoutes(getRazorpay));
  app.use(express.json({ limit: '30mb' })); // Screenshots for "Read from screen" are large
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/plans', planRoutes);
  app.use('/api/site', siteRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/admin', adminExtraRoutes);
  app.use('/api/admin', adminQuestionRoutes(ai));
  app.use('/api/admin', adminOrganizationRoutes);
  app.use('/api/ai', aiRoutes(ai, deps.readSite));
  app.use('/api', contentRoutes);
  app.use('/api/backup', backupRoutes);
  app.use('/api/support', supportRoutes);
  app.use('/api/referrals', referralRoutes);
  app.use('/api/questions', questionRoutes);
  app.use('/api/public/questions', publicQuestionRoutes);
  app.use('/api/practice', practiceRoutes);
  app.use('/api', organizationPublicRoutes); // Before the signed-in routes: invite links work signed out
  app.use('/api/organizations', organizationRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  // The website: files as they are, and index.html for its own pages (/account, /admin...)
  if (env.WEB_DIST && fs.existsSync(env.WEB_DIST)) {
    const root = path.resolve(env.WEB_DIST);
    app.use(express.static(root, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(root, 'index.html')));
  }

  app.use(errorHandler);
  return app;
};
