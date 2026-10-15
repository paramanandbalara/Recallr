import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { db } from './db.js';
import { monthStart, shortName } from './leaderboard.js';
import { testOutbox } from './mailer.js';
import { clearPageCache, renderPage } from './seo.js';
import { clearSettingsCache } from './settings.js';
import { BLOCK_DEFAULTS, clearSiteBlocksCache } from './siteBlocks.js';

// Website content (Admin → Website content), college ambassadors and the referral leaderboard

const app = createApp({ razorpay: null });
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const settle = () => new Promise(resolve => setTimeout(resolve, 50));

const register = async (email: string, name = email.split('@')[0], ref?: string) => {
  const res = await request(app).post('/api/auth/register').send({ email, name, password: 'password123', ref });
  expect(res.status).toBe(201);
  return res.body.token as string;
};
const userId = async (token: string) => (await request(app).get('/api/auth/me').set(auth(token))).body.user.id as string;
const codeOf = async (token: string) => (await request(app).get('/api/referrals').set(auth(token))).body.code as string;

let admin: string;
let planId: string;

// A paid offline payment recorded by the admin (a friend's first real payment)
const pay = async (token: string) => {
  await request(app).post('/api/admin/payments/offline').set(auth(admin)).send({ userId: await userId(token), planId }).expect(201);
};

beforeEach(async () => {
  testOutbox.length = 0;
  await db.siteBlock.deleteMany();
  clearSiteBlocksCache();
  await db.ambassador.deleteMany();
  await db.setting.deleteMany();
  clearSettingsCache();
  await db.auditLog.deleteMany();
  await db.emailLog.deleteMany();
  await db.device.deleteMany();
  await db.trialClaim.deleteMany();
  await db.usageEvent.deleteMany();
  await db.invoice.deleteMany();
  await db.purchase.deleteMany();
  await db.payment.deleteMany();
  await db.coupon.deleteMany();
  await db.plan.deleteMany();
  await db.user.updateMany({ data: { referredById: null } });
  await db.user.deleteMany();
  admin = await register('admin@example.com');
  planId = (await request(app).post('/api/admin/plans').set(auth(admin)).send({ name: 'Pro', pricePaise: 49900, durationDays: 30, listeningMinutes: 300, tokenLimit: null }).expect(201)).body.plan.id;
});

