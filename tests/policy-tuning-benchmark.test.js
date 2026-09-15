const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { performance } = require('node:perf_hooks');

const context = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'docs', 'js', 'policy-tuning.js'), 'utf8'), context);

function dataset(size) {
  return Array.from({ length: size }, (_, index) => ({
    Policies: 'Scale Test',
    Source: `user-${index % 100}@example.com`,
    Destination: `destination-${index % 20}.example.com`,
    'File Name': `report_${index % 50}.pdf`,
    'Incident Time': new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(),
    'Violation Triggers': `Trigger ${index % 8}`
  }));
}

function benchmark(size) {
  const rows = dataset(size);
  const start = performance.now();
  const report = context.PolicyTuning.analyze(rows);
  return { elapsed: performance.now() - start, report };
}

test('deterministic 40,000 and 100,000 row benchmarks retain near O(n log n) scaling', t => {
  const small = benchmark(40_000);
  const large = benchmark(100_000);
  const ratio = large.elapsed / Math.max(1, small.elapsed);
  t.diagnostic(`PolicyTuning.analyze: 40,000=${small.elapsed.toFixed(1)}ms, 100,000=${large.elapsed.toFixed(1)}ms, ratio=${ratio.toFixed(2)}; expected O(n log n)`);
  assert.equal(small.report.alerts.length, 40_000);
  assert.equal(large.report.alerts.length, 100_000);
  assert.ok(ratio < 5, `Expected sub-quadratic scaling, observed ${ratio.toFixed(2)}x`);
});
