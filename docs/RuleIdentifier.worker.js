'use strict';

const norm = value => String(value || '').toLowerCase();

function evalRelationExpr(expr, hits) {
  const tokens = expr.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  const output = [], operators = [], precedence = { AND: 2, OR: 1 };
  for (const token of tokens) {
    if (/^\d+$/.test(token)) output.push(token);
    else if (/^(AND|OR)$/i.test(token)) {
      const operator = token.toUpperCase();
      while (operators.length && precedence[operators.at(-1)] >= precedence[operator]) output.push(operators.pop());
      operators.push(operator);
    }
  }
  while (operators.length) output.push(operators.pop());
  const stack = [];
  for (const token of output) {
    if (/^\d+$/.test(token)) stack.push(Boolean(hits[Number(token)]));
    else {
      const right = stack.pop(), left = stack.pop();
      stack.push(token === 'AND' ? left && right : left || right);
    }
  }
  return Boolean(stack.pop());
}

// Build an Aho-Corasick index once so every alert scans its trigger only once.
// Each terminal stores all policy/classifier positions that use that keyword.
function buildClassifierIndex(policies) {
  const nodes = [{ next: Object.create(null), fail: 0, outputs: [] }];
  policies.forEach((policy, policyIndex) => {
    policy.classifiers.forEach((classifier, classifierIndex) => {
      const keyword = norm(classifier);
      if (!keyword) return;
      let state = 0;
      for (const character of keyword) {
        const next = nodes[state].next;
        if (next[character] === undefined) {
          next[character] = nodes.length;
          nodes.push({ next: Object.create(null), fail: 0, outputs: [] });
        }
        state = next[character];
      }
      nodes[state].outputs.push([policyIndex, classifierIndex + 1]);
    });
  });

  const queue = [];
  for (const state of Object.values(nodes[0].next)) queue.push(state);
  for (let head = 0; head < queue.length; head++) {
    const state = queue[head];
    for (const [character, child] of Object.entries(nodes[state].next)) {
      queue.push(child);
      let fallback = nodes[state].fail;
      while (fallback && nodes[fallback].next[character] === undefined) fallback = nodes[fallback].fail;
      nodes[child].fail = nodes[fallback].next[character] ?? 0;
      nodes[child].outputs.push(...nodes[nodes[child].fail].outputs);
    }
  }
  return nodes;
}

function findPolicyHits(trigger, classifierIndex) {
  const policyHits = new Map();
  let state = 0;
  for (const character of trigger) {
    while (state && classifierIndex[state].next[character] === undefined) state = classifierIndex[state].fail;
    state = classifierIndex[state].next[character] ?? 0;
    for (const [policyIndex, classifierPosition] of classifierIndex[state].outputs) {
      let hits = policyHits.get(policyIndex);
      if (!hits) policyHits.set(policyIndex, hits = new Set());
      hits.add(classifierPosition);
    }
  }
  return policyHits;
}

function matchAlert(alert, policies, classifierIndex) {
  const trigger = norm(alert['Violation Triggers'] ?? alert['Violation Triggers '] ?? '');
  const matched = [];
  const policyHits = findPolicyHits(trigger, classifierIndex);
  // Sorting retains the original policy-file order in the exported Rule Name.
  for (const policyIndex of [...policyHits.keys()].sort((a, b) => a - b)) {
    const policy = policies[policyIndex];
    const matchedPositions = policyHits.get(policyIndex);
    const hits = Object.create(null);
    for (const position of matchedPositions) hits[position] = true;
    const relation = policy.relation;
    let ok;
    if (/^\d+(\s+(AND|OR)\s+\d+)*$/.test(relation)) ok = evalRelationExpr(relation, hits);
    else if (relation === 'OR') ok = policy.classifiers.some((_, index) => hits[index + 1]);
    else if (relation === 'AND') ok = policy.classifiers.every((_, index) => hits[index + 1]);
    else {
      const indexes = (relation.match(/\d+/g) || []).map(Number);
      ok = indexes.length ? indexes.every(index => hits[index]) : policy.classifiers.every((_, index) => hits[index + 1]);
    }
    if (ok) matched.push(policy.ruleName);
  }
  return matched;
}

self.onmessage = ({ data }) => {
  const { alerts, policies, header } = data;
  const classifierIndex = buildClassifierIndex(policies);
  const outputHeader = [...header];
  const policyColumn = outputHeader.findIndex(name => name.trim().toLowerCase() === 'policies');
  outputHeader.splice(policyColumn < 0 ? outputHeader.length : policyColumn + 1, 0, 'Rule Name');
  const outputRows = new Array(alerts.length);
  const counts = {};
  let identified = 0;

  for (let index = 0; index < alerts.length; index++) {
    const matched = matchAlert(alerts[index], policies, classifierIndex);
    const row = {};
    for (const name of outputHeader) row[name] = name === 'Rule Name' ? matched.join('; ') : (alerts[index][name] ?? '');
    outputRows[index] = row;
    if (matched.length) {
      identified++;
      for (const rule of matched) if (rule) counts[rule] = (counts[rule] || 0) + 1;
    }
    if ((index + 1) % 5000 === 0) self.postMessage({ type: 'progress', processed: index + 1 });
  }
  self.postMessage({ type: 'complete', header: outputHeader, rows: outputRows, counts, identified });
};