describe('website content blocks', () => {
  it('serves the default text until the admin edits a block', async () => {
    const res = await request(app).get('/api/site/blocks').expect(200);
    expect(res.headers['cache-control']).toContain('max-age=60');
    expect(res.body.blocks.hero).toEqual(BLOCK_DEFAULTS.hero);
    expect(res.body.blocks.faq.items).toHaveLength(BLOCK_DEFAULTS.faq.items.length);
    expect(res.body.blocks.useCases.items.map((s: { title: string }) => s.title)).toEqual(BLOCK_DEFAULTS.useCases.items.map(s => s.title));
    expect(res.body.blocks.testimonials).toEqual({ title: 'What users say', items: [] });
    expect(res.body.blocks.announcement.enabled).toBe(false);
  });

  it('lets only admins edit, validates each block and keeps an audit log', async () => {
    const user = await register('user@example.com');
    const hero = { ...BLOCK_DEFAULTS.hero, headlineStart: 'Never freeze in', rotating: ['a placement round'] };
    expect((await request(app).put('/api/admin/site-blocks/hero').send({ data: hero })).status).toBe(401);
    expect((await request(app).put('/api/admin/site-blocks/hero').set(auth(user)).send({ data: hero })).status).toBe(403);
    expect((await request(app).get('/api/admin/site-blocks').set(auth(user))).status).toBe(403);

    const saved = await request(app).put('/api/admin/site-blocks/hero').set(auth(admin)).send({ data: hero }).expect(200);
    expect(saved.body.block).toMatchObject({ key: 'hero', custom: true, data: { headlineStart: 'Never freeze in' } });
    expect((await request(app).get('/api/site/blocks')).body.blocks.hero.rotating).toEqual(['a placement round']);
    expect(await db.auditLog.findFirst({ where: { action: 'site_block.update', target: 'hero' } })).not.toBeNull();

    // Wrong shapes are refused with a message the admin can act on
    const bad = async (key: string, data: unknown) => (await request(app).put(`/api/admin/site-blocks/${key}`).set(auth(admin)).send({ data }));
    expect((await bad('hero', { ...hero, rotating: [] })).body.error).toMatch(/at least 1/);
    const faq = await bad('faq', { items: [{ q: 'Fine?', a: 'Yes' }, { q: '', a: 'No question' }] });
    expect(faq.status).toBe(400);
    expect(faq.body.error).toBe('Item 2: A question can’t be empty.');
    expect((await bad('faq', { items: [{ q: 'x', a: 'y', extra: 1 }] })).status).toBe(400);
    expect((await bad('highlights', { items: [{ icon: 'not-an-icon', value: 'x', label: 'y' }] })).status).toBe(400);
    expect((await bad('announcement', { enabled: true, text: 'Hi', linkLabel: 'Go', linkUrl: 'javascript:alert(1)' })).status).toBe(400);
    expect((await bad('nope', {})).status).toBe(404);

    const list = (await request(app).get('/api/admin/site-blocks').set(auth(admin))).body.blocks;
    expect(list.find((b: { key: string }) => b.key === 'hero')).toMatchObject({ custom: true, defaults: BLOCK_DEFAULTS.hero });
    expect(list.find((b: { key: string }) => b.key === 'faq')).toMatchObject({ custom: false });

    // Reset to default
    await request(app).delete('/api/admin/site-blocks/hero').set(auth(admin)).expect(200);
    expect((await request(app).get('/api/site/blocks')).body.blocks.hero).toEqual(BLOCK_DEFAULTS.hero);
    expect(await db.auditLog.count({ where: { action: 'site_block.reset' } })).toBe(1);
  });

  it('shows a testimonial only once it is published with permission', async () => {
    const base = { name: 'Asha K', role: 'B.Tech, 2026', quote: 'The mock interviews helped.', photoUrl: '' };
    const publishedWithoutPermission = { title: 'What users say', items: [{ ...base, published: true, permission: false }] };
    const res = await request(app).put('/api/admin/site-blocks/testimonials').set(auth(admin)).send({ data: publishedWithoutPermission });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/permission/);

    await request(app).put('/api/admin/site-blocks/testimonials').set(auth(admin)).send({
      data: { title: 'What users say', items: [{ ...base, published: true, permission: true }, { ...base, name: 'Draft D', published: false, permission: true }] },
    }).expect(200);
    const shown = (await request(app).get('/api/site/blocks')).body.blocks.testimonials;
    expect(shown.items).toEqual([base]); // Only the published one, without the admin's flags
  });

  it('caches blocks for a minute, and a save on this server shows at once', async () => {
    await request(app).get('/api/site/blocks').expect(200); // Fills the cache
    await db.siteBlock.create({ data: { key: 'footer', data: JSON.stringify({ tagline: 'Written elsewhere' }) } });
    expect((await request(app).get('/api/site/blocks')).body.blocks.footer.tagline).toBe(BLOCK_DEFAULTS.footer.tagline);
    clearSiteBlocksCache();
    expect((await request(app).get('/api/site/blocks')).body.blocks.footer.tagline).toBe('Written elsewhere');

    await request(app).put('/api/admin/site-blocks/footer').set(auth(admin)).send({ data: { tagline: 'Saved here' } }).expect(200);
    expect((await request(app).get('/api/site/blocks')).body.blocks.footer.tagline).toBe('Saved here');

    // A stored block that no longer fits falls back to the default
    await db.siteBlock.update({ where: { key: 'footer' }, data: { data: '{"tagline": 5}' } });
    clearSiteBlocksCache();
    expect((await request(app).get('/api/site/blocks')).body.blocks.footer).toEqual(BLOCK_DEFAULTS.footer);
  });

  it('uses the hero’s search title and description for the home page', async () => {
    const index = '<html><head><title>x</title><meta name="description" content="d" /></head><body><div id="root"></div></body></html>';
    clearPageCache();
    expect(await renderPage(index, '/')).toContain(`<title>${BLOCK_DEFAULTS.hero.seoTitle}</title>`);
    await request(app).put('/api/admin/site-blocks/hero').set(auth(admin)).send({
      data: { ...BLOCK_DEFAULTS.hero, seoTitle: 'Recallr – placement help', seoDescription: 'Practise & get ready.' },
    }).expect(200);
    const html = await renderPage(index, '/');
    expect(html).toContain('<title>Recallr – placement help</title>');
    expect(html).toContain('<meta name="description" content="Practise &amp; get ready." />');
  });
});

