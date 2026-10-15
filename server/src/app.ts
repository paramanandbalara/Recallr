import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createAiFromSettings, type AiGateway } from './ai.js';
import { env } from './env.js';
import { errorHandler } from './http.js';
import { readCompanySite } from './research.js';
import { renderPage, robots, sitemap } from './seo.js';
import { razorpayFromSettings, type RazorpayGateway } from './razorpay.js';
import { adminRoutes } from './routes/admin.js';
import { adminExtraRoutes } from './routes/adminExtra.js';
import { aiRoutes } from './routes/ai.js';
import { careerRoutes } from './routes/career.js';
import { authRoutes } from './routes/auth.js';
import { billingRoutes } from './routes/billing.js';
import { adminInvoiceRoutes, invoiceRoutes } from './routes/invoices.js';
import { planRoutes } from './routes/plans.js';
import { siteRoutes } from './routes/site.js';
import { adminSiteBlockRoutes, publicSiteBlockRoutes } from './routes/siteBlocks.js';
import { adminAmbassadorRoutes, ambassadorRoutes } from './routes/ambassadors.js';
import { backupRoutes } from './routes/backup.js';
import { adminProfileRoutes, profileRoutes } from './routes/profiles.js';
import { contentRoutes } from './routes/content.js';
import { referralRoutes } from './routes/referrals.js';
import { supportRoutes } from './routes/support.js';
import { adminOrganizationRoutes, organizationPublicRoutes, organizationRoutes } from './routes/organizations.js';
import { practiceRoutes } from './routes/practice.js';
import { peerRoutes } from './routes/peer.js';
import { dailyRoutes } from './routes/daily.js';
import { adminWhatsAppRoutes, whatsappRoutes } from './routes/whatsapp.js';
import { salaryPracticeRoutes } from './routes/salaryPractice.js';
import { interviewRoutes } from './routes/interviews.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { adminQuestionRoutes, publicQuestionRoutes, questionRoutes } from './routes/questions.js';
import { adminBlogRoutes, publicBlogRoutes } from './routes/blog.js';
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
  app.use('/api/site', publicSiteBlockRoutes);
  app.use('/api/ambassadors', ambassadorRoutes);
  app.use('/api/admin', adminSiteBlockRoutes, adminAmbassadorRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/admin', adminInvoiceRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/api/admin', adminExtraRoutes);
  app.use('/api/admin', adminQuestionRoutes(ai));
  app.use('/api/admin', adminBlogRoutes(ai));
  app.use('/api/admin', adminOrganizationRoutes);
  app.use('/api/ai', aiRoutes(ai, deps.readSite));
  app.use('/api/career', careerRoutes(ai));
  app.use('/api', contentRoutes);
  app.use('/api/backup', backupRoutes);
  app.use('/api/profiles', profileRoutes);
  app.use('/api/admin', adminProfileRoutes);
  app.use('/api/support', supportRoutes);
  app.use('/api/referrals', referralRoutes);
  app.use('/api/questions', questionRoutes);
  app.use('/api/public/questions', publicQuestionRoutes);
  app.use('/api/public/blog', publicBlogRoutes);
  app.use('/api/practice/salary', salaryPracticeRoutes); // Before /api/practice
  app.use('/api/practice', practiceRoutes);
  app.use('/api/peer', peerRoutes(ai));
  app.use('/api/daily', dailyRoutes(ai));
  app.use('/api/whatsapp', whatsappRoutes);
  app.use('/api/admin', adminWhatsAppRoutes);
  app.use('/api/interviews', interviewRoutes);
  app.use('/api/me', dashboardRoutes);
  app.use('/api', organizationPublicRoutes); // Before the signed-in routes: invite links work signed out
  app.use('/api/organizations', organizationRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  // The website: files as they are, and index.html for its own pages (/account, /admin...)
  if (env.WEB_DIST && fs.existsSync(env.WEB_DIST)) {
    const root = path.resolve(env.WEB_DIST);
    const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    app.get('/robots.txt', (_req, res) => res.type('text/plain').send(robots()));
    app.get('/sitemap.xml', async (_req, res, next) => {
      try { res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(await sitemap()); } catch (error) { next(error); }
    });
    app.use(express.static(root, { maxAge: '1h', index: false }));
    // Public pages come with their title, description and content already filled in, for search engines
    app.get('*', async (req, res) => {
      const html = await renderPage(indexHtml, req.path).catch(() => null);
      res.set('Cache-Control', 'no-cache');
      if (html) return res.type('html').send(html);
      // Not a page the server knows: the website shows its own page (or "not found")
      res.status(/^\/(interview-questions|blog)(\/|$)/.test(req.path) ? 404 : 200).type('html').send(indexHtml);
    });
  }

  app.use(errorHandler);
  return app;
};
