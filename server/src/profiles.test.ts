import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AiGateway } from './ai.js';
import { createApp } from './app.js';
import { db } from './db.js';
import { clearSettingsCache } from './settings.js';
import { memoryStore, setObjectStoreForTests } from './storage.js';

// Copies of the app's profiles on the account (routes/profiles.ts)

const ai: AiGateway = {
  streamChat: async () => ({ text: '', provider: 'groq', model: 'test', inputTokens: 0, outputTokens: 0 }),
  transcribe: async () => ({ text: '', provider: 'groq', model: 'test' }),
};
const app = createApp({ ai, razorpay: null });

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const register = async (email: string) => {
  const res = await request(app).post('/api/auth/register').send({ email, name: email.split('@')[0], password: 'password123' });
  expect(res.status).toBe(201);
  return res.body.token as string;
};
const appToken = async (email: string) => {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123', device: { fingerprint: `${email}-fingerprint-123`, name: 'Asha’s laptop', platform: 'win32', appVersion: '1.0.0' } });
  expect(res.status).toBe(200);
  return res.body.token as string;
};

const SECRET_RESUME = 'Asha Rao. Senior engineer at Flipkart. Built the checkout service.';
const profile = (id = 'p1', overrides: object = {}) => ({
  id, name: 'Google SDE', cv: SECRET_RESUME, cvFileName: 'asha.pdf', job: 'Senior Software Engineer\nBuild search.',
  company: 'Google', companyNotes: 'Search, Cloud', interviewer: 'EM, 10 years', knowledge: [{ id: 'k', name: 'notes.md', text: 'Kafka notes' }],
  language: 'en', answerLanguage: 'same',
  answers: [{ id: 'a1', question: 'Tell me about yourself', answer: 'I build things.' }],
  stories: [{ id: 's1', title: 'Checkout fix', situation: 'Slow', action: 'Cached', result: '-40%', themes: ['Ownership'] }],
  ...overrides,
});
const put = (token: string, body: object, id = (body as { id: string }).id) =>
  request(app).put(`/api/profiles/${id}`).set(auth(token)).send(body);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2000, 1)]);
const putFile = (token: string, id: string, bytes: Buffer, type = 'application/pdf', name = 'asha.pdf') =>
  request(app).put(`/api/profiles/${id}/resume-file`).set(auth(token)).set('Content-Type', type).set('X-File-Name', encodeURIComponent(name)).send(bytes);

let admin: string;
let asha: string;
let store: ReturnType<typeof memoryStore>;

beforeEach(async () => {
  await db.userProfile.deleteMany();
  await db.auditLog.deleteMany();
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
  setObjectStoreForTests(null); // S3 not set up, unless a test says so
  admin = await register('admin@example.com');
  await register('asha@example.com');
  asha = await appToken('asha@example.com');
  store = memoryStore();
});

afterEach(() => setObjectStoreForTests(undefined));

