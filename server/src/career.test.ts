import fs from 'node:fs';
import zlib from 'node:zlib';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiGateway, ChatRequest } from './ai.js';
import { createApp } from './app.js';
import { extractFileText, guardNumbers, isLinkedInLink, parseAiJson, resumeChecks } from './career.js';
import { db } from './db.js';
import { usageSaved } from './entitlements.js';
import { clearSettingsCache } from './settings.js';

// Career tools: resume score, rewrite, LinkedIn review, cover letter, interviewer insights, and their history

const RESUME = `Priya Sharma
priya.sharma@example.com | +91 98765 43210 | linkedin.com/in/priyasharma | github.com/priyas

SUMMARY
Backend engineer with 4 years of experience building payment systems in Java and Spring Boot.

EXPERIENCE
Software Engineer, Razorfin Payments, Bengaluru (Jan 2021 – Present)
• Built a refund service in Java and Spring Boot that handles 12,000 refunds a day
• Reduced checkout API latency by 35% by adding Redis caching
• Responsible for code reviews and on-call support
• Worked on migrating the ledger to PostgreSQL

Associate Engineer, ByteCraft, Pune (Jul 2019 – Dec 2020)
• Developed REST APIs for a hotel booking app used by 40 hotels
• Helped the team with testing

EDUCATION
B.Tech in Computer Science, VIT Vellore, 2019

SKILLS
Java, Spring Boot, PostgreSQL, Redis, Kafka, Docker, AWS (EC2, S3)`;

const JOB = `Senior Backend Engineer
We are hiring a backend engineer to build payment APIs. You know Java or Kotlin, Kafka, Kubernetes and PostgreSQL, and you have 4+ years of experience.`;

const INTERVIEWER = `Arjun Mehta
Engineering Manager at Razorfin Payments · Bengaluru
About: I lead the payments platform team (14 engineers). Before this I was a staff engineer at Flipkart working on order systems.
Experience: Engineering Manager, Razorfin (2022–Present); Staff Engineer, Flipkart (2016–2022)
Education: IIT Bombay, B.Tech Computer Science`;

const SCORE_REPLY = {
  overall: 64, ats: 70, summary: 'A solid backend resume with some numbers. Several bullets describe duties, not results.',
  detectedRole: 'Backend Engineer',
  subScores: { impact: { score: 60, note: 'Some numbers.' }, clarity: { score: 70, note: 'Clear.' }, skills: { score: 72, note: 'Relevant.' },
    structure: { score: 75, note: 'Standard.' }, keywords: { score: 58, note: 'Missing Kubernetes.' }, length: { score: 10, note: 'ignored' } },
  good: [{ point: 'Real numbers in two bullets', why: 'Shows impact.' }],
  bad: [{ point: '“Responsible for code reviews”', why: 'A duty, not a result.', fix: 'Say what changed because of your reviews.' }],
  atsIssues: [{ issue: 'Pipes in the contact line', why: 'Some ATS split them oddly.', fix: 'Put each on its own line.', severity: 'low' }],
  presentKeywords: ['Java', 'Kafka', 'Kubernetes'], // Kubernetes isn't in the resume: dropped
  missingKeywords: ['Kubernetes', 'Kotlin', 'Redis'], // Redis is in the resume: dropped
  rewrites: [{ before: 'Worked on migrating the ledger to PostgreSQL', after: 'Migrated the ledger to PostgreSQL for 2,000,000 accounts with zero downtime', why: 'Starts with a verb.' }],
};
const REWRITE_REPLY = {
  match: 72, verdict: 'Good fit for payments work. Kubernetes is the gap.', matchedSkills: ['Java', 'Kafka', 'PostgreSQL'], missingSkills: ['Kubernetes'],
  experienceFit: '4 years, matches 4+.', reasons: [{ point: 'Payments domain', positive: true }, { point: 'No Kubernetes', positive: false }],
  rewrittenResume: `PRIYA SHARMA\n\nSUMMARY\nBackend engineer with 4 years in payments.\n\nEXPERIENCE\n- Built a refund service handling 12,000 refunds a day\n- Cut checkout latency by 35% with Redis\n- Led reviews for 9 engineers\n- Moved the ledger to PostgreSQL [add number: how many accounts]`,
  changes: ['Moved payments work to the top'],
};
const LINKEDIN_REPLY = {
  score: 58, summary: 'Thin About section.', headlines: ['Backend Engineer | Java · Payments', 'Payments backend engineer', 'Java + Kafka engineer'],
  about: 'I build payment systems.', experience: [{ before: 'Worked on refunds', after: 'Built the refund service', why: 'Verb first.' }],
  skillsToAdd: ['Kafka'], good: [{ point: 'Clear title', why: 'Searchable.' }], bad: [{ point: 'No About', why: 'Recruiters read it.', fix: 'Write one.' }],
};
const LETTER = `Dear Hiring Manager,\n\n${'I build payment systems in Java and Spring Boot at Razorfin, where my refund service handles 12,000 refunds a day. '.repeat(10)}\n\nRegards,\nPriya Sharma`;
const INSIGHTS_REPLY = {
  who: { name: 'Arjun Mehta', role: 'Engineering Manager, Razorfin Payments', seniority: 'Manager', background: 'Ex-Flipkart staff engineer. Leads payments platform.' },
  caresAbout: [{ point: 'Reliability of payment systems', why: 'Leads the payments platform.' }],
  questions: Array.from({ length: 9 }, (_, i) => ({ question: `How would you design idempotent refunds, part ${i + 1}?`, why: 'He runs payments.' })),
  tips: ['Be concrete about scale.'], askThem: [{ question: 'What does the team own next quarter?', why: 'Shows interest.' }], commonGround: ['Both worked on payments'],
};