describe('college ambassadors', () => {
  const application = { college: 'Govt Engineering College, Ajmer', city: 'Ajmer', course: 'B.Tech CSE, 3rd year', why: 'I run our coding club and help classmates prepare for placements.' };

  it('applies once, is approved by an admin and gets the bigger bonus on a friend’s first payment', async () => {
    await request(app).patch('/api/admin/settings').set(auth(admin)).send({ supportEmail: 'owner@recallr.test' }).expect(200);
    const student = await register('student@example.com', 'Meera Joshi');
    expect((await request(app).post('/api/ambassadors/apply').send(application)).status).toBe(401);
    expect((await request(app).post('/api/ambassadors/apply').set(auth(student)).send({ ...application, why: 'pls' })).status).toBe(400);
    const applied = await request(app).post('/api/ambassadors/apply').set(auth(student)).send(application).expect(201);
    expect(applied.body.ambassador).toMatchObject({ status: 'APPLIED', college: application.college });
    const again = await request(app).post('/api/ambassadors/apply').set(auth(student)).send(application);
    expect(again.status).toBe(409);
    expect(await db.ambassador.count()).toBe(1);
    await settle();
    expect(testOutbox.filter(e => e.kind === 'ambassador_admin').map(e => e.to)).toEqual(['owner@recallr.test']);

    // Only admins review
    const id = (await db.ambassador.findFirstOrThrow()).id;
    expect((await request(app).post(`/api/admin/ambassadors/${id}/approve`).set(auth(student))).status).toBe(403);
    const listed = (await request(app).get('/api/admin/ambassadors?status=APPLIED').set(auth(admin))).body;
    expect(listed.counts).toEqual({ APPLIED: 1, APPROVED: 0, REJECTED: 0 });
    expect(listed.ambassadors[0].user.email).toBe('student@example.com');

    await request(app).post(`/api/admin/ambassadors/${id}/approve`).set(auth(admin)).send({ note: 'Welcome aboard!' }).expect(200);
    expect((await request(app).get('/api/ambassadors/me').set(auth(student))).body.ambassador).toMatchObject({ status: 'APPROVED', note: 'Welcome aboard!' });
    await settle();
    const approvedEmail = testOutbox.find(e => e.kind === 'ambassador_approved')!;
    expect(approvedEmail.to).toBe('student@example.com');
    expect(approvedEmail.text).toContain('Welcome aboard!');
    expect(await db.auditLog.count({ where: { action: 'ambassador.approve' } })).toBe(1);

    const referrals = (await request(app).get('/api/referrals').set(auth(student))).body;
    expect(referrals.ambassador).toMatchObject({ status: 'APPROVED', bonusMinutes: 60 });

    // A friend joins with the ambassador's code and pays: 60 minutes for the ambassador, the usual 30 for the friend
    const friend = await register('friend@example.com', 'Kabir Rao', referrals.code);
    await pay(friend);
    const bonus = async (token: string) => db.purchase.findMany({ where: { userId: await userId(token), source: 'REFERRAL' } });
    expect((await bonus(student)).map(p => [p.planName, p.listeningMinutes])).toEqual([['Ambassador bonus', 60]]);
    expect((await bonus(friend)).map(p => [p.planName, p.listeningMinutes])).toEqual([['Referral bonus', 30]]);
    await settle();
    expect(testOutbox.filter(e => e.kind === 'ambassador_reward').map(e => e.to)).toEqual(['student@example.com']);
    expect(testOutbox.filter(e => e.kind === 'referral_reward').map(e => e.to)).toEqual(['friend@example.com']);

    // The admin sees it in the ambassador list and the referral stats
    const after = (await request(app).get('/api/admin/ambassadors').set(auth(admin))).body.ambassadors[0];
    expect(after).toMatchObject({ invited: 1, paidFriends: 1, paidFriendsThisMonth: 1 });
    const stats = (await request(app).get('/api/admin/referrals').set(auth(admin))).body;
    expect(stats.totals).toMatchObject({ invited: 1, paidFriends: 1, rewarded: 1, bonusPacks: 2, bonusMinutes: 90 });
    expect(stats.referrers[0]).toMatchObject({ email: 'student@example.com', ambassador: { status: 'APPROVED' } });
    expect((await request(app).get('/api/admin/referrals').set(auth(student))).status).toBe(403);
  });

  it('gives the usual bonus while the application waits, and rejecting sends one email', async () => {
    const student = await register('student@example.com', 'Meera Joshi');
    await request(app).post('/api/ambassadors/apply').set(auth(student)).send(application).expect(201);
    const friend = await register('friend@example.com', 'Kabir Rao', await codeOf(student));
    await pay(friend);
    const packs = await db.purchase.findMany({ where: { userId: await userId(student), source: 'REFERRAL' } });
    expect(packs.map(p => p.listeningMinutes)).toEqual([30]);

    const id = (await db.ambassador.findFirstOrThrow()).id;
    await request(app).post(`/api/admin/ambassadors/${id}/reject`).set(auth(admin)).send({ note: 'We already have one at your college.' }).expect(200);
    await request(app).post(`/api/admin/ambassadors/${id}/reject`).set(auth(admin)).send({ note: 'Edited note' }).expect(200);
    await settle();
    expect(testOutbox.filter(e => e.kind === 'ambassador_rejected')).toHaveLength(1);
    expect((await request(app).get('/api/ambassadors/me').set(auth(student))).body.ambassador).toMatchObject({ status: 'REJECTED', note: 'Edited note' });
  });

  it('tells the public page what ambassadors get', async () => {
    await request(app).patch('/api/admin/settings').set(auth(admin)).send({ ambassadorBonusMinutes: '90' }).expect(200);
    expect((await request(app).get('/api/ambassadors/program')).body).toEqual({ bonusMinutes: 90, friendMinutes: 30, days: 30 });
  });
});