describe('profiles in the database (no S3)', () => {
  it('saves, updates, lists and deletes a profile, encrypted at rest', async () => {
    let res = await put(asha, profile());
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ clientId: 'p1', name: 'Google SDE', company: 'Google', jobTitle: 'Senior Software Engineer', resumeFileName: 'asha.pdf', answersCount: 1, storiesCount: 1, storage: 'DATABASE', deviceName: 'Asha’s laptop' });

    const row = await db.userProfile.findFirstOrThrow();
    expect(row.data).toMatch(/^v1:/);
    expect(row.data).not.toContain('Flipkart');
    expect(row.storageKey).toBeNull();
    expect(row.resumeChars).toBe(SECRET_RESUME.length);

    res = await put(asha, profile('p1', { name: 'Google L5', answers: [] }));
    expect(res.body.profile).toMatchObject({ name: 'Google L5', answersCount: 0 });
    expect(await db.userProfile.count()).toBe(1);

    await put(asha, profile('p2', { name: 'Amazon' }));
    res = await request(app).get('/api/profiles').set(auth(asha));
    expect(res.body).toMatchObject({ profileSync: true, files: false });
    expect(res.body.profiles.map((p: { name: string }) => p.name)).toEqual(['Google L5', 'Amazon']);
    expect(JSON.stringify(res.body)).not.toContain('Flipkart'); // The list has no content

    res = await request(app).get('/api/profiles/p1').set(auth(asha));
    expect(res.body.profile).toMatchObject({ cv: SECRET_RESUME, companyNotes: 'Search, Cloud', knowledge: [{ text: 'Kafka notes' }] });

    expect((await request(app).delete('/api/profiles/p1').set(auth(asha))).status).toBe(200);
    expect((await request(app).delete('/api/profiles/p1').set(auth(asha))).status).toBe(200); // Already gone: fine
    expect(await db.userProfile.count()).toBe(1);
  });

  it('checks what it is sent', async () => {
    expect((await put(asha, { id: 'p1' })).status).toBe(400);
    expect((await put(asha, profile('p1'), 'other')).status).toBe(400);
    expect((await put(asha, profile('bad id!'), 'bad%20id!')).status).toBe(400);
    expect((await put(asha, profile('p1', { answers: 'nope' }))).status).toBe(400);
    const big = await put(asha, profile('p1', { cv: 'x'.repeat(5 * 1024 * 1024) }));
    expect(big.status).toBe(413);
    expect(big.body.code).toBe('TOO_LARGE');
    expect(await db.userProfile.count()).toBe(0);
  });

  it('ignores resume files while S3 is not set up', async () => {
    await put(asha, profile());
    expect((await putFile(asha, 'p1', PDF)).status).toBe(204);
    expect((await db.userProfile.findFirstOrThrow()).resumeFileKey).toBeNull();
  });

  it('needs a sign-in and keeps each user to their own profiles', async () => {
    expect((await request(app).get('/api/profiles')).status).toBe(401);
    expect((await request(app).put('/api/profiles/p1').send(profile())).status).toBe(401);
    await put(asha, profile());
    const other = await register('ravi@example.com');
    expect((await request(app).get('/api/profiles').set(auth(other))).body.profiles).toEqual([]);
    expect((await request(app).get('/api/profiles/p1').set(auth(other))).status).toBe(404);
    await request(app).delete('/api/profiles/p1').set(auth(other));
    await put(other, profile('p1', { name: 'Ravi' })); // Same app id on another account: its own copy
    expect(await db.userProfile.count()).toBe(2);
    expect((await request(app).get('/api/profiles/p1').set(auth(asha))).body.name).toBe('Google SDE');
    // Only admins see others' profiles
    const row = await db.userProfile.findFirstOrThrow({ where: { name: 'Google SDE' } });
    expect((await request(app).get(`/api/admin/users/${row.userId}/profiles/${row.id}`).set(auth(other))).status).toBe(403);
  });
});

describe('profiles in S3', () => {
  beforeEach(() => setObjectStoreForTests(store));

  it('keeps the profile encrypted in S3, not in the database', async () => {
    const res = await put(asha, profile());
    expect(res.body.profile.storage).toBe('S3');
    const row = await db.userProfile.findFirstOrThrow();
    expect(row.data).toBeNull();
    expect(row.storageKey).toBe(`profiles/${row.userId}/p1/profile.json.enc`);
    const object = store.objects.get(row.storageKey!)!;
    expect(object.body.toString()).toMatch(/^v1:/);
    expect(object.body.toString()).not.toContain('Flipkart');
    expect((await request(app).get('/api/profiles/p1').set(auth(asha))).body.profile.cv).toBe(SECRET_RESUME);
  });

  it('keeps the original resume file: PDF, Word or text, 10 MB at most', async () => {
    expect((await putFile(asha, 'p1', PDF)).status).toBe(404); // The profile comes first
    await put(asha, profile());
    expect((await putFile(asha, 'p1', PDF)).status).toBe(204);
    const row = await db.userProfile.findFirstOrThrow();
    expect(row.resumeFileKey).toBe(`profiles/${row.userId}/p1/resume`);
    expect(row.resumeFileType).toBe('application/pdf');
    expect(store.objects.get(row.resumeFileKey!)!.body.equals(PDF)).toBe(true);

    const docx = Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.alloc(100, 2)]);
    expect((await putFile(asha, 'p1', docx, 'application/octet-stream', 'asha.docx')).status).toBe(204);
    expect((await db.userProfile.findFirstOrThrow()).resumeFileType).toContain('wordprocessingml');
    expect((await putFile(asha, 'p1', Buffer.from('Asha Rao\nEngineer'), 'text/plain', 'asha.txt')).status).toBe(204);

    // Multipart works too
    const multipart = await request(app).put('/api/profiles/p1/resume-file').set(auth(asha)).attach('file', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' });
    expect(multipart.status).toBe(204);
    expect((await db.userProfile.findFirstOrThrow()).resumeFileType).toBe('application/pdf');

    // Not a resume
    const exe = await putFile(asha, 'p1', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100, 0)]), 'application/octet-stream', 'cv.exe');
    expect(exe.status).toBe(415);
    expect(exe.body.code).toBe('UNSUPPORTED_FILE');
    expect((await putFile(asha, 'p1', Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.alloc(10)]), 'application/zip', 'x.zip')).status).toBe(415);
    const huge = await putFile(asha, 'p1', Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]));
    expect(huge.status).toBe(413);
    expect(huge.body.code).toBe('FILE_TOO_LARGE');
    expect((await putFile(asha, 'p1', Buffer.alloc(0))).status).toBe(400);

    // The user's own download link
    const link = await request(app).get('/api/profiles/p1/resume-file').set(auth(asha));
    expect(link.body.url).toContain('/p1/resume');
  });

  it('deleting a profile deletes its files', async () => {
    await put(asha, profile());
    await putFile(asha, 'p1', PDF);
    expect(store.objects.size).toBe(2);
    await request(app).delete('/api/profiles/p1').set(auth(asha));
    expect(store.objects.size).toBe(0);
    expect(await db.userProfile.count()).toBe(0);
  });

  it('a failed delete in S3 keeps the profile so the app tries again', async () => {
    await put(asha, profile());
    setObjectStoreForTests({ ...store, delete: async () => { throw new Error('S3 down'); } });
    expect((await request(app).delete('/api/profiles/p1').set(auth(asha))).status).toBe(500);
    expect(await db.userProfile.count()).toBe(1);
  });
});

