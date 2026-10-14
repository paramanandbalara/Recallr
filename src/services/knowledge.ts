// The user's own notes and documents per profile. Each question only gets the few most relevant
// sections, so answers stay fast however much is uploaded.

export interface KnowledgeFile {
  id: string;
  name: string;
  text: string;
}

export const MAX_FILE_CHARS = 200_000;
const SECTION_CHARS = 900;
const SECTIONS_PER_QUESTION = 4;

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'you', 'your', 'our', 'are', 'was', 'were', 'have', 'has', 'had',
  'what', 'how', 'why', 'when', 'where', 'which', 'who', 'can', 'could', 'would', 'should', 'will', 'tell', 'about',
  'explain', 'describe', 'me', 'its', 'into', 'than', 'then', 'them', 'they', 'their', 'there', 'also', 'just', 'like',
  'some', 'any', 'all', 'not', 'but', 'did', 'does', 'use', 'used', 'using', 'one', 'time', 'give', 'example',
]);

// Lowercase words worth matching, with light stemming so "caches" matches "cache"
const terms = (text: string) => (text.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*[a-z0-9+#]|[a-z0-9]/g) ?? [])
  .filter(word => word.length > 2 && !STOPWORDS.has(word))
  .map(word => word.replace(/(ing|ed|es|s)$/, ''));

// Paragraph-sized sections of about SECTION_CHARS
const sections = (text: string) => {
  const result: string[] = [];
  let current = '';
  for (const paragraph of text.split(/\n\s*\n/)) {
    for (let start = 0; start < paragraph.length; start += SECTION_CHARS) {
      const piece = paragraph.slice(start, start + SECTION_CHARS).trim();
      if (!piece) continue;
      if (current && current.length + piece.length > SECTION_CHARS) {
        result.push(current);
        current = '';
      }
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current) result.push(current);
  return result;
};

// The sections that share the most (distinct) words with the question, best first, as prompt text ('' if none fit)
export const relevantNotes = (files: KnowledgeFile[], query: string, limit = SECTIONS_PER_QUESTION) => {
  const wanted = new Set(terms(query));
  if (wanted.size === 0 || files.length === 0) return '';
  const scored = files.flatMap(file => sections(file.text).map(text => {
    const have = new Set(terms(text));
    const score = [...wanted].filter(term => have.has(term)).length;
    return { name: file.name, text, score };
  }));
  // One shared word is enough for a short question; longer ones need two
  const minimum = wanted.size <= 3 ? 1 : 2;
  return scored
    .filter(s => s.score >= minimum)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => `From "${s.name}":\n${s.text}`)
    .join('\n\n');
};
