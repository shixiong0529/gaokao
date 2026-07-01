import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const pageUrl = new URL('../web/admin-messages.html', import.meta.url);

test('admin messages page exists and reads protected messages API', () => {
  assert.equal(existsSync(pageUrl), true);

  const html = readFileSync(pageUrl, 'utf8');
  assert.match(html, /留言管理/);
  assert.match(html, /\/api\/admin\/messages/);
  assert.match(html, /X-Admin-Token/);
  assert.match(html, /mailto:/);
});
