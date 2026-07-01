import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('admin invite form keeps a stable form reference across async callbacks', () => {
  const html = readFileSync(new URL('../web/admin-invites.html', import.meta.url), 'utf8');

  assert.match(html, /var form = e\.currentTarget;/);
  assert.doesNotMatch(html, /\.then\([\s\S]*?e\.currentTarget\.reset\(\)/);
});

test('admin invite form defaults expiry to seven days later', () => {
  const html = readFileSync(new URL('../web/admin-invites.html', import.meta.url), 'utf8');

  assert.match(html, /name="expiresAt"/);
  assert.match(html, /setDefaultExpiry/);
  assert.match(html, /expires\.setDate\(expires\.getDate\(\) \+ 7\)/);
  assert.match(html, /expiresAtInput\.defaultValue = value/);
  assert.match(html, /form\.reset\(\);\s*setDefaultExpiry\(\);/);
});

test('admin invite list separates unused and used codes', () => {
  const html = readFileSync(new URL('../web/admin-invites.html', import.meta.url), 'utf8');

  assert.match(html, /未使用/);
  assert.match(html, /已使用/);
  assert.match(html, /id="unusedCodesBody"/);
  assert.match(html, /id="usedCodesBody"/);
  assert.match(html, /rows\.filter\(function \(r\) \{ return r\.usedCount < r\.maxUses; \}\)/);
  assert.match(html, /rows\.filter\(function \(r\) \{ return r\.usedCount >= r\.maxUses; \}\)/);
});
