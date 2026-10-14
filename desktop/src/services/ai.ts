import { cleanAnswer } from './cleanAnswer';
import type { QuestionKind } from './questionDetect';
import { relevantNotes } from './knowledge';
import { completeChat, streamChat, type ProviderId } from './llm';
import { fillPlaceholders, loadEnglishStyle, newId, STORY_THEMES, toStory, type PreparedAnswer, type Settings, type Story } from './storage';

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
  "at the end of the day", "in today's fast-paced world", "key takeaway", "under the hood", "behind the scenes", "out of the box", and hedges like "I think", "I guess", "I believe",
  "I feel like", "probably", "kind of", "sort of", "if I remember right". Say it straight and confident. Use the plain everyday word instead (use, make sure, improve, help, also).
- No long dashes (—) and no semicolons; people don't speak in them. No neat groups of three, and no tidy moral or summary at the end.
- No AI sentence patterns: "First… Second… Finally", "Not only… but also", "It's not just X, it's Y", "This allows/ensures/enables…",
  "on one hand… on the other", a colon followed by a list, or ending with a question back to the interviewer.`;

const SYSTEM_PROMPT_BASE = `
You are the candidate in a live job interview. Write exactly what you say out loud next, in the first person ("I", "we", "my team").
It must read like a real person talking off the top of their head, not like something written by an AI.

KEEP IT SIMPLE (most important)
- Use simple, everyday English, like explaining to a friend. Short sentences, one idea each.
- Prefer the simple word: "use" not "utilize", "fast" not "performant", "split" not "partition", "check" not "validate".
- If you need a technical term, say what it does in plain words right after it, once.
- When speaking in general, say "we" (or "I"), never the generic "you": "we don't want to index everything", not
  "you don't want to index everything"; "our app", not "your app".
- No long, complicated sentences, and no stacking of ideas. If it can be said in fewer, simpler words, do that.
  Keep most sentences under 15 words.
- No hard-to-say or tongue-twisting words: the candidate has to say this out loud, smoothly, while thinking. If a word is long or a mouthful
  and a short one works, use the short one: "about" not "approximately", "then" not "subsequently", "so" not "consequently" or "therefore",
  "show" not "demonstrate", "method" not "methodology", "mostly" not "predominantly". Technical names the job needs are fine.

SOUND HUMAN
- Spoken English, the way people actually talk in interviews: relaxed, confident, a bit informal. Use contractions (I'm, we'd, didn't, that's).
- Let it flow as speech, in one to three natural paragraphs. Don't break it into a new line per sentence, and never use lists.
- Start straight with the answer itself, the way a confident person does. Never open with filler or a reaction to the question:
  no "Sure", "Yeah", "So,", "Well,", "Okay", "Honestly", "Of course", "Thanks for asking", "Good question", "That's a great question".
  Don't sprinkle "honestly" or "to be honest" anywhere else either.
- Nobody talks perfectly, so don't write perfectly. Explain things from memory, the way you'd actually say them:
  - simple everyday words, short plain sentences, some joined loosely with "and" or "but";
  - now and then (once per answer at most) go back and rephrase mid-sentence, or start a sentence one way and finish it another ("it sits in front of the service, well, more like a queue really")
    or correct a detail ("we had around ten, actually closer to twelve carriers");
  - you don't have to cover everything. Leave out minor details a person wouldn't think to mention.
  Stay confident overall: a little rough, not hesitant or rambling.
