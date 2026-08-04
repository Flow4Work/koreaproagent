import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRss,
  parseSitemap,
  parseDuckDuckGo,
  parseHackerNews,
  extractHtmlDocument,
  publicWebConfigured,
  publicWebSearch
} from '../lib/web-search.js';

test('public web search requires no key', () => {
  const previous = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  assert.equal(publicWebConfigured(), true);
  if (previous) process.env.TAVILY_API_KEY = previous;
});

test('parses RSS and Atom items', () => {
  const xml = `<?xml version="1.0"?><rss><channel><item><title>A &amp; B expands to Japan</title><link>https://example.com/news?a=1&amp;utm_source=x</link><description><![CDATA[<b>APAC hiring</b>]]></description><pubDate>Mon, 03 Aug 2026 00:00:00 GMT</pubDate></item></channel></rss>`;
  const rows = parseRss(xml, 'test-rss');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'A & B expands to Japan');
  assert.equal(rows[0].content, 'APAC hiring');
  assert.equal(rows[0].source, 'test-rss');
  assert.equal(rows[0].url, 'https://example.com/news?a=1');
});

test('parses sitemap indexes and pages', () => {
  const xml = `<sitemapindex><sitemap><loc>https://example.com/news-sitemap.xml</loc></sitemap></sitemapindex><urlset><url><loc>https://example.com/blog/apac</loc><lastmod>2026-08-03</lastmod></url></urlset>`;
  const rows = parseSitemap(xml);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].url, 'https://example.com/blog/apac');
  assert.equal(rows[1].sitemap, true);
});

test('parses DuckDuckGo HTML and unwraps result URLs', () => {
  const html = `<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Facme.example%2F&amp;rut=x">Acme</a><a class="result__snippet">B2B SaaS in APAC</a></div>`;
  const rows = parseDuckDuckGo(html);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, 'https://acme.example/');
  assert.equal(rows[0].content, 'B2B SaaS in APAC');
});

test('parses Hacker News title links', () => {
  const html = `<span class="titleline"><a href="https://startup.example">Show HN: Startup</a></span>`;
  const rows = parseHackerNews(html);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, 'https://startup.example/');
});

test('extracts direct site metadata and feeds', () => {
  const html = `<html><head><title>Acme</title><meta name="description" content="Workflow automation"><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head></html>`;
  const row = extractHtmlDocument(html, 'https://acme.example/');
  assert.equal(row.title, 'Acme');
  assert.equal(row.content, 'Workflow automation');
  assert.deepEqual(row.feedLinks, ['https://acme.example/feed.xml']);
});

test('search combines zero-cost sources and applies exclusions', async () => {
  const responses = new Map([
    ['duckduckgo', `<a class="result__a" href="https://acme.example/">Acme APAC expansion</a><a class="result__snippet">Hiring sales in Singapore</a>`],
    ['google', `<rss><channel><item><title>Acme expands in Asia</title><link>https://news.example/acme</link><description>Partnership launch</description><pubDate>Mon, 03 Aug 2026 00:00:00 GMT</pubDate></item></channel></rss>`],
    ['bing', `<rss><channel></channel></rss>`],
    ['shownew', `<span class="titleline"><a href="https://other.example">Show HN: Other</a></span>`],
    ['jobs', `<span class="titleline"><a href="https://jobs.example">Hiring</a></span>`]
  ]);
  const fetchImpl = async url => {
    const key = String(url).includes('duckduckgo') ? 'duckduckgo' : String(url).includes('news.google') ? 'google' : String(url).includes('bing.com') ? 'bing' : String(url).includes('shownew') ? 'shownew' : 'jobs';
    return { ok:true, status:200, text:async () => responses.get(key) };
  };
  const result = await publicWebSearch('Acme APAC expansion', { maxResults:5, excludeDomains:['news.example'] }, { fetchImpl, timeoutMs:500 });
  assert.equal(result.usage.credits, 0);
  assert.equal(result.meta.provider, 'public-web');
  assert.equal(result.results.some(row => row.url === 'https://acme.example/'), true);
  assert.equal(result.results.some(row => row.url.includes('news.example')), false);
});
