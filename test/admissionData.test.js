import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const requiredFields = ['科类', '院校代号', '院校名称', '专业组编号', '专业组名称', '投档线', '备注'];

test('local 2025 admission files use the shared row shape', () => {
  const files = readdirSync(new URL('../data/admission/', import.meta.url))
    .filter(name => /-2025-benke\.json$/.test(name));

  assert.ok(files.length >= 3, '至少应包含湖南、浙江、山东三个 2025 本科批投档线文件');

  for (const file of files) {
    const rows = JSON.parse(readFileSync(new URL(`../data/admission/${file}`, import.meta.url), 'utf8'));
    assert.ok(Array.isArray(rows), `${file} must be a JSON array`);
    assert.ok(rows.length > 0, `${file} must not be empty`);

    for (const [index, row] of rows.entries()) {
      for (const field of requiredFields) {
        assert.ok(Object.hasOwn(row, field), `${file}[${index}] missing ${field}`);
      }
      assert.equal(typeof row['院校名称'], 'string', `${file}[${index}] 院校名称 must be string`);
      assert.equal(typeof row['专业组名称'], 'string', `${file}[${index}] 专业组名称 must be string`);
      assert.ok(
        typeof row['投档线'] === 'number' || row['投档线'] === null,
        `${file}[${index}] 投档线 must be number or null`
      );
    }
  }
});
