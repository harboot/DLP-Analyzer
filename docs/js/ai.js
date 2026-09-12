/* Risk Scoring: AI predicate generation */

// Calls the OpenAI API to generate a JavaScript predicate from a user prompt.
async function runChatbot(prompt){
  if (!openAiApiKey) throw new Error('An OpenAI API Key has not been saved.');

  const preprompt = `
Create a complete Risk Scoring rule. The JavaScript code is executed for each
data row and must return a boolean.

Execution environment:
- Full dataset: rows (Array<Row>)
- Current row: row (Object), its index i (Number)

Constraints:
- Use pure JavaScript.
- Do not use fetch, DOM, window, globalThis, Function, eval, storage APIs, or external libraries.
- You may use rows and i for cross-row logic, but the final result must still be a boolean for the current row.
- Data separator is semicolon (;), e.g., "contract_2025.pdf; image.png"

Available fields (camelCase, case-sensitive) + examples:
row.ID → "70100001"
row.IncidentTime → "25 Aug. 2025, 09:01:00 AM GMT+0800"
row.EventTime → "25 Aug. 2025, 08:59:12 AM GMT+0800"
row.FileName → "contract_2025.pdf; image.png" (if more than one, separated by semicolon)
row.Size → "92.5" (The file size field should be interpreted only as a number or in scientific notation (e.g., 31.2E+3), and the value always represents kilobytes (KB).)
row.Source → "SRC-USER-001"
row.Policies → "Customer / Prospective Customer PII" (if more than one, separated by semicolon)
row.Channel → "Network email"
row.Destination → "alice@example.org" (if more than one, separated by semicolon)
row.Details → "sample row …" {This Details field is the Email Subject}
row.Status → "New"

Rules for row.Size:
- A number only (e.g., 92.5) or scientific notation with uppercase E (e.g., 3.12E+4).
- The value always represents kilobytes (KB).
- No leading +/- sign, no thousands separators, no unit strings. If any unit-like text appears, ignore it as noise.
- Accept digits with an optional decimal point: \d+(\.\d+)?.
- Optionally accept scientific notation using uppercase E with an optional + exponent sign (no - expected): E\+?\d+.
- Parse the matched string as a floating-point number in KB. If row.Size is missing or does not match the pattern, return false.
Samples:
row.Size = "92.5" → 92.5 KB → false
row.Size = "3.12E+4" → 31,200 KB → true

Date parsing (safe example to extract day):
const s = row.IncidentTime || row.EventTime || "";
const m = /^\s*(\d{1,2})\s+[A-Za-z]{3,}.?/.exec(s);
const day = m ? parseInt(m[1], 10) : NaN;

Output format:
Return only one valid JSON object with these properties:
- "ruleName": a concise, descriptive English rule name.
- "description": a concise English explanation of what the rule detects.
- "recommendedWeight": a non-negative integer representing the recommended risk score.
- "javascript": a plain anonymous function or statement block whose final result is a boolean.
Do not wrap the JSON in Markdown fences. In the "javascript" value, do not include
"use strict"; or (function(){...}. Multi-statement code is allowed and must end
with return ...;.

Task instruction:
  `;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + openAiApiKey
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      temperature: 1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: preprompt },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!resp.ok) {
    let message = `HTTP ${resp.status}`;
    try {
      const error = await resp.json();
      if (error?.error?.message) message += `: ${error.error.message}`;
    } catch (_) {}
    throw new Error(message);
  }

  const data = await resp.json();
  return parseGeneratedRule(data?.choices?.[0]?.message?.content || '');
}

// Parses and validates the structured rule returned by the AI generator.
function parseGeneratedRule(content) {
  const trimmed = String(content || '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  let generated;
  try {
    generated = JSON.parse((fenced ? fenced[1] : trimmed).trim());
  } catch (_) {
    throw new Error('The model returned an invalid rule format. Please try again.');
  }

  const ruleName = typeof generated?.ruleName === 'string' ? generated.ruleName.trim() : '';
  const description = typeof generated?.description === 'string' ? generated.description.trim() : '';
  const javascript = typeof generated?.javascript === 'string' ? generated.javascript.trim() : '';
  const recommendedWeight = Number(generated?.recommendedWeight);
  if (!ruleName || !description || !javascript || !Number.isInteger(recommendedWeight) || recommendedWeight < 0) {
    throw new Error('The generated rule is missing a name, description, recommended weight, or JavaScript code.');
  }
  return { ruleName, description, recommendedWeight, javascript };
}
