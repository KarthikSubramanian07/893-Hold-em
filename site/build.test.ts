import { describe, expect, it } from 'vitest';
import { HOME_SLOT, homeFallback, llmsTxt, loadPages, pageDocument, parsePage, sitemap, siteFiles, toHtml } from './build';

const pages = loadPages();
const page = (slug: string) => pages.find((p) => p.slug === slug)!;
/** Visible text of some HTML, roughly as a crawler without JavaScript reads it. */
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
const headingLevels = (md: string) => [...md.matchAll(/^(#{1,6}) /gm)].map((m) => m[1]!.length);

describe('content pages', () => {
  it('every page has a title, a description, and exactly one H1 first', () => {
    for (const p of pages) {
      expect(p.title.length, p.slug).toBeGreaterThan(10);
      expect(p.description.length, p.slug).toBeGreaterThan(30);
      const levels = headingLevels(p.body);
      expect(levels[0], p.slug).toBe(1);
      expect(levels.filter((l) => l === 1), p.slug).toHaveLength(1);
    }
  });

  it('heading levels never skip (an H2 before any H3, and so on)', () => {
    for (const p of pages) {
      const levels = headingLevels(p.body);
      for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!, p.slug).toBeLessThanOrEqual(1);
    }
  });

  it('the homepage and the trust pages carry real text without JavaScript', () => {
    for (const slug of ['home', 'rules', 'about', 'contact', 'privacy']) {
      expect(text(toHtml(page(slug).body)).length, slug).toBeGreaterThanOrEqual(500);
    }
  });

  it('the 404 explains itself and points agents somewhere useful', () => {
    const body = page('404').body;
    expect(text(toHtml(body)).length).toBeGreaterThan(20);
    expect(body).toContain('/llms.txt');
    expect(body).toContain('/sitemap.xml');
  });

  it('rejects a page without front matter', () => {
    expect(() => parsePage('about', '# Hi\n')).toThrow(/title and a description/);
  });
});

describe('generated files', () => {
  const files = siteFiles(pages);

  it('emits HTML and Markdown for every page, plus the agent and crawler files', () => {
    for (const f of ['rules.html', 'about.html', 'contact.html', 'privacy.html', '404.html']) expect(files).toHaveProperty([f]);
    for (const f of ['index.md', 'rules.md', 'about.md', 'contact.md', 'privacy.md', 'app.md', '404.md']) expect(files).toHaveProperty([f]);
    for (const f of ['llms.txt', 'llms-full.txt', 'sitemap.xml', 'site.css']) expect(files).toHaveProperty([f]);
    expect(files).not.toHaveProperty(['index.html']);
  });

  it('static pages are complete documents with canonical and Markdown links', () => {
    const html = pageDocument(page('about'));
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<link rel="canonical" href="https://holdem893.pages.dev/about" />');
    expect(html).toContain('<link rel="alternate" type="text/markdown" href="/about.md" />');
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('<script');
    expect(text(html).length).toBeGreaterThan(500);
  });

  it('the 404 page has no canonical URL', () => {
    expect(files['404.html']).not.toContain('rel="canonical"');
  });

  it('the homepage fallback is the home page text with local links', () => {
    const html = homeFallback(page('home'));
    expect(html).toContain('<article class="prerender"');
    expect(html).toContain('<h1');
    expect(html).toContain('href="/practice"');
    expect(html).not.toContain('href="https://holdem893.pages.dev/practice"');
    expect(HOME_SLOT).toBe('<!-- site:home -->');
  });

  it('llms.txt follows the llmstxt.org shape and says when to use the site', () => {
    const txt = llmsTxt(pages);
    const lines = txt.split('\n');
    expect(lines[0]).toBe("# 893 Hold'em");
    expect(lines[2]?.startsWith('> ')).toBe(true);
    expect(txt).toContain('## When to use');
    expect(txt).toContain('## How to use it');
    expect(txt).toContain('## Docs');
    expect(txt).toContain('## Optional');
    for (const md of ['/index.md', '/rules.md', '/about.md', '/privacy.md', '/contact.md']) {
      expect(txt).toContain(`(https://holdem893.pages.dev${md})`);
    }
    // Section lists are Markdown links with notes.
    expect(txt).toMatch(/^- \[.+\]\(https:\/\/.+\): .+$/m);
  });

  it('the sitemap lists every public page and nothing else', () => {
    const xml = sitemap(pages);
    for (const path of ['/', '/rules', '/about', '/contact', '/privacy']) {
      expect(xml).toContain(`<loc>https://holdem893.pages.dev${path}</loc>`);
    }
    expect(xml).not.toContain('/t/');
    expect(xml).not.toContain('404');
  });
});
