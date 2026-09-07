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

function matchAlert(alert, policies) {
  const trigger = norm(alert['Violation Triggers'] ?? alert['Violation Triggers '] ?? '');
  const matched = [];
  for (const policy of policies) {
    const hits = {};
    policy.classifiers.forEach((classifier, index) => { hits[index + 1] = trigger.includes(norm(classifier)); });
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
  const outputHeader = [...header];
  const policyColumn = outputHeader.findIndex(name => name.trim().toLowerCase() === 'policies');
  outputHeader.splice(policyColumn < 0 ? outputHeader.length : policyColumn + 1, 0, 'Rule Name');
  const outputRows = new Array(alerts.length);
  const counts = {};
  let identified = 0;

  for (let index = 0; index < alerts.length; index++) {
    const matched = matchAlert(alerts[index], policies);
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
