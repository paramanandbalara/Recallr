import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AiGateway } from './ai.js';
import { createApp } from './app.js';
import { companySlug, displayCompany, MIN_COMPANY_USERS, normalizeCompany } from './companies.js';
import { db } from './db.js';
import { clearSettingsCache } from './settings.js';
import { clearPageCache, renderPage, sitemap } from './seo.js';

// Company question packs and the salary negotiation practice reports

const ai: AiGateway = {
  streamChat: async (_req, onText) => {
    onText('ok', 'groq');
    return { text: 'ok', provider: 'groq', model: 'test-model', inputTokens: 10, outputTokens: 10 };
  },
  transcribe: async () => ({ text: '', provider: 'groq', model: 'whisper-test' }),
};
const app = createApp({ ai, razorpay: null });

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const register = async (email: string) => {
  const res = await request(app).post('/api/auth/register').send({ email, name: email.split('@')[0], password: 'password123' });
  expect(res.status).toBe(201);
  return res.body.token as string;
};
// The question bank only takes questions from the desktop app
const appToken = async (email: string) => {
  await register(email);
  const res = await request(app).post('/api/auth/login').send({
    email, password: 'password123', device: { fingerprint: `${email}-computer-fingerprint`, name: 'PC', platform: 'win32', appVersion: '1.0.0' },
  });
  expect(res.status).toBe(200);
  return res.body.token as string;
};
const record = (token: string, items: object[]) => request(app).post('/api/questions/record').set(auth(token)).send({ items }).expect(200);

const INDEX = '<html><head><title>Recallr</title><meta name="description" content="x" /></head><body><div id="root"></div></body></html>';

beforeEach(async () => {
  await db.question.deleteMany();
  await db.setting.deleteMany();
  clearSettingsCache();
  clearPageCache();
  await db.device.deleteMany();
  await db.trialClaim.deleteMany();
  await db.usageEvent.deleteMany();
  await db.purchase.deleteMany();
  await db.user.updateMany({ data: { referredById: null } });
  await db.user.deleteMany(); // Their saved answers and career reports go with them
});

describe('company names', () => {
  it('treats case, punctuation and suffixes as the same company', () => {
    expect(normalizeCompany('Infosys Ltd.')).toBe('infosys');
    expect(normalizeCompany('INFOSYS LIMITED')).toBe('infosys');
    expect(normalizeCompany('Tata Consultancy Services Pvt. Ltd.')).toBe('tata consultancy services');
    expect(normalizeCompany('Zoho Technologies Private Limited')).toBe('zoho');
    expect(normalizeCompany('Amazon.com, Inc.')).toBe('amazon');
    expect(normalizeCompany('The Walt Disney Company')).toBe('walt disney');
    expect(normalizeCompany('Johnson & Johnson')).toBe('johnson and johnson');
    expect(normalizeCompany('Tech')).toBe('tech'); // Never empties a real name
    expect(normalizeCompany('  ')).toBe('');
    expect(companySlug(normalizeCompany('Tata Consultancy Services'))).toBe('tata-consultancy-services');
    expect(normalizeCompany('tata-consultancy-services')).toBe('tata consultancy services'); // The page address finds it too
    expect(displayCompany(' Infosys  Limited. ')).toBe('Infosys');
    expect(displayCompany('Amazon.com, Inc.')).toBe('Amazon.com');
  });
});

