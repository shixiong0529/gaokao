import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('index footer does not expose admin entry and links compliance pages', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

  // 管理后台不能从公开页面可达（管理员直接访问 /admin-invites.html）
  assert.doesNotMatch(html, /admin-invites\.html/);
  assert.doesNotMatch(html, /admin-messages\.html/);
  assert.match(html, /© 2026 澄明志愿 · CHENGMING ADVISORY/);
  assert.match(html, /href="privacy\.html"/);
  assert.match(html, /href="terms\.html"/);
});

test('index header neutralizes style.css border-box so it matches sub pages', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

  // 首页引入 style.css（* { box-sizing:border-box }），子页没有；
  // 不还原为 content-box 时首页顶栏会窄 80px、Logo 小一圈
  assert.match(html, /\.mj-header, \.mj-header \* \{ box-sizing: content-box; \}/);
});

test('all public pages have mobile nav burger menu', () => {
  for (const page of ['index.html', 'reference.html', 'college-data.html', 'methodology.html', 'about.html', 'privacy.html', 'terms.html']) {
    const html = readFileSync(new URL(`../web/${page}`, import.meta.url), 'utf8');
    assert.match(html, /id="mjNavToggle"/, `${page} 缺少移动端导航开关`);
    assert.match(html, /class="mj-nav-burger"/, `${page} 缺少汉堡按钮`);
    assert.match(html, /\.mj-nav-toggle:checked ~ \.mj-nav/, `${page} 缺少展开态样式`);
  }
});

test('public pages do not load Google Fonts (unreachable in mainland China)', () => {
  for (const page of ['index.html', 'reference.html', 'college-data.html', 'methodology.html', 'about.html', 'privacy.html', 'terms.html']) {
    const html = readFileSync(new URL(`../web/${page}`, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/, `${page} 仍在引用 Google Fonts`);
  }
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

  assert.match(html, /\.mj-stage-panel \{/);
  assert.match(html, /\.mj-stage-panel > \.mj-stage-summary/);
  assert.match(html, /\.mj-stage-panel\[open\]/);
  assert.match(html, /\.mj-stage-panel\[open\] > \.mj-stage-summary/);
  assert.match(html, /\.mj-stage-panel\[open\] \.mj-stage-body/);
  assert.match(html, /box-shadow:inset 4px 0 0 var\(--gold\)/);
  assert.match(html, /background:#FFFEF8 !important/);
  assert.match(html, /background:rgba\(168,130,60,0\.12\)/);
  assert.match(html, /class="mj-stage-summary"/);
  assert.match(html, /class="mj-stage-body/);
});
