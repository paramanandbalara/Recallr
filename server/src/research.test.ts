import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { htmlToText, isPrivateAddress, parseCompanyUrl, readCompanySite, readSite } from './research.js';

describe('company research: safety', () => {
  it('knows private and public addresses', () => {
    for (const a of ['127.0.0.1', '10.1.2.3', '172.20.0.5', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(a)).toBe(true);
    }
    for (const a of ['8.8.8.8', '104.16.1.1', '2606:4700::1111']) expect(isPrivateAddress(a)).toBe(false);
  });

  it('takes only normal website addresses', () => {
    expect(parseCompanyUrl('northwind.com').toString()).toBe('https://northwind.com/');
    for (const bad of ['ftp://northwind.com', 'http://127.0.0.1', 'http://localhost', 'https://northwind.com:8080', 'https://user:pw@northwind.com', 'not a url']) {
      expect(() => parseCompanyUrl(bad)).toThrow();
    }
  });

  it('refuses names that point to private addresses', async () => {
    await expect(readCompanySite('http://localtest.me')).rejects.toThrow(/public website|exist|open/);
  });
});

describe('company research: reading pages', () => {
  let server: http.Server;
  let base = '';
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/') return res.writeHead(301, { Location: '/home' }).end();
      if (req.url === '/home') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end('<html><head><title>Northwind &amp; Co</title><meta name="description" content="Logistics software"><script>var x=1</script><style>p{}</style></head><body><nav>Menu Login</nav><h1>We move parcels</h1><p>Northwind builds route planning for 2,000 couriers in India.</p><footer>© 2026</footer></body></html>');
      }
      if (req.url === '/about') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end('<p>Our values: own it, keep it simple. We use Go, Kafka and Postgres.</p>');
      }
      res.writeHead(404).end();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  it('turns HTML into readable text without scripts, styles and menus', () => {
    const text = htmlToText('<title>A &amp; B</title><meta name="description" content="Desc"><script>evil()</script><nav>Menu</nav><p>Hello&nbsp;there</p>');
    expect(text).toBe('Title: A & B\nDescription: Desc\nHello there');
  });

  it('reads the home page (after redirects) and the about page', async () => {
    const pages = await readSite(new URL(`${base}/`), { allowPrivate: true });
    expect(pages.map(p => new URL(p.url).pathname)).toEqual(['/home', '/about']);
    expect(pages[0].text).toContain('Title: Northwind & Co');
    expect(pages[0].text).toContain('route planning for 2,000 couriers');
    expect(pages[0].text).not.toMatch(/var x|Menu Login|©/);
    expect(pages[1].text).toContain('Go, Kafka and Postgres');
  });

  it('never connects to a private address, even when a name points there', async () => {
    await expect(readSite(new URL(`${base}/`))).rejects.toThrow(/not a public website/);
  });
});
