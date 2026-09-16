const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'docs', 'styles.css'), 'utf8');
const uiSource = fs.readFileSync(path.join(__dirname, '..', 'docs', 'js', 'ui.js'), 'utf8');

test('all paginated dashboard cards pin pagination to the card bottom', () => {
  assert.match(uiSource, /pager\.className = 'pager overview-pager'/);
  assert.match(stylesSource, /\.grid\.cols-3>\.section\{display:flex;flex-direction:column\}/);
  assert.match(stylesSource, /\.overview-pager\{margin-top:auto;/);
});
