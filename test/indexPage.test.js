import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('index footer links unchanged advisory text to admin invite page', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

  assert.match(html, /© 2026 澄明志愿 · <a href="admin-invites\.html"[^>]*target="_blank"[^>]*rel="noopener"[^>]*>CHENGMING ADVISORY<\/a>/);
  assert.match(html, /data-admin-link/);
  assert.doesNotMatch(html, />管理<\/a>/);
});

test('index uses updated wait copy for report generation', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

  assert.match(html, /等待120秒 · 无需注册/);
  assert.match(html, /生成中，请耐心等待2分钟/);
  assert.match(html, /请耐心等待2分钟/);
});

test('index form marks required fields with red asterisks', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

  for (const label of ['生源省份', '高考总分', '首选科目', '再选科目 · 四选二', '邀请码']) {
    assert.match(html, new RegExp(label + String.raw` <span class="required-star" style="color:#C9362C;">\*</span>`));
  }
});