describe('turning it off', () => {
  beforeEach(() => setObjectStoreForTests(store));

  it('deletes the copies and refuses new ones until turned on again', async () => {
    await put(asha, profile());
    await putFile(asha, 'p1', PDF);
    await put(asha, profile('p2'));
    expect(store.objects.size).toBe(3);

    const res = await request(app).patch('/api/auth/me').set(auth(asha)).send({ profileSync: false });
    expect(res.body.user.profileSync).toBe(false);
    expect(await db.userProfile.count()).toBe(0);
    expect(store.objects.size).toBe(0);

    const refused = await put(asha, profile());
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('PROFILE_SYNC_OFF');
    expect((await putFile(asha, 'p1', PDF)).body.code).toBe('PROFILE_SYNC_OFF');
    expect((await request(app).get('/api/profiles').set(auth(asha))).body.profileSync).toBe(false);
    expect((await request(app).get('/api/auth/me').set(auth(asha))).body.user.profileSync).toBe(false);

    await request(app).patch('/api/auth/me').set(auth(asha)).send({ profileSync: true });
    expect((await put(asha, profile())).status).toBe(200);
  });
});

describe('the user’s own data', () => {
  it('includes the profiles in "Download my data"', async () => {
    await put(asha, profile());
    const res = await request(app).get('/api/auth/me/export').set(auth(asha));
    expect(res.status).toBe(200);
    expect(res.body.profiles).toHaveLength(1);
    expect(res.body.profiles[0]).toMatchObject({ name: 'Google SDE', company: 'Google', resumeFileKept: false, profile: { cv: SECRET_RESUME, answers: [{ question: 'Tell me about yourself' }] } });
  });

  it('closing the account deletes the profiles and their files', async () => {
    setObjectStoreForTests(store);
    await put(asha, profile());
    await putFile(asha, 'p1', PDF);
    const res = await request(app).post('/api/auth/me/delete').set(auth(asha)).send({ password: 'password123' });
    expect(res.status).toBe(200);
    expect(await db.userProfile.count()).toBe(0);
    expect(store.objects.size).toBe(0);
  });
});

describe('admin', () => {
  it('lists a user’s profiles, opens one and gets a download link for the resume file, all in the audit log', async () => {
    setObjectStoreForTests(store);
    await put(asha, profile());
    await putFile(asha, 'p1', PDF);
    const user = await db.user.findUniqueOrThrow({ where: { email: 'asha@example.com' } });

    const detail = await request(app).get(`/api/admin/users/${user.id}`).set(auth(admin));
    expect(detail.body.profiles).toHaveLength(1);
    const listed = detail.body.profiles[0];
    expect(listed).toMatchObject({ name: 'Google SDE', company: 'Google', jobTitle: 'Senior Software Engineer', storage: 'S3', hasResumeFile: true });
    expect(listed.sizeBytes).toBeGreaterThan(0);
    expect(JSON.stringify(detail.body)).not.toContain('Flipkart');

    const view = await request(app).get(`/api/admin/users/${user.id}/profiles/${listed.id}`).set(auth(admin));
    expect(view.status).toBe(200);
    expect(view.body.profile.cv).toBe(SECRET_RESUME);

    const file = await request(app).get(`/api/admin/users/${user.id}/profiles/${listed.id}/resume-file`).set(auth(admin));
    expect(file.body.url).toContain(`profiles/${user.id}/p1/resume`);
    expect(file.body.expiresIn).toBeLessThanOrEqual(600);

    const log = await db.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    expect(log.map(l => [l.action, l.target])).toEqual([['profile.view', 'asha@example.com'], ['profile.resume_download', 'asha@example.com']]);

    // Another user's id in the path doesn't open it
    const adminUser = await db.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } });
    expect((await request(app).get(`/api/admin/users/${adminUser.id}/profiles/${listed.id}`).set(auth(admin))).status).toBe(404);
  });
});
