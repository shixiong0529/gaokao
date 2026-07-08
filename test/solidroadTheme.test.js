import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const publicPages = [
  'index.html',
  'reference.html',
  'college-data.html',
  'methodology.html',
  'about.html',
  'privacy.html',
  'terms.html'
];

const adminPages = [
  'admin-invites.html',
  'admin-messages.html'
];

const allHtmlPages = [...publicPages, ...adminPages];

const legacyPalette = [
  '#F3EEE2',
  '#FCFAF3',
  '#16233F',
  '#33405C',
  '#6E6754',
  '#A8823C',
  '168,130,60',
  '22,35,63',
  '#f6f1e7',
  '#fffdf7',
  '#17223b',
  '#a8823c'
];

test('public pages use the Solidroad-inspired theme variables', () => {
  for (const page of publicPages) {
    const html = readFileSync(new URL(`../web/${page}`, import.meta.url), 'utf8');

    assert.match(html, /--paper:#EEF2EC/, `${page} must use the cool terrain page background`);
    assert.match(html, /--paper2:#FAFBF7/, `${page} must use the soft off-white panel color`);
    assert.match(html, /--ink:#16201C/, `${page} must use deep green-black text`);
    assert.match(html, /--ink-soft:#34423C/, `${page} must use muted green-black secondary text`);
    assert.match(html, /--muted:#6C766E/, `${page} must use quiet neutral muted text`);
    assert.match(html, /--gold:#5F7467/, `${page} must use the sage accent in the existing accent variable`);
    assert.match(html, /--line:rgba\(22,32,28,0\.14\)/, `${page} must use the updated hairline color`);
    assert.match(html, /--line-strong:rgba\(22,32,28,0\.24\)/, `${page} must use the updated strong line color`);

    for (const legacyColor of legacyPalette) {
      assert.doesNotMatch(html, new RegExp(legacyColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${page} still contains legacy color ${legacyColor}`);
    }
  }
});

test('admin pages use the same redesigned color family', () => {
  for (const page of adminPages) {
    const html = readFileSync(new URL(`../web/${page}`, import.meta.url), 'utf8');

    assert.match(html, /background: #EEF2EC/, `${page} must use the redesigned page background`);
    assert.match(html, /color: #16201C/, `${page} must use redesigned text color`);
    assert.match(html, /a \{ color: #5F7467/, `${page} must use redesigned link accent`);
    assert.match(html, /section \{ background: #FAFBF7/, `${page} must use redesigned card background`);

    for (const legacyColor of legacyPalette) {
      assert.doesNotMatch(html, new RegExp(legacyColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${page} still contains legacy color ${legacyColor}`);
    }
  }
});

test('result and loading components use the redesigned palette', () => {
  const css = readFileSync(new URL('../web/style.css', import.meta.url), 'utf8');

  assert.match(css, /--bg: #EEF2EC/);
  assert.match(css, /--card: #FAFBF7/);
  assert.match(css, /--text-strong: #16201C/);
  assert.match(css, /--primary: #5F7467/);
  assert.match(css, /--primary-hover: #4D6357/);
  assert.match(css, /background: linear-gradient\(90deg, #5F7467, #96AA9C\)/);

  for (const legacyColor of ['#2563eb', '#1d4ed8', '#60a5fa', '#f8f9fa', '#e2e8f0']) {
    assert.doesNotMatch(css, new RegExp(legacyColor, 'i'), `style.css still contains legacy component color ${legacyColor}`);
  }
});

test('every html page uses the Solidroad mountain image as a background layer', () => {
  for (const page of allHtmlPages) {
    const html = readFileSync(new URL(`../web/${page}`, import.meta.url), 'utf8');

    assert.match(html, /framerusercontent\.com\/images\/UG7DO77CykOXq0OIDltEMrQUh4\.png/, `${page} must use the shared mountain background`);
  }
});

test('text over the mountain background uses readable light colors', () => {
  for (const page of publicPages) {
    const html = readFileSync(new URL(`../web/${page}`, import.meta.url), 'utf8');

    assert.match(html, /#F6F4EC|var\(--hero-ink\)/, `${page} must define a clear light text color over the landscape`);
    assert.match(html, /#F6F4EC|var\(--hero-soft\)/, `${page} must define a readable secondary text color over the landscape`);
    assert.doesNotMatch(html, /section:not\(\.mj-sec\):not\(\.mj-report-head\)/, `${page} must not broadly force every non-card section to light text`);
    assert.doesNotMatch(html, /div:not\(\[class\]\)/, `${page} must not broadly force unclassified divs to light text`);
  }

  for (const page of adminPages) {
    const html = readFileSync(new URL(`../web/${page}`, import.meta.url), 'utf8');

    assert.match(html, /header, header \* \{ color: #F6F4EC !important; \}/, `${page} must use light header text over the landscape`);
  }
});

test('college data pager keeps readable dark text on white page buttons', () => {
  const html = readFileSync(new URL('../web/college-data.html', import.meta.url), 'utf8');

  assert.match(html, /id="pager"/);
  assert.match(html, /class="mj-bg-text" style="display:flex; align-items:baseline; justify-content:space-between; margin:28px 4px 14px;"/);
  assert.match(html, /color:var\(--ink-soft\); border:1px solid var\(--line-strong\);/);
  assert.doesNotMatch(html, /#pager[\\s\\S]*color: #F6F4EC !important/);
});
