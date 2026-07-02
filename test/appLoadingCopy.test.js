import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('app loading progress starts with two minute patience copy', () => {
  const js = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

  assert.match(js, /请耐心等待2分钟/);
  assert.doesNotMatch(js, /AI 正在联网搜索院校数据，请耐心等待\.\.\./);
});

test('app creates and advances advisor sessions around report generation', () => {
  const js = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

  assert.match(js, /\/api\/advisor-sessions/);
  assert.match(js, /currentStage: 'draft_plan'/);
  assert.match(js, /currentStage: 'final_report'/);
  assert.match(js, /sessionId: advisorSessionId/);
});

test('app records major interest selections before report generation', () => {
  const js = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

  assert.match(js, /getAll\('majorInterest'\)/);
  assert.match(js, /stage === 'interest_profile'/);
  assert.match(js, /majorInterests/);
  assert.match(js, /buildPreferences\(formData, advisorPreferences\)/);
});

test('app folds structured optional advisor controls into preferences', () => {
  const js = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

  assert.match(js, /collectAdvisorPreferences\(formData\)/);
  for (const fieldName of [
    'cityPreference',
    'costPreference',
    'cooperationPreference',
    'excludedOption',
    'priorityFactor',
    'graduationGoal',
    'learningStrength',
    'riskPreference',
    'strategyRatio',
    'reportOption',
    'reportLength',
    'reportFocus'
  ]) {
    assert.match(js, new RegExp(`['"]${fieldName}['"]`));
  }
  assert.match(js, /结构化选项与其他补充说明如有冲突/);
});

test('app updates progress when optional advisor stage panels change', () => {
  const js = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

  assert.match(js, /bindAdvisorStagePanels\(\)/);
  assert.match(js, /querySelectorAll\('\[data-advisor-stage\]'\)/);
  assert.match(js, /dataset\.advisorStage/);
  assert.match(js, /currentStage: stage/);
  assert.match(js, /report_settings/);
});
