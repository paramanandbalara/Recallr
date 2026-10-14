import { completeChat, streamChat, type ProviderId } from './llm';
import { fillPlaceholders, newId, type PreparedAnswer, type Settings } from './storage';

// Keep prompts well inside the model's context window (and short, for speed)
const MAX_CV_CHARS = 12000;
const MAX_JOB_CHARS = 6000;
const MAX_BANK_CHARS = 10000;
const MAX_NOTES_CHARS = 6000;

// Earlier conversation sent with each question, most recent first to keep (~5k tokens: plenty of
// context while keeping answers fast). The full history is still kept and shown in the app.
const MAX_HISTORY_CHARS = 20000;

// Words and habits that make text read as AI-written; shared by every prompt that writes in the candidate's voice
const NO_AI_STYLE = `- Never use words or phrases that sound AI-written: "Great question", "Certainly", "Absolutely", "I'd be happy to",
  "delve", "dive into", "leverage", "utilize", "robust", "seamless", "streamline", "harness", "foster", "elevate", "empower",
  "crucial", "pivotal", "paramount", "comprehensive", "holistic", "intricate", "meticulous", "cutting-edge", "game-changer",
  "synergy", "landscape", "realm", "tapestry", "testament", "navigate" (for anything but a map), "spearheaded",
  "ensure", "enhance", "facilitate", "optimal", "numerous", "various", "notably", "essentially", "in essence", "in order to",
  "Furthermore", "Moreover", "Additionally", "It's worth noting", "In summary", "In conclusion", "Overall,", "Ultimately,",
  "at the end of the day", "in today's fast-paced world", "key takeaway". Use the plain everyday word instead (use, make sure, improve, help, also).
- No long dashes (—) and no semicolons; people don't speak in them. No neat groups of three, and no tidy moral or summary at the end.
- No AI sentence patterns: "First… Second… Finally", "Not only… but also", "It's not just X, it's Y", "This allows/ensures/enables…",
  "on one hand… on the other", a colon followed by a list, or ending with a question back to the interviewer.`;

const SYSTEM_PROMPT_BASE = `
You are the candidate in a live job interview. Write exactly what you say out loud next, in the first person ("I", "we", "my team").
It must read like a real person talking off the top of their head, not like something written by an AI.

SOUND HUMAN
- Spoken English, the way people actually talk in interviews: relaxed, confident, a bit informal. Use contractions (I'm, we'd, didn't, that's).
- Let it flow as speech, in one to three natural paragraphs. Don't break it into a new line per sentence, and never use lists.
- Start straight with the answer itself, the way a confident person does. Never open with filler or a reaction to the question:
  no "Sure", "Yeah", "So,", "Well,", "Okay", "Honestly", "Of course", "Thanks for asking", "Good question", "That's a great question".
  Don't sprinkle "honestly" or "to be honest" anywhere else either.
- Nobody talks perfectly, so don't write perfectly. Explain things from memory, the way you'd actually say them:
  - simple everyday words, short plain sentences, some joined loosely with "and" or "but";
  - now and then (once per answer at most) go back and rephrase mid-sentence ("it sits in front of the service, well, more like a queue really")
    or correct a detail ("we had around ten, actually closer to twelve carriers");
  - if you're less sure of a small detail, say so briefly ("I think it was around 2 seconds") instead of sounding exact;
  - you don't have to cover everything. Leave out minor details a person wouldn't think to mention.
  Stay confident overall: a little rough, not hesitant or rambling.
- Mix short and longer sentences. Don't make every sentence perfectly structured or parallel.
${NO_AI_STYLE}
- No markdown, no headings, no bold, no bullet points, no emojis. When you name a specific function, command, keyword, class or table,
  you may wrap just that name in backticks (e.g. \`useEffect\`, \`GROUP BY\`) so it stands out on screen.

CODE AND QUERIES
- Only when the interviewer asks you to write, fix or show code (a SQL query, a function, a regex, a command): say a sentence or two the way
  you'd talk while starting to write it, then give the code in ONE fenced code block with its language (e.g. \`\`\`sql), then a sentence or two
  on why you wrote it that way (an edge case, or the complexity if it matters).
- Write the code a person would write in an interview: short, plain names, no clever tricks, no boilerplate. At most one or two short comments,
  written like a person's note ("// skip empty rows"), never AI-style ("// This function efficiently handles...").
- Never use a code block for a normal question, even a technical one. Talk it through instead.

WHAT TO SAY
- Answer the question directly, then add the detail a real person would: how you did it, why, and what happened.
- Technical questions: explain it the way an experienced engineer would talk it through with a colleague, with the key idea first,
  then the parts that matter, and a real example from your own work if one fits. Go as deep as the question needs.
- "What is X?", "Explain Y", "Difference between A and B": NEVER recite a textbook or documentation definition word for word.
  No real person says "X is a <formal definition>" in an interview. Explain it the way you understand it from using it:
  what it's for or what problem it solves, in plain words, then roughly how it works, then where you've used it.
  Use your own wording, not the standard phrasing. A slightly rough, incomplete explanation in your own words is better than a perfect
  one: it's fine to be a little approximate, to reach for a quick analogy, or to say how you think about it.
  Pick the two or three points that matter in practice, not every property.
- Questions about you, your experience or behaviour: tell it as a real story from your own background (situation, what you did, result).
- Length: whatever a person would naturally say for this question. A quick question gets a sentence or two;
  "tell me about…" or a design question can run a few paragraphs. Don't pad, don't cut it short.
- Stay consistent with what you already said earlier in this interview (see the conversation). Don't repeat a story you already told unless asked.
- Use ONLY employers, projects, numbers and skills found in the context below. Never invent any.
- If a prepared answer fits, keep its facts and story but say it fresh, in your own spoken words. Never copy its sentences.
- If what was just heard isn't really a question or prompt for you (small talk you'd just nod at, the interviewer mid-sentence, noise), reply exactly: EMPTY
`;

