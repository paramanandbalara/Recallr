import crypto from 'node:crypto';
import type { QuestionCategory } from '@prisma/client';

// The question bank: interview questions as the app heard them, stored once each.

// The app's question kinds (desktop/src/services/questionDetect.ts) and the database's categories
export const CATEGORY_FROM_KIND: Record<string, QuestionCategory> = {
  'about-you': 'ABOUT_YOU',
  experience: 'EXPERIENCE',
  coding: 'CODING',
  design: 'SYSTEM_DESIGN',
  concept: 'CONCEPT',
  other: 'OTHER',
};

// How each category is named and addressed on the website
export const CATEGORY_PAGES: Record<QuestionCategory, { slug: string; title: string; text: string }> = {
  ABOUT_YOU: { slug: 'hr', title: 'HR and “about you” questions', text: 'Tell me about yourself, why this company, strengths and weaknesses, and where you see yourself.' },
  EXPERIENCE: { slug: 'behavioral', title: 'Behavioral questions', text: 'Tell me about a time…: conflict, failure, leadership and the projects you are proud of.' },
  CODING: { slug: 'coding', title: 'Coding questions', text: 'Problems interviewers ask you to solve in code, and how to talk through your approach.' },
  SYSTEM_DESIGN: { slug: 'system-design', title: 'System design questions', text: 'Design a service end to end: requirements, data, scale and trade-offs.' },
  CONCEPT: { slug: 'technical', title: 'Technical concept questions', text: 'Explain how something works: languages, databases, networking and more.' },
  OTHER: { slug: 'general', title: 'General interview questions', text: 'Everything else interviewers ask.' },
};

export const categoryFromSlug = (slug: string) =>
  (Object.entries(CATEGORY_PAGES) as [QuestionCategory, { slug: string }][]).find(([, page]) => page.slug === slug)?.[0];

// One clean line, as a question would be written
export const cleanQuestion = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 500);

// Worth keeping: a real question, not "Okay." or a fragment
export const isRealQuestion = (text: string) => text.length >= 12 && text.split(' ').length >= 3;

// The same question asked with different punctuation or case is one question
export const questionHash = (text: string) =>
  crypto.createHash('sha256').update(text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()).digest('hex');

// "How would you design a URL shortener?" → "how-would-you-design-a-url-shortener"
export const slugify = (text: string) =>
  text.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '') || 'question';