const replyFor = (req: ChatRequest) =>
  /senior recruiter and ATS/.test(req.system) ? SCORE_REPLY
  : /expert resume writer/.test(req.system) ? REWRITE_REPLY
  : /LinkedIn profile expert/.test(req.system) ? LINKEDIN_REPLY
  : /cover letters/.test(req.system) ? { letter: LETTER, highlights: ['12,000 refunds a day'] }
  : INSIGHTS_REPLY;

const calls: ChatRequest[] = [];
let scripted: string[] = []; // Replies to send first, in order (then the normal ones)
const ai: AiGateway = {
  streamChat: async req => {
    calls.push(req);
    const text = scripted.length ? scripted.shift()! : JSON.stringify(replyFor(req));
    return { text, provider: 'claude', model: 'claude-opus-5-5', inputTokens: 1000, outputTokens: 500 };
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
const appToken = async (email: string) => {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123', device: { fingerprint: `${email}-fp-0123456789`, name: 'PC', platform: 'win32', appVersion: '1.0.0' } });
  expect(res.status).toBe(200);
  return res.body.token as string;
};
const givePlan = async (email: string) => {
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  return db.purchase.create({ data: { userId: user.id, planName: 'Test', source: 'ADMIN_GRANT', expiresAt: new Date(Date.now() + 86_400_000), listeningMinutes: 60, tokenLimit: 1_000_000 } });
};
const signedUpWithPlan = async (email: string) => {
  const token = await register(email);
  await givePlan(email);
  return token;
};

// ---------- Small files made in the test ----------

const pdfString = (s: string) => `(${s.replace(/[()\\]/g, '\\$&')})`;
const makePdf = (content: string) => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
};
const linesPdf = (lines: string[]) => makePdf(`BT /F1 10 Tf 14 TL 50 760 Td ${lines.map(l => `${pdfString(l)} '`).join(' ')} ET`);
const twoColumnPdf = () => makePdf(Array.from({ length: 12 }, (_, i) =>
  `BT /F1 10 Tf 40 ${740 - i * 14} Td ${pdfString(`Left column line ${i + 1}`)} Tj ET BT /F1 10 Tf 360 ${740 - i * 14} Td ${pdfString(`Right column item ${i + 1}`)} Tj ET`).join('\n'));

const makeZip = (files: Record<string, string | Buffer>) => {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const packed = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);
    const fileName = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fileName.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(fileName.length, 28);
    entry.writeUInt32LE(offset, 42);
    parts.push(local, fileName, packed);
    central.push(entry, fileName);
    offset += 30 + fileName.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
};
const paragraph = (text: string, bullet = false) =>
  `<w:p>${bullet ? '<w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr>' : ''}<w:r><w:t>${text.replace(/&/g, '&amp;')}</w:t></w:r></w:p>`;
const makeDocx = (body: string, extra: Record<string, string> = {}) => makeZip({
  '[Content_Types].xml': '<Types/>',
  'word/document.xml': `<w:document><w:body>${body}</w:body></w:document>`,
  ...extra,
});

beforeEach(async () => {
  calls.length = 0;
  scripted = [];
  await db.careerReport.deleteMany();
  await db.setting.deleteMany();
  clearSettingsCache();
  await db.device.deleteMany();
  await db.trialClaim.deleteMany();
  await db.usageEvent.deleteMany();
  await db.purchase.deleteMany();
  await db.payment.deleteMany();
  await db.plan.deleteMany();
  await db.user.updateMany({ data: { referredById: null } });
  await db.user.deleteMany();
});

afterEach(() => { vi.restoreAllMocks(); });

describe('resume score and ATS check', () => {
  it('needs a plan, and nothing runs or is saved without one', async () => {
    const token = await register('noplan@example.com');
    const res = await request(app).post('/api/career/resume-score').set(auth(token)).send({ resumeText: RESUME });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('NO_PLAN');
    expect(calls).toHaveLength(0);
    expect(await db.careerReport.count()).toBe(0);
    expect((await request(app).post('/api/career/resume-score').send({ resumeText: RESUME })).status).toBe(401);
  });

  it('scores with the best model, records usage and saves the report', async () => {
    const token = await signedUpWithPlan('priya@example.com');
    const res = await request(app).post('/api/career/resume-score').set(auth(token)).send({ resumeText: RESUME, jobDescription: JOB });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ tier: 'quality', json: true });
    expect(calls[0].user).toContain('Razorfin');
    expect(calls[0].user).toContain('Kubernetes'); // The job went in

    const { report } = res.body;
    expect(report).toMatchObject({ kind: 'RESUME_SCORE', title: 'Resume score: Senior Backend Engineer', model: 'claude-opus-5-5' });
    const result = report.result;
    // AI 64 blended with the checks done in code
    expect(result.aiOverall).toBe(64);
    expect(result.overall).toBe(Math.round(64 * 0.8 + result.checks.basicsScore * 0.2));
    expect(result.ats).toBe(Math.round(70 * 0.6 + result.checks.atsScore * 0.4));
    expect(report.score).toBe(result.overall);
    // Length comes from the word count, not the AI
    expect(result.subScores.find((s: { key: string }) => s.key === 'length').score).toBe(result.checks.lengthScore);
    // Keywords checked against the resume
    expect(result.presentKeywords).toEqual(['Java', 'Kafka']);
    expect(result.missingKeywords).toEqual(['Kubernetes', 'Kotlin']);
    // An invented number in a rewrite becomes a placeholder
    expect(result.rewrites[0].after).toBe('Migrated the ledger to PostgreSQL for [add number] accounts with zero downtime');

    await usageSaved();
    const usage = await db.usageEvent.findMany();
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ kind: 'CHAT', model: 'claude-opus-5-5', inputTokens: 1000, outputTokens: 500 });
    expect((await db.purchase.findFirstOrThrow()).usedTokens).toBe(1500);
    const saved = await db.careerReport.findFirstOrThrow();
    expect(JSON.parse(saved.input!).resumeText).toBe(RESUME);
  });

  it('works with the desktop app’s sign-in too', async () => {
    await signedUpWithPlan('desk@example.com');
    const token = await appToken('desk@example.com');
    const res = await request(app).post('/api/career/resume-score').set(auth(token)).send({ resumeText: RESUME });
    expect(res.status).toBe(200);
    expect(res.body.report.title).toBe('Resume score: Backend Engineer');
  });

  it('checks the file’s layout when the resume is uploaded', async () => {
    const token = await signedUpWithPlan('upload@example.com');
    const docx = makeDocx(
      [...RESUME.split('\n').map(l => paragraph(l.replace(/^• /, ''), l.startsWith('• '))), '<w:tbl><w:tr><w:tc>x</w:tc></w:tr></w:tbl>'].join(''),
      { 'word/header1.xml': `<w:hdr>${paragraph('Priya Sharma · priya.sharma@example.com')}</w:hdr>`, 'word/media/image1.png': 'png' },
    );
    const res = await request(app).post('/api/career/resume-score').set(auth(token)).attach('file', docx, 'resume.docx');
    expect(res.status).toBe(200);
    const { checks, fileHints } = res.body.report.result;
    expect(fileHints).toMatchObject({ fileType: 'docx', tables: true, headerFooter: true, images: true, textBoxes: false });
    const failed = checks.checklist.filter((c: { ok: boolean }) => !c.ok).map((c: { id: string }) => c.id);
    expect(failed).toEqual(expect.arrayContaining(['tables', 'header-footer', 'images']));
    expect(checks.bullets).toBe(6); // Word list items count as bullets
  });

  it('rejects a resume that is too short before using the AI', async () => {
    const token = await signedUpWithPlan('short@example.com');
    const res = await request(app).post('/api/career/resume-score').set(auth(token)).send({ resumeText: 'Java developer' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too short/);
    expect(calls).toHaveLength(0);
  });
});

