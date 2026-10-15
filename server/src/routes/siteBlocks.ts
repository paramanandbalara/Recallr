import { Router } from 'express';
import { ZodError } from 'zod';
import { audit } from '../audit.js';
import { requireAdmin, requireUser } from '../auth.js';
import { HttpError, route } from '../http.js';
import { clearPageCache } from '../seo.js';
import { BLOCK_DEFAULTS, blocksForAdmin, isBlockKey, publicBlocks, resetBlock, saveBlock, type BlockKey } from '../siteBlocks.js';

// Website content: GET /api/site/blocks for everyone, and Admin → Website content to edit it

export const publicSiteBlockRoutes = Router();

publicSiteBlockRoutes.get('/blocks', route(async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ blocks: await publicBlocks() });
}));

export const adminSiteBlockRoutes = Router();
adminSiteBlockRoutes.use('/site-blocks', requireUser, requireAdmin);

const keyOf = (key: string): BlockKey => {
  if (!isBlockKey(key)) throw new HttpError(404, 'There’s no such block of website content.');
  return key;
};

// "items.2.q: A question can’t be empty." → "Item 3: A question can’t be empty."
const readable = (error: ZodError) => {
  const issue = error.issues[0];
  const index = issue?.path.find((p): p is number => typeof p === 'number');
  return `${index !== undefined ? `Item ${index + 1}: ` : ''}${issue?.message ?? 'Check the fields.'}`;
};

adminSiteBlockRoutes.get('/site-blocks', route(async (_req, res) => {
  res.json({ blocks: await blocksForAdmin() });
}));

adminSiteBlockRoutes.get('/site-blocks/:key', route(async (req, res) => {
  const key = keyOf(req.params.key);
  const block = (await blocksForAdmin()).find(b => b.key === key)!;
  res.json({ block });
}));

adminSiteBlockRoutes.put('/site-blocks/:key', route(async (req, res) => {
  const key = keyOf(req.params.key);
  let data;
  try {
    data = await saveBlock(key, req.body?.data);
  } catch (error) {
    if (error instanceof ZodError) throw new HttpError(400, readable(error));
    throw error;
  }
  clearPageCache(); // The home page's search title and description come from the hero
  await audit(req, 'site_block.update', key);
  res.json({ block: { key, data, defaults: BLOCK_DEFAULTS[key], custom: true, updatedAt: new Date() } });
}));

// Back to the default text
adminSiteBlockRoutes.delete('/site-blocks/:key', route(async (req, res) => {
  const key = keyOf(req.params.key);
  const data = await resetBlock(key);
  clearPageCache();
  await audit(req, 'site_block.reset', key);
  res.json({ block: { key, data, defaults: data, custom: false, updatedAt: null } });
}));