export interface PastTurn {
  question: string;
  answer: string;
  spoken?: string; // What the candidate actually said, when the mic was heard too
}

// Earlier turns as a transcript, keeping the most recent ones that fit the budget
const formatHistory = (history: PastTurn[]) => {
  const lines: string[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const { question, answer } = history[i];
    const entry = `Interviewer: ${question}${answer ? `\nYou: ${answer}` : ''}`;
    if (used + entry.length > MAX_HISTORY_CHARS) break;
    lines.unshift(entry);
    used += entry.length;
  }
  return lines.join('\n\n');
};

const formatBank = (answers: PreparedAnswer[], company: string) => {
  const text = answers
    .filter(a => a.question.trim() && a.answer.trim())
    .map(a => `Q: ${a.question}\nA: ${fillPlaceholders(a.answer, company)}`)
    .join('\n\n');
  return text.slice(0, MAX_BANK_CHARS) || 'None';
};

const buildContext = (settings: Settings) => `
[CANDIDATE CONTEXT]
Resume/Experience: ${settings.cv.slice(0, MAX_CV_CHARS) || 'Not provided'}
Target company: ${settings.company || 'Not provided'}
Company research (use real details from here when asked about the company, e.g. "Why us?"): ${settings.companyNotes.slice(0, MAX_NOTES_CHARS) || 'Not provided'}
Job description: ${settings.job.slice(0, MAX_JOB_CHARS) || 'Not provided'}

[PREPARED ANSWERS]
${formatBank(settings.answers, settings.company)}
`;

// AI-sounding words the model still slips in, swapped for what a person would say (spoken text only, never code)
const PLAIN_WORDS: [string, string][] = [
  ['utilize', 'use'], ['utilizes', 'uses'], ['utilized', 'used'], ['utilizing', 'using'],
  ['leverage', 'use'], ['leverages', 'uses'], ['leveraged', 'used'], ['leveraging', 'using'],
  ['ensure', 'make sure'], ['ensures', 'makes sure'], ['ensured', 'made sure'], ['ensuring', 'making sure'],
  ['enhance', 'improve'], ['enhances', 'improves'], ['enhanced', 'improved'], ['enhancing', 'improving'],
  ['facilitate', 'help'], ['facilitates', 'helps'], ['facilitated', 'helped'], ['facilitating', 'helping'],
  ['streamline', 'simplify'], ['streamlines', 'simplifies'], ['streamlined', 'simplified'], ['streamlining', 'simplifying'],
  ['showcase', 'show'], ['showcases', 'shows'], ['showcased', 'showed'], ['showcasing', 'showing'],
  ['spearheaded', 'led'], ['spearheading', 'leading'], ['commenced', 'started'], ['commence', 'start'],
  ['delve into', 'get into'], ['delved into', 'got into'], ['delving into', 'getting into'], ['dive into', 'get into'],
  ['furthermore', 'also'], ['moreover', 'also'], ['additionally', 'also'], ['notably', 'especially'],
  ['essentially', 'basically'], ['in essence', 'basically'], ['in order to', 'to'],
  ['crucial', 'important'], ['pivotal', 'key'], ['paramount', 'really important'], ['optimal', 'best'],
  ['robust', 'solid'], ['seamless', 'smooth'], ['seamlessly', 'smoothly'], ['meticulous', 'careful'], ['meticulously', 'carefully'],
  ['comprehensive', 'full'], ['numerous', 'many'], ['a plethora of', 'a lot of'], ['a myriad of', 'a lot of'],
];
const PLAIN_WORD_PATTERN = new RegExp(`\\b(${PLAIN_WORDS.map(([word]) => word).sort((a, b) => b.length - a.length).join('|')})\\b`, 'gi');
const PLAIN_WORD_MAP = new Map(PLAIN_WORDS);

