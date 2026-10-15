import type { QuestionCategory } from '@prisma/client';
import { db } from './db.js';
import { CATEGORY_PAGES, questionHash } from './questions.js';

// Company question packs: the questions people were asked in interviews at one company, gathered from the
// company on the profile each answered question was recorded with (SavedAnswer.company). Only questions:
// never anyone's answers or names, and a company only shows once enough different people were asked there.

// A company needs questions from at least this many different users before anyone sees its pack
export const MIN_COMPANY_USERS = 3;

// Words that don't change which company it is: "Infosys Ltd", "Infosys Limited" and "INFOSYS" are one company
const SUFFIXES = new Set([
  'pvt', 'private', 'ltd', 'limited', 'inc', 'incorporated', 'llc', 'llp', 'plc', 'gmbh', 'corp', 'corporation',
  'co', 'company', 'technologies', 'technology', 'tech', 'solutions', 'india', 'com',
]);

// "Tata Consultancy Services Pvt. Ltd." → "tata consultancy services"; '' when nothing is left
export const normalizeCompany = (name: string) => {
  const words = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // Accents
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words[0] === 'the' && words.length > 1) words.shift();
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(' ').slice(0, 120);
};

// The address of a company's page: "tata-consultancy-services"
export const companySlug = (key: string) => key.replace(/ /g, '-');

// What the app sends, as it's stored: one clean line
export const cleanCompany = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, 200);

export interface CompanySummary {
  name: string;
  slug: string;
  questionCount: number;
}

interface CompanyGroup {
  key: string;
  users: Set<string>;
  spellings: Map<string, Set<string>>; // How it was written → who wrote it that way
}

// Every company with its spellings and users, merged by the normalized name
const companyGroups = async () => {
  const rows = await db.savedAnswer.groupBy({ by: ['company', 'userId'], where: { company: { not: '' } } });
  const groups = new Map<string, CompanyGroup>();
  for (const row of rows) {
    const key = normalizeCompany(row.company);
    if (!key) continue;
    const group = groups.get(key) ?? { key, users: new Set(), spellings: new Map() };
    group.users.add(row.userId);
    const spelling = group.spellings.get(row.company) ?? new Set<string>();
    spelling.add(row.userId);
    group.spellings.set(row.company, spelling);
    groups.set(key, group);
  }
  return [...groups.values()].filter(g => g.users.size >= MIN_COMPANY_USERS);
};

// One spelling without its "Pvt. Ltd." ending, keeping how it was capitalized: "Infosys Ltd." → "Infosys"
export const displayCompany = (name: string) => {
  const words = cleanCompany(name).split(' ');
  while (words.length > 1 && SUFFIXES.has(normalizeCompany(words[words.length - 1]) || words[words.length - 1].toLowerCase())) words.pop();
  return words.join(' ').replace(/[,.\s]+$/, '');
};

// The way most people wrote it; ties go to a capitalized one, then the shorter one
const displayName = (group: CompanyGroup) => {
  const users = new Map<string, Set<string>>();
  for (const [spelling, who] of group.spellings) {
    const name = displayCompany(spelling);
    users.set(name, new Set([...(users.get(name) ?? []), ...who]));
  }
  const capitalized = (s: string) => (/\p{Lu}/u.test(s) ? 1 : 0);
  return [...users.entries()]
    .sort(([a, aUsers], [b, bUsers]) => bUsers.size - aUsers.size || capitalized(b) - capitalized(a) || a.length - b.length || a.localeCompare(b))[0][0];
};

interface PackQuestion {
  text: string;
  category: QuestionCategory;
  users: Set<string>;
  slug: string | null; // The bank question's page, when it's published
}

const packQuestions = async (group: CompanyGroup) => {
  const rows = await db.savedAnswer.findMany({
    where: { company: { in: [...group.spellings.keys()] } },
    select: { questionText: true, category: true, userId: true, question: { select: { slug: true, published: true } } },
  });
  const questions = new Map<string, PackQuestion>();
  for (const row of rows) {
    const hash = questionHash(row.questionText);
    const q = questions.get(hash) ?? { text: row.questionText, category: row.category, users: new Set<string>(), slug: null };
    q.users.add(row.userId);
    if (row.question?.published && row.question.slug) q.slug = row.question.slug;
    questions.set(hash, q);
  }
  return [...questions.values()].sort((a, b) => b.users.size - a.users.size || a.text.localeCompare(b.text));
};

// Companies with a pack, most questions first; `search` matches the name
export const listCompanies = async (search = ''): Promise<CompanySummary[]> => {
  const wanted = normalizeCompany(search);
  const groups = (await companyGroups()).filter(g => !wanted || g.key.includes(wanted));
  if (!groups.length) return [];
  // One read for all of them: the different questions under each company's spellings
  const rows = await db.savedAnswer.findMany({
    where: { company: { in: groups.flatMap(g => [...g.spellings.keys()]) } },
    select: { company: true, questionText: true },
  });
  const questions = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = normalizeCompany(row.company);
    const set = questions.get(key) ?? new Set<string>();
    set.add(questionHash(row.questionText));
    questions.set(key, set);
  }
  return groups
    .map(g => ({ name: displayName(g), slug: companySlug(g.key), questionCount: questions.get(g.key)?.size ?? 0 }))
    .sort((a, b) => b.questionCount - a.questionCount || a.name.localeCompare(b.name));
};

export interface CompanyPack {
  company: { name: string; slug: string };
  questions: { text: string; category: QuestionCategory; categorySlug: string; askedBy: number; slug: string | null }[];
}

// The pack for a company name as anyone writes it (or its page address); null when there isn't one yet
export const companyPack = async (company: string, limit = 200): Promise<CompanyPack | null> => {
  const key = normalizeCompany(company);
  if (!key) return null;
  const group = (await companyGroups()).find(g => g.key === key);
  if (!group) return null;
  const questions = (await packQuestions(group)).slice(0, limit);
  return {
    company: { name: displayName(group), slug: companySlug(group.key) },
    questions: questions.map(q => ({ text: q.text, category: q.category, categorySlug: CATEGORY_PAGES[q.category].slug, askedBy: q.users.size, slug: q.slug })),
  };
};
