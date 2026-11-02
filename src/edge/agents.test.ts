import { describe, expect, it } from 'vitest';
import { answer, markdownFor, pageFor, prefersMarkdown } from './agents';

describe('pageFor', () => {
  it('knows the pages and the game routes', () => {
    expect(pageFor('/')).toBe('index');
    expect(pageFor('/index.html')).toBe('index');
    expect(pageFor('/rules')).toBe('rules');
    expect(pageFor('/rules/')).toBe('rules');
    expect(pageFor('/About')).toBe('about');
    expect(pageFor('/contact')).toBe('contact');
    expect(pageFor('/privacy')).toBe('privacy');
    expect(pageFor('/practice')).toBe('app');
    expect(pageFor('/matchbook')).toBe('app');
    expect(pageFor('/t/K7QX2')).toBe('app');
  });

  it('treats everything else as not found', () => {
    expect(pageFor('/nope')).toBeNull();
    expect(pageFor('/t/')).toBeNull();
    expect(pageFor('/t/K7QX2/extra')).toBeNull();
    expect(pageFor('/wp-admin')).toBeNull();
  });

  it('maps pages to their Markdown', () => {
    expect(markdownFor('index')).toBe('/index.md');
    expect(markdownFor('rules')).toBe('/rules.md');
    expect(markdownFor('app')).toBe('/app.md');
    expect(markdownFor(null)).toBe('/404.md');
  });
});

describe('prefersMarkdown', () => {
  it('honours an explicit ask for Markdown', () => {
    expect(prefersMarkdown('text/markdown')).toBe(true);
    expect(prefersMarkdown('text/markdown, text/html;q=0.9')).toBe(true);
    expect(prefersMarkdown('text/x-markdown')).toBe(true);
    expect(prefersMarkdown('text/markdown;q=0.9, */*;q=0.1')).toBe(true);
  });

  it('leaves browsers on HTML', () => {
    expect(prefersMarkdown(null)).toBe(false);
    expect(prefersMarkdown('*/*')).toBe(false);
    expect(prefersMarkdown('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')).toBe(false);
    expect(prefersMarkdown('text/html')).toBe(false);
  });

  it('weighs quality values, then order', () => {
    expect(prefersMarkdown('text/html, text/markdown;q=0.5')).toBe(false);
    expect(prefersMarkdown('text/html;q=0.5, text/markdown')).toBe(true);
    expect(prefersMarkdown('text/markdown, text/html')).toBe(true);
    expect(prefersMarkdown('text/html, text/markdown')).toBe(false);
    expect(prefersMarkdown('text/markdown;q=0')).toBe(false);
  });
});

const ASSETS: Record<string, string> = {
  '/index.md': '# 893 Hold\'em\n\nThe front page.\n',
  '/rules.md': '# The rules\n',
  '/app.md': '# A table\n',
  '/404.md': '# That table\'s closed\n\nNothing here. See /llms.txt.\n',
};
const asset = async (path: string) =>
  ASSETS[path] ? new Response(ASSETS[path], { status: 200 }) : new Response('missing', { status: 404 });
const html = (status = 200, headers: Record<string, string> = {}) => async () =>
  new Response('<!doctype html><h1>page</h1>', { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers } });

const get = (path: string, accept?: string, init: RequestInit = {}) =>
  new Request(`https://holdem893.pages.dev${path}`, { ...init, headers: { ...(accept ? { Accept: accept } : {}), ...(init.headers ?? {}) } });

describe('answer', () => {
  it('serves the homepage as Markdown to an agent that asks', async () => {
    const res = await answer(get('/', 'text/markdown'), html(), asset);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(res.headers.get('Vary')).toBe('Accept');
    expect(res.headers.get('Content-Location')).toBe('/index.md');
    expect(await res.text()).toContain('# 893 Hold');
  });

  it('serves HTML to browsers, with Vary and a pointer to the Markdown', async () => {
    const res = await answer(get('/', 'text/html'), html(), asset);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(res.headers.get('Vary')).toBe('Accept');
    expect(res.headers.get('Link')).toContain('</index.md>; rel="alternate"; type="text/markdown"');
    expect(await res.text()).toContain('<h1>page</h1>');
  });

  it('keeps an existing Vary header and adds Accept once', async () => {
    const res = await answer(get('/rules', 'text/html'), html(200, { Vary: 'Accept-Encoding' }), asset);
    expect(res.headers.get('Vary')).toBe('Accept-Encoding, Accept');
    const again = await answer(get('/rules', 'text/html'), html(200, { Vary: 'accept' }), asset);
    expect(again.headers.get('Vary')).toBe('accept');
  });

  it('answers unknown addresses with a real 404, in Markdown for agents', async () => {
    const res = await answer(get('/no/such/page', 'text/markdown'), html(), asset);
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    const body = await res.text();
    expect(body.length).toBeGreaterThan(20);
    expect(body).toContain('/llms.txt');
  });

  it('turns a soft 404 into a real one for browsers', async () => {
    const res = await answer(get('/no/such/page', 'text/html'), html(200), asset);
    expect(res.status).toBe(404);
    expect(res.headers.get('Vary')).toBe('Accept');
  });

  it('keeps the game routes working', async () => {
    const md = await answer(get('/t/K7QX2', 'text/markdown'), html(), asset);
    expect(md.status).toBe(200);
    expect(await md.text()).toContain('# A table');
    const page = await answer(get('/practice', 'text/html'), html(), asset);
    expect(page.status).toBe(200);
  });

  it('answers HEAD with headers only', async () => {
    const res = await answer(get('/', 'text/markdown', { method: 'HEAD' }), html(), asset);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(await res.text()).toBe('');
  });

  it('passes sockets, writes, and files straight through', async () => {
    const passed = new Response('passed', { status: 299 });
    const next = async () => passed;
    expect(await answer(get('/room/K7QX2', 'text/markdown', { headers: { Upgrade: 'websocket' } }), next, asset)).toBe(passed);
    expect(await answer(get('/', 'text/markdown', { method: 'POST' }), next, asset)).toBe(passed);
    expect(await answer(get('/llms.txt', 'text/markdown'), next, asset)).toBe(passed);
    expect(await answer(get('/rules.md', 'text/markdown'), next, asset)).toBe(passed);
  });
});