describe('reading the AI’s JSON', () => {
  it('copes with code fences, text around it, trailing commas and raw line breaks', () => {
    expect(parseAiJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseAiJson('Here you go:\n{"a": [1, 2,], "b": {"c": "x",},}\nHope it helps')).toEqual({ a: [1, 2], b: { c: 'x' } });
    expect(parseAiJson('{"letter": "Dear team,\nThanks"}')).toEqual({ letter: 'Dear team,\nThanks' });
    expect(() => parseAiJson('Sorry, I cannot help')).toThrow();
    expect(() => parseAiJson('[1, 2]')).toThrow();
    expect(() => parseAiJson('{"a": ')).toThrow();
  });

  it('asks once more when the reply can’t be read, counting both calls', async () => {
    const token = await signedUpWithPlan('retry@example.com');
    scripted = ['{"overall": 64, "ats":'];
    const ok = await request(app).post('/api/career/resume-score').set(auth(token)).send({ resumeText: RESUME });
    expect(ok.status).toBe(200);
    expect(calls).toHaveLength(2);

    scripted = ['not json', '{"summary": "no scores"}'];
    const bad = await request(app).post('/api/career/resume-score').set(auth(token)).send({ resumeText: RESUME });
    expect(bad.status).toBe(502);
    expect(bad.body.code).toBe('BAD_REPLY');
    await usageSaved();
    expect(await db.usageEvent.count()).toBe(4);
    expect(await db.careerReport.count()).toBe(1);
  });

  it('turns an AI failure into a friendly error', async () => {
    const token = await signedUpWithPlan('down@example.com');
    vi.spyOn(ai, 'streamChat').mockRejectedValueOnce(new Error('overloaded'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post('/api/career/cover-letter').set(auth(token)).send({ resumeText: RESUME, jobDescription: JOB });
    expect(res.status).toBe(503);
    expect(await db.careerReport.count()).toBe(0);
  });
});

describe('checks done in code', () => {
  it('finds sections, bullets, numbers and contact details the same way every time', () => {
    const checks = resumeChecks(RESUME);
    expect(checks.sections).toEqual(['Summary', 'Experience', 'Education', 'Skills']);
    expect(checks.missingSections).toEqual([]);
    expect(checks.bullets).toBe(6);
    expect(checks.bulletsWithNumbers).toBe(3); // 12,000 / 35% / 40 hotels; years don't count
    expect(checks.numbersRatio).toBe(0.5);
    expect(checks.contact).toEqual({ email: true, phone: true, linkedin: true, portfolio: true });
    expect(checks.hasDates).toBe(true);
    expect(checks.weakPhrases.map(w => w.phrase)).toEqual(expect.arrayContaining(['responsible for', 'worked on', 'helped']));
    expect(checks.actionVerbRatio).toBe(0.5); // Built, Reduced, Developed
    expect(checks.iconCharacters).toBe(0);
    expect(resumeChecks(RESUME)).toEqual(checks);
  });

  it('flags missing sections, no contact, icons, tables and a too-short resume', () => {
    const bad = resumeChecks('Rahul\nMy Journey\nI am a hard working developer ☎ 📧\nPython | Django | React | SQL\nTools | Git | Docker | Linux\nStuff | More | Things');
    expect(bad.missingSections).toEqual(['Experience', 'Education', 'Skills']);
    expect(bad.contact.email).toBe(false);
    expect(bad.contact.phone).toBe(false);
    expect(bad.iconCharacters).toBe(2);
    expect(bad.tableLikeLines).toBe(3);
    expect(bad.lengthScore).toBe(30);
    expect(bad.firstPerson).toBeGreaterThan(0);
    const ids = bad.checklist.filter(c => !c.ok).map(c => c.id);
    expect(ids).toEqual(expect.arrayContaining(['email', 'phone', 'section-experience', 'icons', 'tables', 'length']));
    expect(bad.basicsScore).toBeLessThan(30);
  });

  it('does not take a list of years for a phone number', () => {
    expect(resumeChecks('2019 - 2021 2022 2023').contact.phone).toBe(false);
    expect(resumeChecks('Call +1 (415) 555-0134').contact.phone).toBe(true);
  });

  it('replaces only numbers the resume doesn’t have', () => {
    expect(guardNumbers('Cut latency by 35% for 2,000 users on EC2 with Python3 since 2021', [RESUME]))
      .toEqual({ text: 'Cut latency by 35% for [add number] users on EC2 with Python3 since 2021', replaced: 1 });
    expect(guardNumbers('Handled 12,000 refunds and 5k calls', [RESUME]).text).toBe('Handled 12,000 refunds and [add number]k calls');
  });
});

describe('the other tools', () => {
  it('rewrites a resume for a job with a match score, and marks invented numbers', async () => {
    const token = await signedUpWithPlan('rewrite@example.com');
    const res = await request(app).post('/api/career/resume-rewrite').set(auth(token)).send({ resumeText: RESUME, jobDescription: JOB });
    expect(res.status).toBe(200);
    const { report } = res.body;
    expect(report).toMatchObject({ kind: 'RESUME_REWRITE', score: 72, title: 'Resume for: Senior Backend Engineer' });
    expect(report.result.rewrittenResume).toContain('Led reviews for [add number] engineers');
    expect(report.result.rewrittenResume).toContain('12,000 refunds');
    expect(report.result.placeholders).toBe(2);
    expect(report.result.changes.at(-1)).toMatch(/1 number not in your resume/);
    expect((await request(app).post('/api/career/resume-rewrite').set(auth(token)).send({ resumeText: RESUME })).status).toBe(400);
  });

  it('reviews a LinkedIn profile from its “Save to PDF” file', async () => {
    const token = await signedUpWithPlan('linkedin@example.com');
    const pdf = linesPdf(['Priya Sharma', 'Backend Engineer at Razorfin Payments', 'About', 'I build payment systems in Java and Spring Boot.',
      'Experience', 'Software Engineer, Razorfin Payments, 2021 - Present', 'Built a refund service that handles 12,000 refunds a day.',
      'Education', 'VIT Vellore, B.Tech Computer Science, 2019', 'Skills', 'Java, Spring Boot, PostgreSQL, Redis']);
    const res = await request(app).post('/api/career/linkedin-review').set(auth(token)).attach('file', pdf, 'Profile.pdf');
    expect(res.status).toBe(200);
    expect(res.body.report).toMatchObject({ kind: 'LINKEDIN_REVIEW', score: 58 });
    expect(res.body.report.result.headlines).toHaveLength(3);
    expect(calls[0].user).toContain('Built a refund service that handles 12,000 refunds a day.');
  });

  it('writes a cover letter', async () => {
    const token = await signedUpWithPlan('letter@example.com');
    const res = await request(app).post('/api/career/cover-letter').set(auth(token)).send({ resumeText: RESUME, jobDescription: JOB, company: 'Northwind', tone: 'warm' });
    expect(res.status).toBe(200);
    expect(res.body.report).toMatchObject({ kind: 'COVER_LETTER', title: 'Cover letter: Northwind', score: null });
    expect(res.body.report.result).toMatchObject({ company: 'Northwind', tone: 'warm' });
    expect(res.body.report.result.words).toBeGreaterThan(150);
    expect(calls[0].system).toContain('Tone: warm');
    expect((await request(app).post('/api/career/cover-letter').set(auth(token)).send({ resumeText: RESUME, jobDescription: JOB, tone: 'rude' })).status).toBe(400);
  });

  it('gives interviewer insights from their pasted profile', async () => {
    const token = await signedUpWithPlan('insights@example.com');
    const res = await request(app).post('/api/career/interviewer-insights').set(auth(token)).send({ interviewerText: INTERVIEWER, resumeText: RESUME, jobDescription: JOB });
    expect(res.status).toBe(200);
    expect(res.body.report).toMatchObject({ kind: 'INTERVIEWER_INSIGHTS', title: 'Interviewer: Arjun Mehta, Engineering Manager, Razorfin Payments' });
    expect(res.body.report.result.questions).toHaveLength(9);
    expect(calls[0].user).toContain("INTERVIEWER'S LINKEDIN PROFILE");
  });

  it('never opens LinkedIn links: asks for the text or the PDF instead', async () => {
    const token = await signedUpWithPlan('nolinks@example.com');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const [path, body] of [
      ['/api/career/interviewer-insights', { interviewerText: 'https://www.linkedin.com/in/arjun-mehta-12345/ please check this person out' }],
      ['/api/career/linkedin-review', { profileText: `https://linkedin.com/in/priyasharma${'?x=1'.repeat(40)}` }],
    ] as const) {
      const res = await request(app).post(path).set(auth(token)).send(body);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'LINKEDIN_LINK', error: expect.stringMatching(/can't open LinkedIn links.*Save to PDF/) });
    }
    expect(calls).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    // A pasted profile that mentions its own link is fine
    expect(isLinkedInLink(`${INTERVIEWER}\nlinkedin.com/in/arjunmehta`)).toBe(false);
    const res = await request(app).post('/api/career/interviewer-insights').set(auth(token)).send({ interviewerText: `${INTERVIEWER}\nlinkedin.com/in/arjunmehta` });
    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('has no code that fetches anything from the web', () => {
    for (const file of ['career.ts', 'routes/career.ts']) {
      const source = fs.readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/\bfetch\(|readCompanySite|node:https?|from 'https?'|axios|got\(/);
    }
  });
});

describe('uploads', () => {
  const extract = (token: string, file: Buffer, name: string) => request(app).post('/api/career/extract-text').set(auth(token)).attach('file', file, name);

  it('reads PDF, Word and text files without using the AI or a plan', async () => {
    const token = await register('files@example.com');
    const pdf = await extract(token, linesPdf(['Priya Sharma', 'EXPERIENCE', '- Built a refund service']), 'resume.pdf');
    expect(pdf.status).toBe(200);
    expect(pdf.body.text).toBe('Priya Sharma\nEXPERIENCE\n- Built a refund service');
    expect(pdf.body.fileHints).toEqual({ fileType: 'pdf', pages: 1, columns: false });

    const docx = await extract(token, makeDocx(`${paragraph('SKILLS')}${paragraph('Java & Kafka, Spring Boot, PostgreSQL', true)}`), 'resume.docx');
    expect(docx.status).toBe(200);
    expect(docx.body.text).toBe('SKILLS\n• Java & Kafka, Spring Boot, PostgreSQL');
    expect(docx.body.words).toBe(8);

    const txt = await extract(token, Buffer.from('Plain text resume with enough words in it'), 'resume.txt');
    expect(txt.body.text).toBe('Plain text resume with enough words in it');
    expect(calls).toHaveLength(0);
  });

  it('spots a two-column PDF layout', async () => {
    const { hints } = await extractFileText(twoColumnPdf(), 'cv.pdf');
    expect(hints.columns).toBe(true);
  });

  it('refuses big files, other file types, old .doc, scanned PDFs and zip bombs', async () => {
    const token = await register('limits@example.com');
    const big = await extract(token, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024)]), 'big.pdf');
    expect(big.status).toBe(413);
    expect(big.body.error).toMatch(/5 MB/);

    const png = await extract(token, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]), 'photo.png');
    expect(png.status).toBe(400);
    expect(png.body.error).toMatch(/PDF or Word/);

    const doc = await extract(token, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]), 'old.doc');
    expect(doc.body.error).toMatch(/old Word/);

    const zip = await extract(token, makeZip({ 'a.txt': 'hello there' }), 'archive.zip');
    expect(zip.status).toBe(400);

    const scanned = await extract(token, makePdf('q 1 0 0 1 0 0 cm Q'), 'scan.pdf');
    expect(scanned.status).toBe(400);
    expect(scanned.body.error).toMatch(/scanned/);

    const bomb = await extract(token, makeDocx(' '.repeat(25 * 1024 * 1024)), 'bomb.docx');
    expect(bomb.status).toBe(400);
    expect(bomb.body.error).toMatch(/too large or damaged/);

    const broken = await extract(token, Buffer.from('%PDF-1.4 garbage garbage garbage'), 'broken.pdf');
    expect(broken.status).toBe(400);

    const nothing = await request(app).post('/api/career/extract-text').set(auth(token)).send({});
    expect(nothing.status).toBe(400);
  });
});

