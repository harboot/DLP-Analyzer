const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const docs = path.join(__dirname, '..', 'docs');
const alertAnalyzerSource = fs.readFileSync(path.join(docs, 'js', 'ui.js'), 'utf8');
const riskScoringSource = fs.readFileSync(path.join(docs, 'CardManager.html'), 'utf8');
const stylesSource = fs.readFileSync(path.join(docs, 'styles.css'), 'utf8');

test('alert and risk result tables use fixed 50-row pagination', () => {
  assert.match(alertAnalyzerSource, /pageSize:50/);
  assert.match(riskScoringSource, /let pageSize = 50/g);
  assert.doesNotMatch(alertAnalyzerSource, /Rows\/page|data-role="pagesize"/);
  assert.doesNotMatch(riskScoringSource, /Rows\/page|data-role="page-size"/);
});

test('alert table lets the document scroll through all 50 rows', () => {
  assert.match(stylesSource, /\.sectionx\{height:auto\}/);
  assert.match(stylesSource, /\.sectionx>\.tablewrap\{flex:none;max-height:none;overflow:visible\}/);
});

test('CSV actions share the bottom-right table action layout', () => {
  assert.match(alertAnalyzerSource, /actions\.appendChild\(pager\); actions\.appendChild\(right\)/);
  assert.match(riskScoringSource, /<div class="table-actions">[\s\S]*?<div class="right"><button class="btn" data-act="export-alerts">Export CSV<\/button><\/div>/);
  assert.doesNotMatch(riskScoringSource, /matched rows|Showing matches for/);
});