describe('referral leaderboard', () => {
  it('ranks by friends who paid, shows only short names and highlights the user', async () => {
    const priya = await register('priya.sharma@example.com', 'Priya Sharma');
    const rahul = await register('rahul@example.com', 'Rahul Kumar Verma');
    const solo = await register('solo@example.com', 'Solo');
    const [priyaCode, rahulCode, soloCode] = [await codeOf(priya), await codeOf(rahul), await codeOf(solo)];

    // Priya: 2 paid this month, 1 joined without paying. Rahul: 1 this month, 2 last month. Solo: 1 last month.
    const friend = async (n: number, code: string, paid: 'now' | 'before' | 'no') => {
      const token = await register(`friend${n}@example.com`, `Friend ${n}`, code);
      if (paid === 'no') return;
      await pay(token);
      if (paid === 'before') {
        await db.payment.updateMany({ where: { userId: await userId(token) }, data: { paidAt: new Date(monthStart().getTime() - 24 * 60 * 60 * 1000) } });
      }
    };
    await friend(1, priyaCode, 'now');
    await friend(2, priyaCode, 'now');
    await friend(3, priyaCode, 'no');
    await friend(4, rahulCode, 'now');
    await friend(5, rahulCode, 'before');
    await friend(6, rahulCode, 'before');
    await friend(7, soloCode, 'before');

    const board = await request(app).get('/api/referrals/leaderboard').set(auth(rahul)).expect(200);
    const text = JSON.stringify(board.body);
    expect(text).not.toContain('@'); // No emails
    expect(text).not.toContain('Sharma');
    expect(text).not.toMatch(/userId|"id"/);

    expect(board.body.month.top).toEqual([
      { rank: 1, name: 'Priya S.', friends: 2, ambassador: false, you: false },
      { rank: 2, name: 'Rahul V.', friends: 1, ambassador: false, you: true },
    ]);
    expect(board.body.month.me).toEqual({ rank: 2, friends: 1 });
    expect(board.body.allTime.top.map((r: { name: string; friends: number; rank: number }) => [r.rank, r.name, r.friends])).toEqual([
      [1, 'Rahul V.', 3], [2, 'Priya S.', 2], [3, 'Solo', 1],
    ]);

    // Someone with no paying friends this month isn't ranked for the month
    const soloBoard = (await request(app).get('/api/referrals/leaderboard').set(auth(solo))).body;
    expect(soloBoard.month.me).toBeNull();
    expect(soloBoard.allTime.me).toEqual({ rank: 3, friends: 1 });

    // Closed or blocked accounts drop off
    await db.user.update({ where: { id: await userId(priya) }, data: { status: 'BLOCKED' } });
    const after = (await request(app).get('/api/referrals/leaderboard').set(auth(rahul))).body;
    expect(after.month.top.map((r: { name: string }) => r.name)).toEqual(['Rahul V.']);
    expect(after.month.me).toEqual({ rank: 1, friends: 1 });
  });

  it('shares ranks on equal counts and never shows more than a first name and initial', async () => {
    expect(shortName('Priya Sharma')).toBe('Priya S.');
    expect(shortName('  anil   kumar  ')).toBe('anil K.');
    expect(shortName('Madhu')).toBe('Madhu');
    expect(shortName('someone@example.com')).toBe('Recallr user');
    expect(shortName('')).toBe('Recallr user');

    const a = await register('a@example.com', 'Asha Rao');
    const b = await register('b@example.com', 'Bina Das');
    await pay(await register('f1@example.com', 'F One', await codeOf(a)));
    await pay(await register('f2@example.com', 'F Two', await codeOf(b)));
    const board = (await request(app).get('/api/referrals/leaderboard').set(auth(b))).body;
    expect(board.month.top.map((r: { rank: number }) => r.rank)).toEqual([1, 1]);
    expect(board.month.me).toEqual({ rank: 1, friends: 1 });
  });
});