describe('history', () => {
  it('lists newest first by kind with pages, opens and deletes only the user’s own reports', async () => {
    const token = await signedUpWithPlan('history@example.com');
    const user = await db.user.findUniqueOrThrow({ where: { email: 'history@example.com' } });
    const base = Date.now() - 100_000;
    for (let i = 0; i < 5; i++) {
      await db.careerReport.create({ data: { userId: user.id, kind: i % 2 ? 'COVER_LETTER' : 'RESUME_SCORE', title: `R${i}`, result: '{"n":1}', score: i, createdAt: new Date(base + i * 1000) } });
    }
    const all = (await request(app).get('/api/career/reports?limit=2').set(auth(token))).body;
    expect(all).toMatchObject({ total: 5, page: 1, pages: 3 });
    expect(all.reports.map((r: { title: string }) => r.title)).toEqual(['R4', 'R3']);
    expect(all.reports[0].result).toBeUndefined(); // The list is light
    const page3 = (await request(app).get('/api/career/reports?limit=2&page=3').set(auth(token))).body;
    expect(page3.reports.map((r: { title: string }) => r.title)).toEqual(['R0']);
    const letters = (await request(app).get('/api/career/reports?kind=COVER_LETTER').set(auth(token))).body;
    expect(letters.reports.map((r: { title: string }) => r.title)).toEqual(['R3', 'R1']);
    expect((await request(app).get('/api/career/reports?kind=NOPE').set(auth(token))).status).toBe(400);

    const id = all.reports[0].id;
    const one = (await request(app).get(`/api/career/reports/${id}`).set(auth(token))).body.report;
    expect(one).toMatchObject({ id, title: 'R4', result: { n: 1 }, input: null });

    const other = await register('other@example.com');
    expect((await request(app).get(`/api/career/reports/${id}`).set(auth(other))).status).toBe(404);
    expect((await request(app).delete(`/api/career/reports/${id}`).set(auth(other))).status).toBe(404);
    expect((await request(app).get('/api/career/reports').set(auth(other))).body.total).toBe(0);

    await request(app).delete(`/api/career/reports/${id}`).set(auth(token)).expect(200);
    expect(await db.careerReport.count()).toBe(4);
  });

  it('is in “Download my data” and is deleted with the account', async () => {
    const token = await signedUpWithPlan('mydata@example.com');
    await request(app).post('/api/career/resume-score').set(auth(token)).send({ resumeText: RESUME }).expect(200);
    const exported = (await request(app).get('/api/auth/me/export').set(auth(token))).body;
    expect(exported.careerReports).toHaveLength(1);
    expect(exported.careerReports[0]).toMatchObject({ kind: 'RESUME_SCORE', input: { resumeText: RESUME } });
    expect(exported.careerReports[0].result.overall).toBeGreaterThan(0);

    await request(app).post('/api/auth/me/delete').set(auth(token)).send({ password: 'password123' }).expect(200);
    expect(await db.careerReport.count()).toBe(0);
  });
});
