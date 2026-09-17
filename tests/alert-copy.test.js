const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'docs', 'js', 'dlp-utils.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(__dirname, '..', 'docs', 'js', 'ui.js'), 'utf8');
const alertPage = fs.readFileSync(path.join(__dirname, '..', 'docs', 'AlertAnalyzer.html'), 'utf8');
const context = { window: {}, document: {} };
vm.runInNewContext(source, context);

const { channelIconEntity, getAlertRowCells } = context.window.DLPUtils;

test('alert cell copy uses the existing status notification component', () => {
  assert.match(alertPage, /id="copyStatus" class="update-status" role="status" aria-live="polite" hidden/);
  assert.match(uiSource, /showCopyStatus\('Copied to clipboard'\)/);
  assert.match(uiSource, /showCopyStatus\('Failed to copy to clipboard', 'error'\)/);
  assert.match(uiSource, /window\.setTimeout\(\(\) => \{ status\.hidden = true; \}, 1000\)/);
});

test('channel icons cover the supported channel families', () => {
  assert.equal(channelIconEntity('Network email'), '&#9993;');
  assert.equal(channelIconEntity('HTTPS upload'), '&#127760;');
  assert.equal(channelIconEntity('HTTP request'), '&#127760;');
  assert.equal(channelIconEntity('Print'), '&#128424;');
  assert.equal(channelIconEntity('Application sharing'), '&#128172;');
  assert.equal(channelIconEntity('Removable_Media'), '&#128190;');
  assert.equal(channelIconEntity('Other'), '');
});

test('alert copy excludes aliases and internal analysis fields', () => {
  const cells = getAlertRowCells({
    __uploadedColumns: ['ID', 'Event Time', 'Incident Time', 'File Name', 'Transaction Size (KB)', 'Custom Field'],
    ID: '89582478',
    'Event Time': '10 Sep. 2026, 05:53:42 PM GMT+0800',
    'Incident Time': '10 Sep. 2026, 05:53:42 PM GMT+0800',
    'File Name': '12200110_09102026.zip',
    'Transaction Size (KB)': '94.3',
    IncidentTime: 'duplicate incident time',
    EventTime: 'duplicate event time',
    FileName: 'duplicate filename',
    Size: 'duplicate size',
    sourceLower: 'marc daniel c. dionisio',
    destinationDomains: ['medicalcentertrading.com'],
    fileTokens: ['12200110_09102026.zip'],
    incidentDate: new Date('2026-09-10T09:53:42Z'),
    incidentHour: 17,
    actionLower: 'permitted',
    channelLower: 'network email',
    'Custom Field': 'kept'
  });

  assert.deepEqual(
    Array.from(cells, cell => Array.from(cell)),
    [
      ['ID', '89582478'],
      ['Event Time', '10 Sep. 2026, 05:53:42 PM GMT+0800'],
      ['Incident Time', '10 Sep. 2026, 05:53:42 PM GMT+0800'],
      ['File Name', '12200110_09102026.zip'],
      ['Transaction Size (KB)', '94.3'],
      ['Custom Field', 'kept']
    ]
  );
});

test('alert copy only includes columns present in the uploaded file', () => {
  const cells = getAlertRowCells({
    __uploadedColumns: ['ID', 'Source'],
    ID: '42',
    Source: 'analyst',
    Destination: '',
    Policies: '',
    Severity: '',
    sourceLower: 'analyst'
  });

  assert.deepEqual(
    Array.from(cells, cell => Array.from(cell)),
    [
      ['ID', '42'],
      ['Source', 'analyst']
    ]
  );
});

test('alert copy gives processing aliases canonical labels when originals are absent', () => {
  const cells = getAlertRowCells({
    ID: '42',
    IncidentTime: 'incident',
    EventTime: 'event',
    FileName: 'report.pdf',
    Size: '12.5',
    Source: 'analyst'
  });

  assert.deepEqual(
    Array.from(cells, cell => Array.from(cell)),
    [
      ['ID', '42'],
      ['Event Time', 'event'],
      ['Incident Time', 'incident'],
      ['Source', 'analyst'],
      ['File Name', 'report.pdf'],
      ['Transaction Size (KB)', '12.5']
    ]
  );
});
