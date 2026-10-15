import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { HttpError } from './http.js';

// Reading a company's website for interview research. The server fetches pages the user names, so it only
// ever connects to public internet addresses (checked at the moment of connecting, so a name that points
// somewhere private is refused too), on the normal web ports, with size and time limits.

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const MAX_TEXT = 12000; // Per page, sent to the AI
// Pages that usually say what a company does and how it works, tried after the one given
const EXTRA_PATHS = ['/about', '/about-us', '/company', '/careers'];

// Loopback, private networks, link-local, carrier-grade NAT, multicast and the like
export const isPrivateAddress = (address: string): boolean => {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = address.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9')
    || v6.startsWith('fea') || v6.startsWith('feb') || v6.startsWith('ff');
};

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

// Resolves the name as usual, then refuses private addresses (used by the request itself, so there is no gap)
const publicLookup = (hostname: string, options: dns.LookupOptions, callback: LookupCallback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '');
    const list = addresses as dns.LookupAddress[];
    const bad = list.find(a => isPrivateAddress(a.address));
    if (bad || list.length === 0) return callback(Object.assign(new Error('That address is not on the public internet.'), { code: 'PRIVATE_ADDRESS' }), '');
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

export const parseCompanyUrl = (input: string) => {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    throw new HttpError(400, 'Enter the company’s website, e.g. northwind.com.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || (url.port && !['80', '443'].includes(url.port)) || url.username || url.password) {
    throw new HttpError(400, 'Enter a normal website address, e.g. https://northwind.com.');
  }
  if (net.isIP(url.hostname.replace(/^\[|\]$/g, '')) || !url.hostname.includes('.')) {
    throw new HttpError(400, 'Enter the company’s website name, e.g. northwind.com.');
  }
  return url;
};

interface Page {
  url: string;
  html: string;
}

const fetchOnce = (url: URL, allowPrivate: boolean): Promise<{ status: number; location?: string; html: string }> => new Promise((resolve, reject) => {
  const client = url.protocol === 'https:' ? https : http;
  const req = client.get(url, {
    timeout: TIMEOUT_MS,
    agent: false, // A new connection every time, so every request goes through the address check
    headers: { 'User-Agent': 'RecallrBot/1.0 (company research for interview prep)', Accept: 'text/html,application/xhtml+xml' },
    ...(allowPrivate ? {} : { lookup: publicLookup as unknown as net.LookupFunction }),
  }, res => {
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      return resolve({ status, location: res.headers.location, html: '' });
    }
    if (!/text\/html|application\/xhtml/i.test(String(res.headers['content-type'] ?? 'text/html'))) {
      res.resume();
      return resolve({ status: 415, html: '' });
    }
    let size = 0;
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        req.destroy();
        return resolve({ status, html: Buffer.concat(chunks).toString('utf8') }); // Enough to read
      }
      chunks.push(chunk);
    });
    res.on('end', () => resolve({ status, html: Buffer.concat(chunks).toString('utf8') }));
    res.on('error', reject);
  });
  req.on('timeout', () => req.destroy(new Error('The website took too long to answer.')));
  req.on('error', reject);
});

// Follows a few redirects, checking each new address the same way
const fetchPage = async (start: URL, allowPrivate: boolean): Promise<Page | null> => {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const result = await fetchOnce(url, allowPrivate);
    if (result.location) {
      url = new URL(result.location, url);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      continue;
    }
    return result.status >= 200 && result.status < 300 && result.html ? { url: url.toString(), html: result.html } : null;
  }
  return null;
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…' };

// The readable text of a page: title, description and body text, without scripts, styles or menus
export const htmlToText = (html: string) => {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  const description = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1] ?? '';
  const body = html
    .replace(/<(script|style|noscript|svg|template|iframe|nav|footer|title)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|h[1-6]|li|section|article|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const decode = (text: string) => text
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
  const text = decode(body).split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(line => line.length > 2).join('\n');
  return [decode(title).trim() && `Title: ${decode(title).trim()}`, decode(description).trim() && `Description: ${decode(description).trim()}`, text]
    .filter(Boolean).join('\n').slice(0, MAX_TEXT);
};

// The home page the user gave, plus a few "about" pages on the same site if they exist
export const readCompanySite = (input: string) => readSite(parseCompanyUrl(input));

// `allowPrivate` is only for tests against a local server
export const readSite = async (start: URL, { allowPrivate = false } = {}) => {
  let home: Page | null;
  try {
    home = await fetchPage(start, allowPrivate);
  } catch (error) {
    const code = (error as { code?: string }).code;
    throw new HttpError(400, code === 'PRIVATE_ADDRESS' ? 'That address is not a public website.' : code === 'ENOTFOUND' ? 'That website doesn’t exist. Check the address.' : 'Couldn’t open that website. Check the address, or paste the notes yourself.');
  }
  if (!home) throw new HttpError(400, 'Couldn’t read that website. Check the address, or paste the notes yourself.');
  const origin = new URL(home.url).origin;
  const extras = await Promise.all(EXTRA_PATHS.map(path => fetchPage(new URL(path, origin), allowPrivate).catch(() => null)));
  const seen = new Set([home.url]);
  const pages = [home, ...extras.filter((p): p is Page => !!p && !seen.has(p.url) && !!seen.add(p.url))].slice(0, 3);
  return pages.map(p => ({ url: p.url, text: htmlToText(p.html) })).filter(p => p.text.length > 50);
};
