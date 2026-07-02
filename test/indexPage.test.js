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
  assert.match(html, /class="loading-wait-notice"[^>]*>生成报告将耗时2分钟左右<\/div>/);
});

test('index form marks required fields with red asterisks', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

  for (const label of ['生源省份', '高考总分', '首选科目', '再选科目 · 四选二', '邀请码']) {
    assert.match(html, new RegExp(label + String.raw` <span class="required-star" style="color:#C9362C;">\*</span>`));
  }
});

test('index exposes advisor session progress without replacing the quick form', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

  assert.match(html, /id="advisorProgress"/);
  assert.match(html, /id="advisorStageText"/);
  assert.match(html, /深度模式进度/);
  assert.match(html, /志愿信息登记表/);
});

test('index places optional advisor stages after invite code as collapsed panels', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

  const inviteIndex = html.indexOf('name="inviteCode"');
  const stageIndex = html.indexOf('id="majorInterestPanel"');

  assert.ok(inviteIndex > -1);
  assert.ok(stageIndex > inviteIndex);
  assert.match(html, /<details id="majorInterestPanel"[^>]*>/);
  assert.doesNotMatch(html, /<details id="majorInterestPanel"[^>]*open/);
  assert.match(html, /可选项，可以跳过，点开才展开具体选项内容。/);
  assert.match(html, /专业兴趣初筛/);
  assert.match(html, /name="majorInterest" value="计算机类"/);
  assert.match(html, /name="majorInterest" value="师范教育类"/);
  assert.match(html, /id="majorInterestPanel"[^>]*data-advisor-stage="interest_profile"/);
  for (const panelId of ['personalProfilePanel', 'explorationPanel', 'draftPlanPanel', 'finalReportPanel']) {
    assert.match(html, new RegExp(`<details id="${panelId}"[^>]*>`));
    assert.doesNotMatch(html, new RegExp(`<details id="${panelId}"[^>]*open`));
  }
  assert.match(html, /id="personalProfilePanel"[^>]*data-advisor-stage="personal_profile"/);
  assert.match(html, /id="explorationPanel"[^>]*data-advisor-stage="exploration"/);
  assert.match(html, /id="draftPlanPanel"[^>]*data-advisor-stage="draft_plan"/);
  assert.match(html, /id="finalReportPanel"[^>]*data-advisor-stage="report_settings"/);
});

test('index moves freeform preference text into the optional final stage', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /院校与专业意向/);
  assert.match(html, /其他补充说明/);
  assert.match(html, /textarea name="preferences"/);
  assert.ok(html.indexOf('textarea name="preferences"') > html.indexOf('id="finalReportPanel"'));
});

test('index exposes structured optional advisor controls', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

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
    assert.match(html, new RegExp(`name="${fieldName}"`));
  }
});

test('index visually separates expanded optional advisor stages', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

  assert.match(html, /\.mj-stage-panel\[open\]/);
  assert.match(html, /\.mj-stage-panel\[open\] > \.mj-stage-summary/);
  assert.match(html, /\.mj-stage-panel\[open\] \.mj-stage-body/);
  assert.match(html, /box-shadow:inset 4px 0 0 var\(--gold\)/);
  assert.match(html, /class="mj-stage-summary"/);
  assert.match(html, /class="mj-stage-body/);
});
