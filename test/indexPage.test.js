import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('index footer does not expose admin entry and links compliance pages', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

  // 管理后台不能从公开页面可达（管理员直接访问 /admin-invites.html）
  assert.doesNotMatch(html, /admin-invites\.html/);
  assert.doesNotMatch(html, /admin-messages\.html/);
  assert.match(html, /© 2026 鲤鱼门 · LIYUMEN ADVISORY/);
  assert.match(html, /href="privacy\.html"/);
  assert.match(html, /href="terms\.html"/);
});

test('footer link row is byte-identical across all public pages', () => {
  const FOOTER_LINKS_BLOCK = `<div style="display:flex; gap:26px;">
        <a href="methodology.html" style="font-size:13px; letter-spacing:0.5px; color:var(--muted); text-decoration:none;">数据来源</a>
        <a href="privacy.html" style="font-size:13px; letter-spacing:0.5px; color:var(--muted); text-decoration:none;">隐私政策</a>
        <a href="terms.html" style="font-size:13px; letter-spacing:0.5px; color:var(--muted); text-decoration:none;">服务条款</a>
        <a href="about.html" style="font-size:13px; letter-spacing:0.5px; color:var(--muted); text-decoration:none;">联系我们</a>
      </div>`;

  for (const page of ['index.html', 'reference.html', 'college-data.html', 'methodology.html', 'about.html', 'privacy.html', 'terms.html']) {
    const html = readFileSync(new URL(`../web/${page}`, import.meta.url), 'utf8');
    assert.ok(html.includes(FOOTER_LINKS_BLOCK), `${page} 的底部链接行文案/顺序/目标必须与首页完全一致`);
  }
});

test('style.css must not contain global element rules that leak into the marketing page', () => {
  const css = readFileSync(new URL('../web/style.css', import.meta.url), 'utf8');

  // 首页营销版式全部内联样式；style.css 里的全局元素选择器会污染它——
  // 曾因 header { text-align:center } 和 * { box-sizing:border-box }
  // 导致首页顶栏与子页不一致（Logo 居中漂移、整体窄 80px）
  assert.doesNotMatch(css, /^\s*\*\s*\{/m, '不允许 * 全局选择器');
  assert.doesNotMatch(css, /^(header|body|h1|label|input|select|textarea)\b[^{]*\{/m, '不允许裸元素选择器');
  // 组件级 box-sizing 必须保留
  assert.match(css, /\.result, \.result \*/);
  assert.match(css, /\.loading-overlay, \.loading-overlay \*/);
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

test('index uses the Solidroad-inspired landscape as a page background layer', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

  assert.match(html, /\.mj-root::before/);
  assert.match(html, /framerusercontent\.com\/images\/UG7DO77CykOXq0OIDltEMrQUh4\.png/);
  assert.match(html, /rgba\(8,18,26,0\.78\)/);
  assert.match(html, /rgba\(8,18,26,0\) 100%/);
  assert.doesNotMatch(html, /rgba\(238,242,236,0\.62\).*rgba\(238,242,236,0\.94\)/);
  assert.match(html, /--hero-ink:#F6F4EC/);
  assert.match(html, /color:var\(--hero-ink\)/);
  assert.doesNotMatch(html, /mj-hero-watermark/);
  assert.doesNotMatch(html, /class="mj-landscape"/);
  assert.doesNotMatch(html, /alt="山脉风景"/);
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
  assert.match(html, /background:#F8FAF5 !important/);
  assert.match(html, /background:rgba\(95,116,103,0\.12\)/);
  assert.match(html, /class="mj-stage-summary"/);
  assert.match(html, /class="mj-stage-body/);
});