describe('company question packs', () => {
  // Users who were each asked questions at a company (written their own way)
  const askedAt = async (spellings: string[], questions: (i: number) => object[], first = 0) => {
    const tokens: string[] = [];
    for (const [i, company] of spellings.entries()) {
      const token = await appToken(`candidate${first + i}@example.com`);
      await record(token, questions(i).map(q => ({ ...q, company })));
      tokens.push(token);
    }
    return tokens;
  };

  it('records the profile’s company with each saved answer', async () => {
    const token = await appToken('priya@example.com');
    await record(token, [{ question: 'Why do you want to join Infosys?', answer: 'I like the training.', kind: 'about-you', company: '  Infosys   Ltd ' }]);
    const saved = await db.savedAnswer.findFirstOrThrow();
    expect(saved.company).toBe('Infosys Ltd');
    // Older apps send no company: still recorded, with none
    await record(token, [{ question: 'Tell me about your final year project.', answer: 'A chat app.', kind: 'experience' }]);
    expect(await db.savedAnswer.count({ where: { company: '' } })).toBe(1);
  });

  it('shows a company only once enough different people were asked there', async () => {
    expect(MIN_COMPANY_USERS).toBe(3);
    const [first] = await askedAt(['Infosys', 'infosys ltd'], () => [
      { question: 'Explain the difference between an abstract class and an interface.', answer: 'secret answer', kind: 'concept' },
    ]);
    // The same user several times doesn't count as more people
    await record(first, [{ question: 'What is polymorphism in Java?', answer: 'x', kind: 'concept', company: 'INFOSYS LIMITED' }]);
    expect((await request(app).get('/api/questions/companies').set(auth(first))).body.companies).toEqual([]);
    expect((await request(app).get('/api/questions/company-packs?company=Infosys').set(auth(first))).body.pack).toBeNull();
    expect((await request(app).get('/api/public/questions/companies/infosys')).status).toBe(404);

    const third = await appToken('third@example.com');
    await record(third, [{ question: 'explain the difference between an abstract class and an interface', answer: 'mine', kind: 'concept', company: 'Infosys Limited.' }]);

    const { companies } = (await request(app).get('/api/questions/companies').set(auth(third))).body;
    expect(companies).toEqual([{ name: 'Infosys', slug: 'infosys', questionCount: 2 }]);
    const { pack } = (await request(app).get('/api/questions/company-packs?company=Infosys%20Pvt.%20Ltd').set(auth(third))).body;
    expect(pack.company).toEqual({ name: 'Infosys', slug: 'infosys' });
    expect(pack.questions.map((q: { text: string; askedBy: number }) => [q.text, q.askedBy])).toEqual([
      ['Explain the difference between an abstract class and an interface.', 3],
      ['What is polymorphism in Java?', 1],
    ]);
    expect(pack.questions[0]).toMatchObject({ category: 'CONCEPT', categorySlug: 'technical' });
  });

  it('never gives out answers, names or who asked', async () => {
    const tokens = await askedAt(['Zoho Corp', 'Zoho', 'zoho technologies'], i => [
      { question: `Design a rate limiter for service number ${i + 1}.`, answer: `PRIVATE-ANSWER-${i}`, kind: 'design' },
    ]);
    const users = await db.user.findMany();
    const responses = [
      await request(app).get('/api/questions/company-packs?company=zoho').set(auth(tokens[0])),
      await request(app).get('/api/questions/companies?q=zo').set(auth(tokens[0])),
      await request(app).get('/api/public/questions/companies'),
      await request(app).get('/api/public/questions/companies/zoho'),
    ];
    for (const res of responses) {
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('PRIVATE-ANSWER');
      for (const u of users) {
        expect(body).not.toContain(u.id);
        expect(body).not.toContain(u.email);
        expect(body).not.toContain(`"${u.name}"`);
      }
    }
    expect(responses[3].body.pack.questions).toHaveLength(3);
    expect(Object.keys(responses[3].body.pack.questions[0]).sort()).toEqual(['askedBy', 'category', 'categorySlug', 'slug', 'text']);
    // Search only finds matching companies; the pages need no sign-in but the app's endpoints do
    expect((await request(app).get('/api/public/questions/companies?q=infosys')).body.companies).toEqual([]);
    expect((await request(app).get('/api/questions/companies')).status).toBe(401);
  });

  it('pre-renders the company pages for search engines, only past the threshold', async () => {
    await askedAt(['Flipkart', 'Flipkart Pvt Ltd', 'flipkart'], () => [
      { question: 'How would you design the cart for a big sale day?', answer: 'x', kind: 'design' },
    ]);
    await askedAt(['Swiggy', 'Swiggy Ltd'], () => [{ question: 'Tell me about a time you handled an angry customer.', answer: 'x', kind: 'experience' }], 10);
    const list = await renderPage(INDEX, '/interview-questions/companies');
    expect(list).toContain('href="/interview-questions/companies/flipkart"');
    expect(list).not.toContain('swiggy'); // Only two people: not shown anywhere
    const page = await renderPage(INDEX, '/interview-questions/companies/flipkart');
    expect(page).toContain('<title>Flipkart interview questions');
    expect(page).toContain('How would you design the cart for a big sale day?');
    expect(await renderPage(INDEX, '/interview-questions/companies/swiggy')).toBeNull();
    const map = await sitemap();
    expect(map).toContain('/interview-questions/companies/flipkart<');
    expect(map).not.toContain('swiggy');
  });
});

describe('salary negotiation practice', () => {
  const report = {
    setup: { role: 'Backend engineer', city: 'Bengaluru', market: 'india', currentCtc: '12 LPA', offer: '16 LPA', target: '20 LPA', noticePeriod: '60 days' },
    result: {
      score: 7, verdict: 'Good anchor, gave in on the joining bonus too quickly.', worked: ['Anchored at 21 LPA'], costMoney: ['Accepted variable as part of CTC'],
      betterPhrasings: [{ instead: 'Okay, fine', say: 'Could we move more of it into fixed pay?' }], finalDeal: '18.5 LPA fixed + 1 L joining bonus',
      turns: [{ who: 'hr', text: 'We can offer 16 LPA.' }, { who: 'you', text: 'I was hoping for 21.' }],
    },
  };

  it('saves the result as a career report on the account, for that user only', async () => {
    const token = await register('salary@example.com');
    const other = await register('other@example.com');
    const res = await request(app).post('/api/practice/salary').set(auth(token)).send(report);
    expect(res.status).toBe(201);
    expect(res.body.report).toMatchObject({ title: 'Backend engineer · Bengaluru', score: 7, result: { finalDeal: '18.5 LPA fixed + 1 L joining bonus' } });
    const saved = await db.careerReport.findFirstOrThrow();
    expect(saved).toMatchObject({ kind: 'SALARY_PRACTICE', score: 7 });
    expect(JSON.parse(saved.input!)).toMatchObject({ offer: '16 LPA', market: 'india' });

    expect((await request(app).get('/api/practice/salary').set(auth(token))).body.reports).toHaveLength(1);
    expect((await request(app).get('/api/practice/salary').set(auth(other))).body.reports).toHaveLength(0);
    // The normal practice results are unaffected
    expect((await request(app).get('/api/practice').set(auth(token))).body.sessions).toEqual([]);
  });

  it('needs a sign-in and a valid score', async () => {
    expect((await request(app).post('/api/practice/salary').send(report)).status).toBe(401);
    const token = await register('salary@example.com');
    expect((await request(app).post('/api/practice/salary').set(auth(token)).send({ ...report, result: { ...report.result, score: 42 } })).status).toBe(400);
  });
});
