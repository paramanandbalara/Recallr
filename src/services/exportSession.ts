import type { InterviewReview } from './ai';
import { exportFile, type Session } from './sessions';

// A saved conversation as a Markdown file or a printable page (turned into a PDF by the main process)

const formatDate = (time: number) => new Date(time).toLocaleString(undefined, {
  year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

const answered = (session: Session) => session.turns.filter(t => t.status === 'done' && t.answer.trim());

const meta = (session: Session) => [formatDate(session.startedAt), session.profileName && `Profile: ${session.profileName}`]
  .filter(Boolean).join(' · ');

export const exportName = (session: Session) =>
  `Interview ${new Date(session.startedAt).toISOString().slice(0, 10)} – ${session.title}`.slice(0, 80);

// ---------- Markdown ----------

const reviewMarkdown = (review: InterviewReview) => {
  const lines = ['## Review', '', review.summary, ''];
  if (review.topics.length) lines.push(`**Topics:** ${review.topics.join(' · ')}`, '');
  if (review.weakSpots.length) {
    lines.push('### Weak spots', '');
    for (const w of review.weakSpots) lines.push(`- **${w.question}**  `, `  ${w.why}  `, `  *Next time:* ${w.fix}`);
    lines.push('');
  }
  if (review.prepareNext.length) {
    lines.push('### Prepare next', '', ...review.prepareNext.map(item => `- ${item}`), '');
  }
  if (review.email.body) {
    lines.push('### Thank-you email', '', `**Subject:** ${review.email.subject}`, '', review.email.body, '');
  }
  return lines.join('\n');
};

export const toMarkdown = (session: Session) => [
  `# ${session.title}`,
  '',
  `*${meta(session)}*`,
  '',
  ...answered(session).flatMap(t => [`## ${t.question}`, '', t.answer.split('\n').join('\n\n'), '']),
  session.review ? reviewMarkdown(session.review) : '',
].join('\n').trim() + '\n';

// ---------- Printable page (for PDF) ----------

const escape = (text: string) => text
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const paragraphs = (text: string) => text.split('\n').filter(line => line.trim()).map(line => `<p>${escape(line)}</p>`).join('');

const reviewHtml = (review: InterviewReview) => `
  <h2 class="section">Review</h2>
  ${paragraphs(review.summary)}
  ${review.topics.length ? `<p class="topics">${review.topics.map(escape).join(' · ')}</p>` : ''}
  ${review.weakSpots.length ? `<h3>Weak spots</h3><ul>${review.weakSpots.map(w =>
    `<li><strong>${escape(w.question)}</strong><br>${escape(w.why)}<br><em>Next time:</em> ${escape(w.fix)}</li>`).join('')}</ul>` : ''}
  ${review.prepareNext.length ? `<h3>Prepare next</h3><ul>${review.prepareNext.map(i => `<li>${escape(i)}</li>`).join('')}</ul>` : ''}
  ${review.email.body ? `<h3>Thank-you email</h3><div class="email"><p><strong>Subject:</strong> ${escape(review.email.subject)}</p>${paragraphs(review.email.body)}</div>` : ''}`;

export const toHtml = (session: Session) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${escape(session.title)}</title>
<style>
  body { font: 11pt/1.55 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; }
  h1 { font-size: 18pt; margin: 0 0 4pt; }
  .meta { color: #64748b; font-size: 9.5pt; margin-bottom: 18pt; }
  .turn { break-inside: avoid; margin-bottom: 14pt; }
  .q { font-weight: 600; color: #334155; margin: 0 0 4pt; }
  .a { border-left: 2.5pt solid #3b82f6; padding-left: 9pt; }
  p { margin: 0 0 5pt; }
  h2.section { font-size: 14pt; margin: 22pt 0 8pt; padding-top: 12pt; border-top: 1px solid #e2e8f0; }
  h3 { font-size: 11.5pt; margin: 14pt 0 6pt; }
  ul { padding-left: 16pt; margin: 0; }
  li { margin-bottom: 6pt; }
  .topics { color: #475569; }
  .email { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6pt; padding: 10pt 12pt; }
</style></head>
<body>
  <h1>${escape(session.title)}</h1>
  <div class="meta">${escape(meta(session))}</div>
  ${answered(session).map(t => `<div class="turn"><p class="q">${escape(t.question)}</p><div class="a">${paragraphs(t.answer)}</div></div>`).join('')}
  ${session.review ? reviewHtml(session.review) : ''}
</body></html>`;

// Ask where to save, then write the file. Returns false if the user cancelled.
export const exportSession = (session: Session, kind: 'md' | 'pdf') =>
  exportFile(exportName(session), kind, kind === 'pdf' ? toHtml(session) : toMarkdown(session));
