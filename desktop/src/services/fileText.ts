import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export const ACCEPTED_FILES = '.pdf,.txt,.md,text/plain,application/pdf';

const MAX_FILE_BYTES = 15 * 1024 * 1024;

// pdf.js is loaded on demand so it never slows down app startup
const extractPdfText = async (file: File): Promise<string> => {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map(item => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
      .join('');
    pages.push(text);
  }
  await pdf.destroy();

  return pages
    .join('\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const extractTextFromFile = async (file: File): Promise<string> => {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('File is too large (max 15 MB).');
  }

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const text = isPdf ? await extractPdfText(file) : (await file.text()).trim();

  if (!text) {
    throw new Error(isPdf
      ? 'No text found in this PDF. If it is a scanned image, paste the text instead.'
      : 'This file is empty.');
  }
  return text;
};
