const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'docs', 'styles.css'), 'utf8');
const uiSource = fs.readFileSync(path.join(__dirname, '..', 'docs', 'js', 'ui.js'), 'utf8');

test('paginated dashboard cards pin pagination to the card bottom', () => {
  assert.match(uiSource, /pager\.className = 'pager overview-pager'/);
  assert.match(stylesSource, /\.grid\.cols-3>\.section\{display:flex;flex-direction:column\}/);
  assert.match(stylesSource, /\.overview-pager\{margin-top:auto;/);
});


test('policy summary shows all policies and overview cells expose full-text tooltips', () => {
  assert.match(uiSource, /'Alerts by Policy'[\s\S]*\{ showAll: true \}/);
  assert.match(uiSource, /td\.title=String\(v\)/);
  assert.match(uiSource, /link\.title = name/);
  assert.match(stylesSource, /\.count-col\{width:64px/);
});
