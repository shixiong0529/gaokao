import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('pdf download saves directly instead of opening browser print', () => {
  const js = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

  assert.match(html, /<script src="\/vendor\/html2canvas\.min\.js"><\/script>/);
  assert.match(html, /<script src="\/vendor\/pdf-lib\.min\.js"><\/script>/);
  assert.match(server, /\/vendor\/html2canvas\.min\.js/);
  assert.match(server, /\/vendor\/pdf-lib\.min\.js/);
  assert.equal(pkg.dependencies.html2canvas, '^1.4.1');
  assert.equal(pkg.dependencies['pdf-lib'], '^1.17.1');
  assert.match(js, /window\.downloadPdf = async function\(\)/);
  assert.match(js, /window\.html2canvas\(exportRoot, \{/);
  assert.match(js, /window\.PDFLib\.PDFDocument\.create\(\)/);
  assert.match(js, /await pdfDoc\.save\(\)/);
  assert.doesNotMatch(js, /\.print\(\)/);
});
