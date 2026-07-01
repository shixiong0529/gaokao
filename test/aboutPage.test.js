import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('about message form marks required fields with red asterisks', () => {
  const html = readFileSync(new URL('../web/about.html', import.meta.url), 'utf8');

  for (const label of ['称呼', '联系邮箱', '留言内容']) {
    assert.match(html, new RegExp(label + String.raw` <span class="required-star" style="color:#C9362C;">\*</span>`));
  }
});