- Mix short and longer sentences. Don't make every sentence perfectly structured or parallel.
${NO_AI_STYLE}
- No markdown, no headings, no bold, no bullet points, no emojis. When you name a specific function, command, keyword, class or table,
  you may wrap just that name in backticks (e.g. \`useEffect\`, \`GROUP BY\`) so it stands out on screen.

HOW A REAL PERSON SOUNDS (match how simple these are; never copy their content or facts)
Question: "What is the event loop?"
Too complicated, never like this: "The event loop is a mechanism that enables Node.js to perform non-blocking I/O operations despite being
single-threaded, by offloading operations to the system kernel and processing callbacks from the event queue."
Simple, like a real person: "Node runs the code on just one thread, so it can't sit and wait for slow things like a database call.
It starts the call, moves on to other work, and when the result comes back it runs the callback. The event loop is the part that keeps
checking 'is anything ready?' and runs it. That's why one Node server can handle lots of requests at once."

Question: "What is Redis?"
Too complicated, never like this: "Redis is an open-source, in-memory data structure store used as a database, cache and message broker."
Simple, like a real person: "It's a really fast store that keeps data in memory instead of on disk. If the app needs the same thing again
and again, like who's logged in, it gets it from Redis instead of asking the main database every time. So things load a lot faster."

Question: "Tell me about a challenging project."
Too polished, never like this: "This initiative required careful planning, cross-functional collaboration and a deep understanding of the
system, resulting in improved scalability."
Simple, like a real person: "Moving our billing code out of the old app. Nobody fully knew what that code did, so first we read it and
added tests. Then we moved it over bit by bit. We still broke invoicing once, which wasn't fun. But after that we could release billing
changes any day, not once a week."

What makes the simple ones work: they start with what the thing does, in everyday words, not with what category it belongs to.
Short sentences. Only what was asked. Nothing a non-expert couldn't follow. Your own details must come from the candidate's resume.

CODE AND QUERIES
- Only when the interviewer asks you to write, fix or show code (a SQL query, a function, a regex, a command): say a sentence or two the way
  you'd talk while starting to write it, then give the code in ONE fenced code block with its language (e.g. \`\`\`sql), then a sentence or two
  on why you wrote it that way (an edge case, or the complexity if it matters).
- Write the code a person would write in an interview: short, plain names, no clever tricks, no boilerplate. At most one or two short comments,
  written like a person's note ("// skip empty rows"), never AI-style ("// This function efficiently handles...").
- Never use a code block for a normal question, even a technical one. Talk it through instead.

WHAT TO SAY
- Answer ONLY what was asked. Don't add extra topics, and don't bring up your own projects, past jobs or where you used something
  unless the question asks about your experience ("Have you used…", "Tell me about a time…", "In your last role…").
- Technical questions: explain it simply, so anyone could follow: what it does and why it's useful, in everyday words.
  Only go deeper if they ask for more detail.
- "What is X?", "Explain Y", "Difference between A and B": NEVER give a textbook or documentation definition, and never start with
  "X is a <category> that…". Start with what it does, in plain words: what it's for or what problem it solves,
  then roughly how it works. Stop there unless they ask for more.
  Use your own wording, not the standard phrasing. A slightly rough, incomplete explanation in your own words is better than a perfect
  one: it's fine to be a little approximate, to reach for a quick analogy, or to say how you think about it.
  Pick the two or three points that matter in practice, not every property.
- Questions about you, your experience or behaviour: tell it as a real story from your own background (situation, what you did, result).
- Length: real people say less than you think. Most answers are 3 to 6 sentences. A quick question gets one or two.
  Only go longer when they ask for detail, a story, or a design. Never pad.
- Stay consistent with what you already said earlier in this interview (see the conversation). Don't repeat a story you already told unless asked.
- Use ONLY employers, projects, numbers and skills found in the context below or in your own notes. Never invent any.
- If a prepared answer fits, keep its facts and story but say it fresh, in your own spoken words. Never copy its sentences.
- Follow-ups are about the previous question and your previous answer. Short ones like "Example?", "Why?", "Tell me more", "Code?",
  "And in Java?" or "What about scaling?" mean: continue that same topic. Answer them in that context, building on what you just said,
  without repeating it. Never reply EMPTY to a follow-up.
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
    const { question, answer, spoken } = history[i];
    const entry = [
      `Interviewer: ${question}`,
      spoken ? `You actually said: ${spoken}` : '',
      answer ? `${spoken ? 'Your prepared answer was' : 'You'}: ${answer}` : '',
    ].filter(Boolean).join('\n');
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

const MAX_STORY_CHARS = 6000;

const formatStories = (stories: Story[]) => stories
  .filter(st => st.situation.trim() || st.action.trim())
  .map(st => `- ${st.title}${st.themes.length ? ` (${st.themes.join(', ')})` : ''}: ${st.situation.trim()} What I did: ${st.action.trim()} Result: ${st.result.trim()}`)
  .join('\n')
  .slice(0, MAX_STORY_CHARS);

const buildContext = (settings: Settings) => `
[CANDIDATE CONTEXT]
Resume/Experience: ${settings.cv.slice(0, MAX_CV_CHARS) || 'Not provided'}
Target company: ${settings.company || 'Not provided'}
Company research (use real details from here when asked about the company, e.g. "Why us?"): ${settings.companyNotes.slice(0, MAX_NOTES_CHARS) || 'Not provided'}
Job description: ${settings.job.slice(0, MAX_JOB_CHARS) || 'Not provided'}
Interviewer: ${settings.interviewer.slice(0, MAX_NOTES_CHARS) || 'Not provided'}${settings.interviewer.trim()
  ? '\n(Fit the depth to who is asking: a recruiter or non-technical manager wants plain words and impact, an engineer wants a bit more technical detail.)'
  : ''}

[PREPARED ANSWERS]
${formatBank(settings.answers, settings.company)}
${settings.stories?.length ? `
[STORY BANK]
The candidate's own true stories. For "tell me about a time" and other experience questions, tell the one that fits best, in order:
the situation, what you did, and the result, as natural speech.
${formatStories(settings.stories)}
` : ''}`;


// Repeated next to every question: style rules buried in a long system prompt lose weight, a reminder here doesn't
const ANSWER_REMINDER = `Remember: say it the simple way a real person talks, so even a non-expert could follow. Start with what it does in
everyday words, not a definition. Short sentences, plain words. Answer only what was asked: don't mention your own projects or
where you used it unless the question is about your experience. No hedges like "I think" or "kind of".`;

// "Broken" English (Display menu): everyday Indian English with small slips, so it doesn't sound too perfect
const BROKEN_ENGLISH = `Speak like a normal Indian engineer whose English is good but not perfect, the way people really talk in interviews:
in about one sentence out of three, make a small natural slip, such as dropping "a" or "the", a simple tense slip ("we are having one issue
that time"), "one" for "a" ("we had one service for that"), "only" or "itself" for emphasis ("that time only", "in the API itself"),
starting with "basically what happens is…" or "so what we did is…", or restarting a sentence halfway. Keep the meaning clear and the
technical words correct. Not every sentence, and never so much that it sounds like a joke.`;

// The Broken English instruction when that's switched on in the Display menu, for every prompt that writes in the user's voice
const englishNote = () => (loadEnglishStyle() === 'broken' ? `\n${BROKEN_ENGLISH}` : '');

// Which language to answer in, from the profile
const languageNote = (settings: Settings) => {
  if (settings.answerLanguage === 'english') {
    return settings.language === 'en' ? '' : '\nAlways answer in English, even if the question was asked in another language.';
  }
  if (settings.language === 'en') return '';
  return '\nAnswer in the same language the interviewer used. If that is Hindi, write everyday Hinglish in Latin script'
    + ' (the way people type it on WhatsApp), and keep technical words in English.';
};

// Ways to redo an answer from the buttons under it
export type AdjustMode = 'regenerate' | 'shorter' | 'longer' | 'simpler' | 'technical';

const ADJUST_INSTRUCTIONS: Record<AdjustMode, string> = {
  regenerate: 'Answer it again from a different angle (another example or emphasis), not a rewording of what you said before.',
  shorter: 'Say it again in about half the words. Keep the main point and drop the rest.',
  longer: 'Say it again with more detail: how you did it, why, and a concrete example from your experience.',
  simpler: 'Say it again in simpler, everyday words, as if to a non-technical interviewer. No jargon.',
  technical: 'Say it again with more technical depth: specific technologies, how it works internally, and the trade-offs.',
};

export interface AnswerOptions {
  prepared?: PreparedAnswer; // The user's own answer to retell naturally
  adjust?: { mode: AdjustMode; previous: string }; // Redo an earlier answer to this question
  signal?: AbortSignal;
  onFirstText?: (provider: ProviderId) => void;
  kind?: QuestionKind; // The type of question, for the shape of the answer
}

// The shape of a good answer for each type of question
const KIND_SHAPES: Record<QuestionKind, string> = {
  coding: 'This is a coding question: follow the CODE AND QUERIES rules.',
  design: 'This is a system design question: in one line say what you\'d check first (scale, main need), then the main parts in plain words, then one trade-off. Keep it simple; they\'ll ask for more.',
  experience: 'This asks about your experience: tell one real story from the resume, short: what the situation was, what you did, what happened.',
  'about-you': 'This is about you: answer short and direct, from the resume and profile.',
  concept: 'This is a concept question: explain simply what it does and roughly how it works. Don\'t bring up your own projects.',
  other: '',
};

// Streams the answer; onText receives the full text so far. Returns the final answer ('' if none).
// `history` is the conversation before this question.
export const streamInterviewAnswer = async (
  question: string,
  history: PastTurn[],
  settings: Settings,
  onText: (text: string) => void,
  { prepared, adjust, signal, onFirstText, kind = 'other' }: AnswerOptions = {},
): Promise<string> => {
  if (!question?.trim()) return '';

  const earlier = formatHistory(history);
  const notes = relevantNotes(settings.knowledge, `${history[history.length - 1]?.question ?? ''} ${question}`);
  const notesHint = notes ? `Your own notes that may help (use them only if they fit the question):\n${notes}\n\n` : '';
  const preparedHint = prepared
    ? `\n\nYou prepared this answer for this question. Keep its facts and story, but say it fresh, in your own spoken words:\n<<<${fillPlaceholders(prepared.answer, settings.company)}>>>`
    : '';
  const adjustHint = adjust
    ? `\n\nYou already answered this with:\n<<<${adjust.previous}>>>\n${ADJUST_INSTRUCTIONS[adjust.mode]}`
    : '';

  const text = await streamChat({
    tier: 'fast',
    system: SYSTEM_PROMPT_BASE + buildContext(settings),
    user: `${notesHint}${earlier ? `The interview so far:\n${earlier}\n\n` : ''}The interviewer just said:\n"${question}"${preparedHint}${adjustHint}\n\n${KIND_SHAPES[kind] ? `${KIND_SHAPES[kind]}\n` : ''}${ANSWER_REMINDER}${englishNote()}${languageNote(settings)}\n\nWhat you say:`,
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
  const response = await completeChat({
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

  const response = await completeChat({
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
export const readQuestionFromScreen = async (images: string[]): Promise<string> => {
  const text = await completeChat({
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
  const text = await completeChat({
    tier: 'quality',
    system: `You help a candidate prepare for a job interview. Write their answer to the question in the first person, in natural spoken English, 60–120 words, using ONLY facts from their resume and their own notes. Never invent employers, numbers or projects. Plain text, no markdown. Return only the answer text.\n${NO_AI_STYLE}${englishNote()}\n${buildContext({ ...settings, answers: [] })}`,
    user: `${question}${(n => (n ? `\n\nMy own notes that may help:\n${n}` : ''))(relevantNotes(settings.knowledge, question))}`,
    temperature: 0.5,
    maxTokens: 1200,
  });
  return cleanAnswer(text);
};

// ---------- Generated prepared answers ----------

const spokenAnswerRules = () => `Each "answer" is what the candidate would say out loud: first person, natural spoken English, plain words, contractions,
not polished or textbook-like, 60–150 words. Use ONLY facts from the resume and the candidate's own notes: never invent employers, projects, numbers or skills.
Plain text, no markdown, no lists.
${NO_AI_STYLE}${englishNote()}`;

// ---------- Prep pack ----------

export interface PrepItem {
  question: string;
  kind: 'about-you' | 'experience' | 'coding' | 'design' | 'concept' | 'other';
  why: string;    // Why this job will likely bring it up, or what the interviewer is checking
  answer: string; // Drafted from the resume and the story bank
}

const PREP_KINDS: PrepItem['kind'][] = ['about-you', 'experience', 'coding', 'design', 'concept', 'other'];

// The questions this job will most likely bring up, each with why and a drafted answer. `commonQuestions` are the
// questions asked most in real interviews (Recallr's question bank), for the model to pick the relevant ones from.
export const prepPack = async (settings: Settings, commonQuestions: string[] = []): Promise<PrepItem[]> => {
  const common = commonQuestions.slice(0, 40).map(q => `- ${q}`).join('\n');
  const response = await completeChat({
    tier: 'quality',
    json: true,
    system: `You help a candidate prepare for an interview for the job below. Predict the 12 to 15 questions they are most likely to be asked
for THIS job: the main skills and responsibilities in the job description, how the resume fits or falls short of them, the company, and the
behavioural questions most interviews include. Include one about a gap between the resume and the job if there is one.${common ? `
These questions come up most in real interviews; include the ones that fit this job, reworded if needed:
${common}` : ''}
Return JSON: {"items":[{"question":"...","kind":"...","why":"...","answer":"..."}]}
- "kind": one of ${PREP_KINDS.map(k => `"${k}"`).join(', ')}.
- "why": one short line: why this job will bring it up, or what the interviewer is really checking.
- For experience questions, build the answer on the best story from the story bank when there is one.
${spokenAnswerRules()}
${buildContext({ ...settings, answers: [] })}`,
    user: `Write the likely questions and draft answers.${(n => (n ? `\n\nMy own notes (use real details from them):\n${n}` : ''))(relevantNotes(settings.knowledge, settings.job, 8))}`,
    temperature: 0.5,
    maxTokens: 14000,
  });
  const parsed = JSON.parse(response || '{}');
  return (Array.isArray(parsed.items) ? parsed.items : [])
    .map((item: Partial<PrepItem>) => ({
      question: asText(item?.question),
      kind: PREP_KINDS.includes(item?.kind as PrepItem['kind']) ? item!.kind! : 'other',
      why: asText(item?.why),
      answer: cleanAnswer(asText(item?.answer)),
    }))
    .filter((item: PrepItem) => item.question && item.answer);
};

// ---------- Story bank ----------

// Real stories from the resume and notes, split into situation / action / result, for behavioural questions
export const findStories = async (settings: Settings): Promise<Story[]> => {
  const response = await completeChat({
    tier: 'quality',
    json: true,
    system: `Find 5 to 8 real stories in the candidate's resume and notes that they can tell in behavioural interview questions.
Cover as many of these themes as the resume truly supports: ${STORY_THEMES.join(', ')}. Only use what the resume or notes actually say;
skip a theme if there's no story for it, and never invent people, numbers or events.
Return JSON: {"stories":[{"title":"...","situation":"...","action":"...","result":"...","themes":["..."]}]}
- "title": 2 to 5 words naming the story, e.g. "Checkout latency fix".
- "situation": 1 or 2 sentences: the context and the problem.
- "action": 2 or 3 sentences: what the candidate did themselves (first person).
- "result": 1 sentence: what changed, with numbers if the resume has them.
- "themes": the themes it fits, from this list only: ${STORY_THEMES.map(t => `"${t}"`).join(', ')}.
Plain text inside the JSON, no markdown.
${buildContext({ ...settings, answers: [], stories: [] })}`,
    user: `Find the stories.${(n => (n ? `\n\nMy own notes (they can hold more stories):\n${n}` : ''))(relevantNotes(settings.knowledge, 'project problem incident outage conflict disagreement mistake failure deadline led migration improved', 8))}`,
    temperature: 0.4,
    maxTokens: 8000,
  });
  const parsed = JSON.parse(response || '{}');
  return (Array.isArray(parsed.stories) ? parsed.stories : [])
    .map((st: Partial<Story>) => toStory({ ...st, title: asText(st?.title), situation: asText(st?.situation), action: asText(st?.action), result: asText(st?.result) }))
    .filter((st: Story) => st.title && (st.situation || st.action));
};

// ---------- Mock interview ----------

// Questions a real interviewer for this job would ask, in a natural order
export const mockInterviewQuestions = async (settings: Settings, count: number): Promise<string[]> => {
  const response = await completeChat({
    tier: 'quality',
    json: true,
    system: `You are the interviewer for the job below. Write the ${count} questions you'd ask this candidate in a real interview, in order:
start with an easy warm-up, then mostly questions about the job's key skills and the candidate's own experience, with one behavioural question.
Phrase them the way an interviewer speaks out loud: short, natural, one question each. Return JSON: {"questions":["..."]}
${buildContext({ ...settings, answers: [] })}`,
    user: 'Write the interview questions.',
    temperature: 0.8,
    maxTokens: 4000,
  });
  const parsed = JSON.parse(response || '{}');
  return (Array.isArray(parsed.questions) ? parsed.questions : []).map(asText).filter(Boolean).slice(0, count);
};

export interface MockFeedback {
  score: number;  // 1..10
  good: string;   // What worked
  improve: string; // The one or two things that would make it better
  better: string; // A stronger version of the candidate's answer, in their voice
}

// Honest feedback on a spoken answer, like a coach after a practice round
export const scoreMockAnswer = async (question: string, answer: string, settings: Settings): Promise<MockFeedback> => {
  const response = await completeChat({
    tier: 'quality',
    json: true,
    system: `You coach a candidate after a practice interview question. They answered out loud; you get the speech-to-text of it
(so ignore small transcription errors and filler words). Be honest and specific, like a good human coach, not generous by default.
Return JSON: {"score":7,"good":"...","improve":"...","better":"..."}
- "score": 1 to 10 for how well it would land in a real interview (relevance, a concrete example or evidence, clarity, length).
- "good": one or two sentences on what worked. "improve": the one or two changes that would help most.
- "better": a stronger version of THEIR answer, keeping their story and facts, using only the resume otherwise.
  Write it as natural speech, the way they'd actually say it: plain words, contractions, not polished. 60–150 words.${englishNote()}
Write everything in plain, simple words.
${NO_AI_STYLE}
${buildContext({ ...settings, answers: [] })}`,
    user: `Question: ${question}\n\nWhat the candidate said: ${answer || '(nothing)'}`,
    temperature: 0.3,
    maxTokens: 4000,
  });
  const parsed = JSON.parse(response || '{}');
  const score = Math.round(Number(parsed.score));
  return {
    score: Number.isFinite(score) ? Math.min(10, Math.max(1, score)) : 5,
    good: asText(parsed.good),
    improve: asText(parsed.improve),
    better: cleanAnswer(asText(parsed.better)),
  };
};

// Fallback when the AI can't split a document: first line is the question, the rest is the answer
const fallbackSplit = (text: string): PreparedAnswer[] => {
  const [first, ...rest] = text.trim().split('\n');
  return [{ id: newId(), question: first.trim(), answer: rest.join('\n').trim() }];
};

// Turn a pasted or uploaded document of prepared answers into separate Q&A cards
export const structurePreparedAnswers = async (text: string): Promise<PreparedAnswer[]> => {
  try {
    const response = await completeChat({
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