const plainWords = (text: string) => text
  .replace(PLAIN_WORD_PATTERN, match => {
    const plain = PLAIN_WORD_MAP.get(match.toLowerCase()) ?? match;
    return match[0] === match[0].toUpperCase() ? plain.charAt(0).toUpperCase() + plain.slice(1) : plain;
  })
  .replace(/(^|[.!?]\s+)(?:honestly|to be honest),\s*(\w)/gi, (_m, before: string, next: string) => before + next.toUpperCase())
  .replace(/\b(?:honestly|to be honest),\s*/gi, '')
  .replace(/,\s*(?:honestly|to be honest)\b/gi, '');

// Leaves `names` in backticks alone
const plainWordsOutsideCode = (line: string) =>
  line.split(/(`[^`]*`)/).map(part => (part.startsWith('`') ? part : plainWords(part))).join('');

// Filler a model opens with even when told not to ("Sure, honestly, ..."); removed from the start of an answer
const FILLER_OPENER = /^(?:(?:sure|yeah|yes|so|well|okay|ok|right|honestly|of course|absolutely|certainly|great question|good question|that's a (?:great|good) question|thanks for asking(?: that)?|thank you for asking(?: that)?)(?:\s*[,.!:]+|\s+[—-]+)\s*)+/i;

const stripFillerOpener = (text: string) => {
  const stripped = text.replace(FILLER_OPENER, '');
  return stripped === text || !stripped ? text : stripped.charAt(0).toUpperCase() + stripped.slice(1);
};

// Plain spoken text: strip quotes, any markdown the model slipped in, long dashes and filler openers. Code blocks are kept exactly.
const cleanAnswer = (text: string) => {
  const lines: string[] = [];
  let inCode = false;
  for (const raw of text.trim().replace(/^"|"$/g, '').split('\n')) {
    if (/^\s*```/.test(raw)) {
      inCode = !inCode;
      lines.push(raw.trim());
    } else if (inCode) {
      lines.push(raw.replace(/\s+$/, ''));
    } else {
      const line = raw.trim()
        .replace(/\*\*|__/g, '')
        .replace(/^#+\s*/, '')
        .replace(/^[-*•]\s+/, '')
        .replace(/\s*—\s*/g, ', ');
      if (line) lines.push(plainWordsOutsideCode(line));
    }
  }
  return stripFillerOpener(lines.join('\n'));
};

// Ways to redo an answer from the buttons under it
export type AdjustMode = 'regenerate' | 'shorter' | 'longer' | 'simpler' | 'technical';

const ADJUST_INSTRUCTIONS: Record<AdjustMode, string> = {
  regenerate: 'Answer it again from a different angle (another example or emphasis), not a rewording of what you said before.',
  shorter: 'Say it again in about half the words. Keep the main point and drop the rest.',
  longer: 'Say it again with more detail: how you did it, why, and a concrete example from your experience.',
  simpler: 'Say it again in simpler, everyday words, as if to a non-technical interviewer. No jargon.',
  technical: 'Say it again with more technical depth: specific technologies, how it works under the hood, and the trade-offs.',
};

export interface AnswerOptions {
  prepared?: PreparedAnswer; // The user's own answer to retell naturally
  adjust?: { mode: AdjustMode; previous: string }; // Redo an earlier answer to this question
  signal?: AbortSignal;
  onFirstText?: (provider: ProviderId) => void;
}

// Streams the answer; onText receives the full text so far. Returns the final answer ('' if none).
// `history` is the conversation before this question.
export const streamInterviewAnswer = async (
  question: string,
  history: PastTurn[],
  settings: Settings,
  onText: (text: string) => void,
  { prepared, adjust, signal, onFirstText }: AnswerOptions = {},
): Promise<string> => {
  if (!question || question.trim().length < (adjust ? 1 : 10)) return '';

  const earlier = formatHistory(history);
  const preparedHint = prepared
    ? `\n\nYou prepared this answer for this question. Keep its facts and story, but say it fresh, in your own spoken words:\n<<<${fillPlaceholders(prepared.answer, settings.company)}>>>`
    : '';
  const adjustHint = adjust
    ? `\n\nYou already answered this with:\n<<<${adjust.previous}>>>\n${ADJUST_INSTRUCTIONS[adjust.mode]}`
    : '';

  const text = await streamChat(settings, {
    tier: 'fast',
    system: SYSTEM_PROMPT_BASE + buildContext(settings),
    user: `${earlier ? `The interview so far:\n${earlier}\n\n` : ''}The interviewer just said:\n"${question}"${preparedHint}${adjustHint}\n\nWhat you say:`,
    temperature: 0.85, // A little more variety, like real speech
    maxTokens: 2000, // Room for long answers (includes the model's brief reasoning)
    signal,
    onFirstText,
  }, partial => onText(cleanAnswer(partial)));

  const answer = cleanAnswer(text);
  return /^EMPTY\.?$/i.test(answer) ? '' : answer;
};

export interface FollowUp {
  question: string;
  hint: string;
}

export interface AnswerExtras {
  keyPoints: string[];
  followUps: FollowUp[];
}

const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

// After an answer: a few key points to glance at, and the questions the interviewer will likely ask next
export const answerExtras = async (question: string, answer: string, settings: Settings): Promise<AnswerExtras> => {
  const response = await completeChat(settings, {
    tier: 'fast',
    json: true,
    system: `You coach a candidate during a live job interview. Given the question and the answer the candidate is giving, return JSON:
{"keyPoints":["..."],"followUps":[{"question":"...","hint":"..."}]}
- "keyPoints": 3 or 4 very short cues (2–5 words each) that would remind the candidate of the whole answer at a glance. No full sentences.
- "followUps": the 2 or 3 questions the interviewer is most likely to ask next about this answer. "hint" is one short line on how the candidate should answer, using only facts from their resume.
${buildContext({ ...settings, answers: [] })}`,
    user: `Question: ${question}\n\nAnswer: ${answer}`,
    temperature: 0.3,
    maxTokens: 1500,
  });

  const parsed = JSON.parse(response || '{}');
  return {
    keyPoints: (Array.isArray(parsed.keyPoints) ? parsed.keyPoints : []).map(asText).filter(Boolean).slice(0, 4),
    followUps: (Array.isArray(parsed.followUps) ? parsed.followUps : [])
      .map((f: Partial<FollowUp>) => ({ question: asText(f?.question), hint: asText(f?.hint) }))
      .filter((f: FollowUp) => f.question)
      .slice(0, 3),
  };
};

// ---------- Interview review ----------

export interface WeakSpot {
  question: string;
  why: string;
  fix: string;
}

export interface InterviewReview {
  createdAt: number;
  summary: string;
  topics: string[];        // What was asked about
  weakSpots: WeakSpot[];
  prepareNext: string[];
  email: { subject: string; body: string };
}

const MAX_TRANSCRIPT_CHARS = 30000;

// A review of a finished interview. Where the mic was heard, it judges what the candidate actually said;
// elsewhere only the suggested answers are known, so it judges the evidence rather than the delivery.
export const reviewInterview = async (turns: PastTurn[], settings: Settings): Promise<Omit<InterviewReview, 'createdAt'>> => {
  const transcript = turns
    .filter(t => t.question.trim())
    .map(t => [
      `Interviewer: ${t.question}`,
      t.answer && `Suggested answer: ${t.answer}`,
      t.spoken && `Candidate actually said: ${t.spoken}`,
    ].filter(Boolean).join('\n'))
    .join('\n\n')
    .slice(0, MAX_TRANSCRIPT_CHARS);

  const response = await completeChat(settings, {
    tier: 'quality',
    json: true,
    system: `You review a job interview for the candidate, right after it ended. You get the interviewer's questions, the answers that were suggested to the candidate live, and, where it was recorded, what the candidate actually said. Judge what they actually said whenever you have it (clarity, whether it answered the question, missing evidence); otherwise judge the suggested answer. Return JSON:
{"summary":"...","topics":["..."],"weakSpots":[{"question":"...","why":"...","fix":"..."}],"prepareNext":["..."],"email":{"subject":"...","body":"..."}}
- "summary": 2–3 sentences: what the interview focused on and how well the candidate's background fit it.
- "topics": 3–8 short labels for what was covered.
- "weakSpots": up to 4 questions where the resume gave thin evidence or the answer was vague or risky. "why" says what was weak; "fix" is a concrete thing to prepare or say next time.
- "prepareNext": 3–6 concrete things to prepare for the next round, based on this interview and the job description.
- "email": a short thank-you email from the candidate (under 150 words) that mentions one or two specific things discussed. Use [Interviewer name] for the name, and sign with the candidate's name if the resume has it.
Use only facts from the transcript and the candidate context. Plain text inside the JSON, no markdown.
${buildContext({ ...settings, answers: [] })}`,
    user: transcript || 'No questions were asked.',
    temperature: 0.3,
    maxTokens: 6000,
  });

  const parsed = JSON.parse(response || '{}');
  const list = (value: unknown) => (Array.isArray(value) ? value.map(asText).filter(Boolean) : []);
  return {
    summary: asText(parsed.summary),
    topics: list(parsed.topics),
    weakSpots: (Array.isArray(parsed.weakSpots) ? parsed.weakSpots : [])
      .map((w: Partial<WeakSpot>) => ({ question: asText(w?.question), why: asText(w?.why), fix: asText(w?.fix) }))
      .filter((w: WeakSpot) => w.question),
    prepareNext: list(parsed.prepareNext),
    email: { subject: asText(parsed.email?.subject), body: asText(parsed.email?.body) },
  };
};

// ---------- Question from the screen ----------

// Finds the one interview question in screenshots full of other text. Returns '' if there is none.
export const readQuestionFromScreen = async (images: string[], settings: Settings): Promise<string> => {
  const text = await completeChat(settings, {
    tier: 'vision',
    images,
    system: `You look at screenshots of a candidate's screen${images.length > 1 ? 's' : ''} during a job interview and find the question they are being asked.
The screen can be full of other text: browser tabs, menus, the video call, chat messages, notifications, documents, an editor, the candidate's own notes. Ignore all of that.
The question can be a coding or SQL problem, a question typed in the meeting chat, a question on a shared screen or slide, or an online assessment question.
- Return the question text exactly as written, complete: for a coding problem include the constraints, examples and any code it refers to.
- If several questions are visible, pick the one being asked of the candidate right now: the newest one in a chat, or the one that's in focus.
- Return only the question text, nothing else. If there's no interview question on screen, return exactly: NONE`,
    user: 'Find the interview question on this screen.',
    temperature: 0,
    maxTokens: 2000,
  });
  const question = text.trim().replace(/^"|"$/g, '').trim();
  return /^NONE\.?$/i.test(question) ? '' : question;
};

// Draft a first-person answer to one question, for the user to edit in their answer bank
export const draftPreparedAnswer = async (question: string, settings: Settings): Promise<string> => {
  const text = await completeChat(settings, {
    tier: 'quality',
    system: `You help a candidate prepare for a job interview. Write their answer to the question in the first person, in natural spoken English, 60–120 words, using ONLY facts from their resume. Never invent employers, numbers or projects. Plain text, no markdown. Return only the answer text.\n${NO_AI_STYLE}\n${buildContext({ ...settings, answers: [] })}`,
    user: question,
    temperature: 0.5,
    maxTokens: 1200,
  });
  return cleanAnswer(text);
};

// ---------- Generated prepared answers ----------

const SPOKEN_ANSWER_RULES = `Each "answer" is what the candidate would say out loud: first person, natural spoken English, plain words, contractions,
not polished or textbook-like, 60–150 words. Use ONLY facts from the resume: never invent employers, projects, numbers or skills.
Plain text, no markdown, no lists.
${NO_AI_STYLE}`;

const parseGeneratedAnswers = (response: string): PreparedAnswer[] => {
  const parsed = JSON.parse(response || '{}');
  return (Array.isArray(parsed.items) ? parsed.items : [])
    .map((item: Partial<PreparedAnswer>) => ({
      id: newId(),
      question: asText(item?.question),
      notes: asText(item?.notes) || undefined,
      answer: cleanAnswer(asText(item?.answer)),
    }))
    .filter((item: PreparedAnswer) => item.question && item.answer);
};

// The questions this job will most likely bring up, with an answer to each drafted from the resume
export const answersFromJobDescription = async (settings: Settings): Promise<PreparedAnswer[]> => {
  const response = await completeChat(settings, {
    tier: 'quality',
    json: true,
    system: `You help a candidate prepare for an interview for the job below. Predict the 8 to 12 questions they are most likely to be asked
for THIS job: the main skills and responsibilities in the job description, how the resume fits or falls short of them, and the company.
Mix technical and experience questions, and include one about a gap between the resume and the job if there is one. Skip generic ones like "Tell me about yourself".
Return JSON: {"items":[{"question":"...","notes":"...","answer":"..."}]}
- "notes": one short tip, e.g. which project to mention or what the interviewer is really checking.
${SPOKEN_ANSWER_RULES}
${buildContext({ ...settings, answers: [] })}`,
    user: 'Write the likely questions and draft answers.',
    temperature: 0.5,
    maxTokens: 12000,
  });
  return parseGeneratedAnswers(response);
};

// Real stories from the resume, ready to reuse for behavioural questions
export const storiesFromResume = async (settings: Settings): Promise<PreparedAnswer[]> => {
  const response = await completeChat(settings, {
    tier: 'quality',
    json: true,
    system: `Find 5 to 8 real stories in the candidate's resume that they can tell in behavioural interview questions:
a hard technical problem, a conflict or disagreement, a failure or mistake, leading people or a project, a tight deadline, improving something
(performance, cost, process), and going beyond the role. Only use what the resume actually supports; skip a type if there's no story for it.
Return JSON: {"items":[{"question":"...","notes":"...","answer":"..."}]}
- "question": the behavioural question this story answers best, e.g. "Tell me about a time you disagreed with your manager".
- "notes": a few words naming the story and other questions it also fits, e.g. "Payments outage story. Also fits: pressure, ownership".
- "answer": the story told as situation, what you did, and the result, but as natural speech, not with those labels.
${SPOKEN_ANSWER_RULES}
${buildContext({ ...settings, answers: [] })}`,
    user: 'Find the stories in my resume.',
    temperature: 0.5,
    maxTokens: 12000,
  });
  return parseGeneratedAnswers(response);
};

// Fallback when the AI can't split a document: first line is the question, the rest is the answer
const fallbackSplit = (text: string): PreparedAnswer[] => {
  const [first, ...rest] = text.trim().split('\n');
  return [{ id: newId(), question: first.trim(), answer: rest.join('\n').trim() }];
};

// Turn a pasted or uploaded document of prepared answers into separate Q&A cards
export const structurePreparedAnswers = async (text: string, settings: Settings): Promise<PreparedAnswer[]> => {
  try {
    const response = await completeChat(settings, {
      tier: 'quality',
      json: true,
      system: `Split the candidate's interview preparation document into separate questions and answers.
Return JSON: {"items":[{"question":"...","notes":"...","answer":"..."}]}
- "question": the interview question exactly as written.
- "notes": any coaching tip or instruction under the question (e.g. "Keep it to 60–90 seconds"), or "".
- "answer": the candidate's prepared answer, copied VERBATIM. Join lines that were only broken by page width into normal paragraphs. Do not summarize or rewrite.
If the document has no explicit questions, infer a short question for each answer.`,
      user: text.slice(0, 40000),
      temperature: 0,
      maxTokens: 16000,
    });

    const parsed = JSON.parse(response || '{}');
    const items: PreparedAnswer[] = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter((item: Partial<PreparedAnswer>) => item?.question && item?.answer)
      .map((item: PreparedAnswer) => ({
        id: newId(),
        question: String(item.question).trim(),
        notes: item.notes ? String(item.notes).trim() : undefined,
        answer: String(item.answer).trim(),
      }));

    return items.length > 0 ? items : fallbackSplit(text);
  } catch (error) {
    console.error('Structuring error:', error);
    return fallbackSplit(text);
  }
};
