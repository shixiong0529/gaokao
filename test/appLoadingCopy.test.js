import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('app loading progress starts with two minute patience copy', () => {
  const js = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

  assert.match(js, /请耐心等待2分钟/);
  assert.doesNotMatch(js, /AI 正在联网搜索院校数据，请耐心等待\.\.\./);
});
