// Career tools on the Recallr server (resume score, interviewer insights). They use the best AI model,
// take up to a minute or two, count against the plan, and are saved to the account so the full report
// can be opened on the website. Never part of live answers.

import { request } from './account';

export interface ResumeCheckResult {
  id: string;
  overall: number;
  ats: number;
  summary: string;
  good: { point: string; why: string }[];
  bad: { point: string; why: string; fix: string }[];
}

export interface InterviewerInsights {
  id: string;
  who: { name: string; role: string; seniority: string; background: string };
  questions: { question: string; why: string }[];
  tips: string[];
  askThem: { question: string; why: string }[];
}

const post = async <T>(path: string, body: object): Promise<{ id: string; result: T }> => {
  const res = await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return (await res.json() as { report: { id: string; result: T } }).report;
};

const orUndefined = (text: string) => text.trim() || undefined;

export const checkResume = async (resumeText: string, jobDescription = '') => {
  const report = await post<Omit<ResumeCheckResult, 'id'>>('/career/resume-score', { resumeText: resumeText.trim(), jobDescription: orUndefined(jobDescription) });
  return { ...report.result, id: report.id } as ResumeCheckResult;
};

export const fetchInterviewerInsights = async (interviewerText: string, resumeText = '', jobDescription = '') => {
  const report = await post<Omit<InterviewerInsights, 'id'>>('/career/interviewer-insights', {
    interviewerText: interviewerText.trim(), resumeText: orUndefined(resumeText), jobDescription: orUndefined(jobDescription),
  });
  return { ...report.result, id: report.id } as InterviewerInsights;
};

// A LinkedIn link instead of the profile's text: Recallr never opens LinkedIn pages
export const looksLikeLinkedInLink = (text: string) => /linkedin\.com/i.test(text) && text.trim().length < 300;

// The website page with the full report
export const reportPath = (tool: 'resume-score' | 'interviewer', id: string) => `/account/tools?tool=${tool}&report=${encodeURIComponent(id)}`;

// One line about the interviewer for the profile's "Interviewer" field (used to fit answers to who's asking)
export const interviewerSummary = (who: InterviewerInsights['who']) =>
  [[who.name, who.role].filter(Boolean).join(', '), who.seniority, who.background].filter(Boolean).join('. ').replace(/\.\./g, '.');
