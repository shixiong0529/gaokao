import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const colleges = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'web', 'colleges.json'), 'utf8')
);

test('colleges.json has no CSV-quoting artifacts in name or city', () => {
  const bad = colleges.filter(s => s.name.includes('"') || (s.city || '').includes('"'));
  assert.deepEqual(bad.map(s => s.name), []);
});

test('colleges.json every row has required fields and a valid level', () => {
  const bad = colleges.filter(s =>
    !s.name || !s.province || !s.nature || !s.category ||
    (s.level !== '本科' && s.level !== '专科')
  );
  assert.deepEqual(bad.map(s => s.name), []);
});

test('colleges.json has no duplicate school names', () => {
  const seen = new Set();
  const dup = [];
  for (const s of colleges) {
    if (seen.has(s.name)) dup.push(s.name);
    seen.add(s.name);
  }
  assert.deepEqual(dup, []);
});
