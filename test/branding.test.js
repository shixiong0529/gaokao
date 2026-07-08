import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const publicPages = [
  'index.html',
  'reference.html',
  'college-data.html',
  'methodology.html',
  'about.html',
  'privacy.html',
  'terms.html'
];

const adminPages = [
  'admin-invites.html',
  'admin-messages.html'
];

test('public pages use the Liyumen brand and domain metadata', () => {
  for (const page of publicPages) {
    const html = readFileSync(new URL(`../web/${page}`, import.meta.url), 'utf8');

    assert.match(html, /鲤鱼门/, `${page} must use the new site name`);
    assert.match(html, /LIYUMEN ADVISORY/, `${page} must use the new footer romanization`);
    assert.doesNotMatch(html, /澄明志愿|CHENGMING ADVISORY/, `${page} must not expose the old site name`);

    if (!['privacy.html', 'terms.html'].includes(page)) {
      assert.match(html, /https:\/\/liyumen\.com/, `${page} must use the new canonical or Open Graph domain`);
      assert.doesNotMatch(html, /gaokao\.moyu\.in/, `${page} must not expose the old public domain`);
    }
  }
});

test('admin page titles use the Liyumen brand', () => {
  for (const page of adminPages) {
    const html = readFileSync(new URL(`../web/${page}`, import.meta.url), 'utf8');

    assert.match(html, /鲤鱼门/, `${page} must use the new site name`);
    assert.doesNotMatch(html, /澄明志愿/, `${page} must not expose the old site name`);
  }
});

test('sitemap robots and deployment docs use liyumen.com', () => {
  const robots = readFileSync(new URL('../web/robots.txt', import.meta.url), 'utf8');
  const sitemap = readFileSync(new URL('../web/sitemap.xml', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  for (const content of [robots, sitemap, readme]) {
    assert.match(content, /liyumen\.com/);
    assert.doesNotMatch(content, /gaokao\.moyu\.in/);
  }
  assert.match(readme, /鲤鱼门/);
  assert.doesNotMatch(readme, /澄明志愿/);
});
