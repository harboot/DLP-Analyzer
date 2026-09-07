const escapeHtml = DLPUtils.escapeHtml;

// Configuration constants
const CONFIG = {
    MIN_LEN: 4,
    MAX_N: 4,
    STOPWORDS: new Set([
        'the', 'of', 'and', 'or', 'for', 'as', 'to', 'in', 'on', 'at', 'is', 'are', 'be', 'by', 'with', 'a', 'an', 'from', 'this', 'that',
        'were', 'been', 'should', 'would', 'could', 'shall', 'might', 'must', 'can', 'may', 'have', 'has', 'had', 'do', 'does', 'did'
    ]),
    MONTHS: new Set([
        'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
        'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
    ]),
    DEBOUNCE_DELAY: 500,
    BATCH_SIZE: 100,
    NUMERIC_REGEX: /(\b\d+[\.\/,-]*\d*\b|\b\d{4}\b|(?:\b[JFMASOND][a-z]+\d+-\b[JFMASOND][a-z]+\d+ \d{4}\b))/i
};

// DOM elements
let subjectsEl, rulesEl, genBtn, clearBtn, lineCountEl, kwCountEl, kwChipsEl, groupsEl, uncovSection, uncoveredListEl;
let loadingIndicator, errorContainer;

// State management
let processing = false;
let debounceTimer = null;

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
    // Cache DOM elements
    subjectsEl = document.getElementById('subjects');
    rulesEl = document.getElementById('rules');
    genBtn = document.getElementById('genBtn');
    clearBtn = document.getElementById('clearBtn');
    lineCountEl = document.getElementById('lineCount');
    kwCountEl = document.getElementById('kwCount');
    kwChipsEl = document.getElementById('kwChips');
    groupsEl = document.getElementById('groups');
    uncovSection = document.getElementById('uncovSection');
    uncoveredListEl = document.getElementById('uncoveredList');
    loadingIndicator = document.getElementById('loadingIndicator');
    errorContainer = document.getElementById('errorContainer');

    // Set up event listeners
    setupEventListeners();
}

function setupEventListeners() {
    genBtn.addEventListener('click', handleGenerate);
    clearBtn.addEventListener('click', handleClear);

    // Debounced input for large text processing
    subjectsEl.addEventListener('input', () => debounce(handleInputChange, CONFIG.DEBOUNCE_DELAY));
    rulesEl.addEventListener('input', () => debounce(handleInputChange, CONFIG.DEBOUNCE_DELAY));

    // Mode switch
    document.querySelectorAll('input[name="mode"]').forEach(radio => {
        radio.addEventListener('change', handleModeChange);
    });
}

function debounce(func, delay) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(func, delay);
}

function handleInputChange() {
    // Update line count in real-time
    const subjects = parseLines(subjectsEl.value);
    lineCountEl.textContent = subjects.length;
}

function handleModeChange() {
    // Clear results when mode changes
    clearResults();
}

function handleGenerate() {
    if (processing) return;

    try {
        processing = true;
        showLoading();
        hideError();

        // Use setTimeout to allow UI to update before processing
        setTimeout(() => {
            run();
            processing = false;
            hideLoading();
        }, 50);
    } catch (error) {
        showError('An error occurred during processing: ' + error.message);
        processing = false;
        hideLoading();
    }
}

function handleClear() {
    subjectsEl.value = '';
    rulesEl.value = '';
    clearResults();
}

function clearResults() {
    groupsEl.innerHTML = '';
    kwChipsEl.innerHTML = '';
    uncoveredListEl.innerHTML = '';
    lineCountEl.textContent = '0';
    kwCountEl.textContent = '0';
    uncovSection.style.display = 'none';
}

function showLoading() {
    genBtn.disabled = true;
    loadingIndicator.style.display = 'flex';
}

function hideLoading() {
    genBtn.disabled = false;
    loadingIndicator.style.display = 'none';
}

function showError(message) {
    errorContainer.textContent = message;
    errorContainer.style.display = 'block';
}

function hideError() {
    errorContainer.style.display = 'none';
}

// Parse input text into lines
function parseLines(text) {
    return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

// Parse rules from input text
// Lines should be lowercased first so rules are case-insensitive
// Start a rule with + for must-use (forced).
// Start a rule with - for contain-ban (exclude the phrase from candidates, but still process the line).
function parseRules(text) {
    const lines = parseLines(text.toLowerCase());
    const exceptionWords = new Set();
    const exceptionPhrases = new Set();
    const forced = new Set();
    const containBans = new Set();

    for (const raw of lines) {
        if (!raw) continue;

        if (raw.startsWith('+')) {
            const phrase = raw.slice(1).trim().replace(/\s+/g, ' ');
            if (phrase) forced.add(phrase);
            continue;
        }

        if (raw.startsWith('-')) {
            const ban = raw.slice(1).trim().replace(/\s+/g, ' ');
            if (ban) containBans.add(ban);
            continue;
        }

        const trimmed = raw.trim();
        if (!trimmed) continue;

        if (/\s/.test(trimmed)) {
            exceptionPhrases.add(trimmed); // Exact phrase exception
        } else {
            exceptionWords.add(trimmed); // Single-word exception
        }
    }

    return { exceptionWords, exceptionPhrases, forced, containBans };
}

// Escape special regex characters
function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Extract word tokens with positions from text
function extractWordTokensWithPos(text) {
    const tokens = [];
    let i = 0;
    const n = text.length;

    while (i < n) {
        while (i < n && !/[A-Za-z0-9]/.test(text[i])) i++;
        if (i >= n) break;

        const start = i;
        while (i < n && /[A-Za-z0-9]/.test(text[i])) i++;
        const end = i;

        tokens.push({
            text: text.slice(start, end).toLowerCase(),
            start,
            end
        });
    }

    return tokens;
}

// Build n-gram phrases from tokens
function buildNgramPhrases(originalText, tokens, n) {
    const phrases = [];
    for (let i = 0; i <= tokens.length - n; i++) {
        const start = tokens[i].start;
        const end = tokens[i + n - 1].end;
        phrases.push(originalText.slice(start, end));
    }
    return phrases;
}

// Check if a word is present in the original text
function isWordInOriginal(originalText, word) {
    const regex = new RegExp(`(^|[^a-z0-9])${escapeRegex(word)}(?=$|[^a-z0-9])`, 'i');
    return regex.test(originalText);
}

// Check if text contains any banned substring
function containsBannedSubstring(text, bannedSet) {
    for (const banned of bannedSet) {
        if (!banned) continue;
        if (text.includes(banned)) return true;
    }
    return false;
}

// Check if text contains numbers or numeric patterns
function containsNumbers(text) {
    return CONFIG.NUMERIC_REGEX.test(text);
}

// Highlight text with hit class
function highlightText(originalText, target, isPhrase) {
    const escapedText = escapeHtml(originalText);
    if (isPhrase) {
        const regex = new RegExp(escapeRegex(target), 'ig');
        return escapedText.replace(regex, match => `<span class="hit">${match}</span>`);
    } else {
        const regex = new RegExp(`(^|[^a-z0-9])(${escapeRegex(target)})(?=$|[^a-z0-9])`, 'ig');
        return escapedText.replace(regex, (match, g1, g2) => `${g1}<span class="hit">${g2}</span>`);
    }
}

// Extract context around a keyword
function extractContext(text, keyword, windowSize = 80) {
    const lowerText = text.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();
    const index = lowerText.indexOf(lowerKeyword);

    if (index === -1) {
        return text.length > 2 * windowSize + 20 ?
            escapeHtml(text.substring(0, 2 * windowSize + 20) + '...') :
            escapeHtml(text);
    }

    const start = Math.max(0, index - windowSize);
    const end = Math.min(text.length, index + lowerKeyword.length + windowSize);
    let snippet = text.substring(start, end);

    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';

    return escapeHtml(snippet);
}

function normalizeForMatching(text) {
    if (!text) return ' ';
    // Lowercase
    let s = text.toLowerCase();
    // Replace any non a-z0-9 with single space
    s = s.replace(/[^a-z0-9]+/g, ' ');
    // Collapse spaces and trim
    s = s.replace(/\s+/g, ' ').trim();
    // pad with spaces for whole-word style matching
    return ' ' + s + ' ';
}

function phraseMatchesLineFast(line, phrase) {
    if (!line || !phrase) return false;
    const normLine = normalizeForMatching(line);
    const normPhrase = ' ' + phrase.toLowerCase().replace(/\s+/g, ' ').trim() + ' ';
    return normLine.includes(normPhrase);
}

function countPhraseOccurrencesInLine(line, phrase) {
    if (!line || !phrase) return 0;
    const normLine = normalizeForMatching(line);
    const normPhrase = ' ' + phrase.toLowerCase().replace(/\s+/g, ' ').trim() + ' ';
    let count = 0;
    let idx = normLine.indexOf(normPhrase);
    while (idx !== -1) {
        count++;
        idx = normLine.indexOf(normPhrase, idx + normPhrase.length);
    }
    return count;
}

// Build candidate keywords from input text
function buildCandidatesSubject(subjects, rules) {
    const wordFrequency = new Map();
    const phraseFrequency = new Map();
    const tokensPerLine = subjects.map(text => extractWordTokensWithPos(text));
    const candidates = new Map();

    // Seed forced keywords (so they become candidates if they appear)
    for (const forcedPhrase of rules.forced) {
        if (!forcedPhrase) continue;
        const fp = forcedPhrase.toLowerCase();
        if (containsNumbers(fp) || containsBannedSubstring(fp, rules.containBans)) continue;
        const isPhrase = /\s/.test(fp);
        if (!candidates.has(fp)) candidates.set(fp, { isPhrase, covers: new Set() });
    }

    // Count unique words per line (subject-mode cares about line coverage)
    tokensPerLine.forEach(tokens => {
        const uniqueWords = new Set(tokens.map(t => t.text));
        for (const word of uniqueWords) {
            if (rules.forced.has(word)) {
                if (!containsNumbers(word) && !containsBannedSubstring(word, rules.containBans)) {
                    wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
                }
                continue;
            }

            if (word.length < CONFIG.MIN_LEN ||
                /^\d+$/.test(word) ||
                CONFIG.STOPWORDS.has(word) ||
                CONFIG.MONTHS.has(word) ||
                rules.exceptionWords.has(word) ||
                containsBannedSubstring(word, rules.containBans) ||
                containsNumbers(word)) {
                continue;
            }

            wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
        }
    });

    // Build n-gram phrases per line and count unique occurrence per line
    subjects.forEach((text, idx) => {
        const tokens = tokensPerLine[idx];
        const uniquePhrases = new Set();
        for (let n = 2; n <= CONFIG.MAX_N; n++) {
            buildNgramPhrases(text, tokens, n).forEach(p => {
                const t = p.trim();
                if (t) uniquePhrases.add(t);
            });
        }

        for (const phrase of uniquePhrases) {
            if (rules.forced.has(phrase)) {
                if (!containsNumbers(phrase) && !containsBannedSubstring(phrase, rules.containBans)) {
                    phraseFrequency.set(phrase, (phraseFrequency.get(phrase) || 0) + 1);
                }
                continue;
            }

            const words = phrase.split(/[^a-z0-9]+/);
            if (!phrase ||
                rules.exceptionPhrases.has(phrase) ||
                containsBannedSubstring(phrase, rules.containBans) ||
                CONFIG.STOPWORDS.has(words[0]) ||
                CONFIG.STOPWORDS.has(words[words.length - 1]) ||
                containsNumbers(phrase)) {
                continue;
            }

            phraseFrequency.set(phrase, (phraseFrequency.get(phrase) || 0) + 1);
        }
    });

    // Helper to add candidate
    function addCandidate(token, isPhrase) {
        if (!candidates.has(token)) candidates.set(token, { isPhrase, covers: new Set() });
    }

    // Map tokens/phrases to line indices they appear in
    subjects.forEach((text, idx) => {
        for (const [word] of wordFrequency) {
            if (isWordInOriginal(text, word)) {
                addCandidate(word, false);
                candidates.get(word).covers.add(idx);
            }
        }
        for (const [phrase] of phraseFrequency) {
            if (text.includes(phrase)) {
                addCandidate(phrase, true);
                candidates.get(phrase).covers.add(idx);
            }
        }
        // Ensure forced coverage is added
        for (const forcedPhrase of rules.forced) {
            const lf = forcedPhrase.toLowerCase();
            if (!lf) continue;
            if (rules.exceptionPhrases.has(lf) || containsBannedSubstring(lf, rules.containBans) || containsNumbers(lf)) continue;
            if (text.includes(lf)) {
                addCandidate(lf, /\s/.test(lf));
                candidates.get(lf).covers.add(idx);
            }
        }
    });

    // Remove candidates with zero coverage
    for (const [k, v] of [...candidates.entries()]) {
        if (!v.covers || v.covers.size === 0) candidates.delete(k);
    }

    // Remove dominated (shorter) tokens except forced
    const tokensSorted = [...candidates.keys()].sort((a, b) => b.length - a.length);
    const toRemove = new Set();
    for (let i = 0; i < tokensSorted.length; i++) {
        const longTok = tokensSorted[i];
        if (toRemove.has(longTok)) continue;
        const longCov = candidates.get(longTok).covers;
        for (let j = tokensSorted.length - 1; j > i; j--) {
            const shortTok = tokensSorted[j];
            if (toRemove.has(shortTok) || rules.forced.has(shortTok)) continue;
            const shortCov = candidates.get(shortTok).covers;
            let subset = true;
            for (const c of shortCov) {
                if (!longCov.has(c)) { subset = false; break; }
            }
            if (subset && longTok.length > shortTok.length) toRemove.add(shortTok);
        }
    }
    for (const t of toRemove) candidates.delete(t);

    return candidates; // map token -> { isPhrase, covers: Set<lineIndices> }
}


// Build candidates for CONTENT mode (global analysis)
// subjects: array of lowercased lines
// rules: parsed rules
// This function treats the entire text as a single corpus for counting occurrences (not per-line unique)
// Updated buildCandidatesContent (optimized: only use phraseMatchesLine when there's any forced '+' rules)
function buildCandidatesContent(subjects, rules) {
    const candidates = new Map();
    const fullText = subjects.join(' '); // lowercased already
    const tokensWithPos = extractWordTokensWithPos(fullText); // positions in concatenated string
    const tokenTexts = tokensWithPos.map(t => t.text);
	const normLines = subjects.map(l => normalizeForMatching(l));

    const needRobust = rules.forced && rules.forced.size > 0;

    // Pre-seed forced keywords into candidates (so must-use are present even if not found)
    for (const forcedPhrase of rules.forced) {
        if (!forcedPhrase) continue;
        const fp = forcedPhrase.toLowerCase().replace(/\s+/g, ' ').trim();
        if (!fp) continue;
        if (containsNumbers(fp) || containsBannedSubstring(fp, rules.containBans)) continue;
        const isPhrase = /\s/.test(fp);
        if (!candidates.has(fp)) candidates.set(fp, { isPhrase, covers: new Set(), count: 0 });
    }

    // Count single-word frequencies across whole corpus
    for (const token of tokenTexts) {
        if (rules.forced.has(token)) {
            if (!containsNumbers(token) && !containsBannedSubstring(token, rules.containBans)) {
                const meta = candidates.get(token) || { isPhrase: false, covers: new Set(), count: 0 };
                meta.count = (meta.count || 0) + 1;
                candidates.set(token, meta);
            }
            continue;
        }

        if (token.length < CONFIG.MIN_LEN ||
            /^\d+$/.test(token) ||
            CONFIG.STOPWORDS.has(token) ||
            CONFIG.MONTHS.has(token) ||
            rules.exceptionWords.has(token) ||
            containsBannedSubstring(token, rules.containBans) ||
            containsNumbers(token)) {
            continue;
        }

        const meta = candidates.get(token) || { isPhrase: false, covers: new Set(), count: 0 };
        meta.count = (meta.count || 0) + 1;
        candidates.set(token, meta);
    }

    // Build n-gram phrases across the entire fullText using token positions
    for (let n = 2; n <= CONFIG.MAX_N; n++) {
        for (let i = 0; i <= tokensWithPos.length - n; i++) {
            const start = tokensWithPos[i].start;
            const end = tokensWithPos[i + n - 1].end;
            let phrase = fullText.slice(start, end).trim();
            if (!phrase) continue;
            phrase = phrase.replace(/\s+/g, ' ').toLowerCase();

            if (rules.forced.has(phrase)) {
                if (containsNumbers(phrase) || containsBannedSubstring(phrase, rules.containBans)) continue;
                const meta = candidates.get(phrase) || { isPhrase: true, covers: new Set(), count: 0 };
                meta.count = (meta.count || 0) + 1;
                candidates.set(phrase, meta);
                continue;
            }

            const words = phrase.split(/[^a-z0-9]+/).filter(Boolean);
            if (!phrase ||
                rules.exceptionPhrases.has(phrase) ||
                containsBannedSubstring(phrase, rules.containBans) ||
                words.length === 0 ||
                CONFIG.STOPWORDS.has(words[0]) ||
                CONFIG.STOPWORDS.has(words[words.length - 1]) ||
                containsNumbers(phrase)) {
                continue;
            }

            const meta = candidates.get(phrase) || { isPhrase: true, covers: new Set(), count: 0 };
            meta.count = (meta.count || 0) + 1;
            candidates.set(phrase, meta);
        }
    }

    // Map each candidate to the line indices it appears in (covers)
	for (const [token, meta] of candidates.entries()) {
		if (!meta.covers) meta.covers = new Set();
		const normToken = token.toLowerCase().replace(/\s+/g, ' ').trim();

		if (meta.isPhrase) {
			// use fast normalized substring check
			normLines.forEach((nline, idx) => {
				if (nline.includes(' ' + normToken + ' ')) meta.covers.add(idx);
			});
		} else {
			// single-word: use whole-word regex (existing) OR normalized includes
			// Using normalized includes is safe for single words:
			normLines.forEach((nline, idx) => {
				if (nline.includes(' ' + normToken + ' ')) meta.covers.add(idx);
			});
		}

		if (!meta.count) meta.count = meta.covers.size;
	}

    // Defensive removal of banned/numeric tokens
    for (const [token, meta] of [...candidates.entries()]) {
        if (containsBannedSubstring(token, rules.containBans)) candidates.delete(token);
        else if (containsNumbers(token)) candidates.delete(token);
    }

    // Remove dominated shorter tokens except forced ones
    const tokensSorted = [...candidates.keys()].sort((a, b) => b.length - a.length);
    const toRemove = new Set();
    for (let i = 0; i < tokensSorted.length; i++) {
        const longTok = tokensSorted[i];
        if (toRemove.has(longTok)) continue;
        const longCov = candidates.get(longTok).covers;
        for (let j = tokensSorted.length - 1; j > i; j--) {
            const shortTok = tokensSorted[j];
            if (toRemove.has(shortTok) || rules.forced.has(shortTok)) continue;
            const shortCov = candidates.get(shortTok).covers;
            if (!shortCov || !longCov) continue;
            let subset = true;
            for (const c of shortCov) {
                if (!longCov.has(c)) { subset = false; break; }
            }
            if (subset && longTok.length > shortTok.length) toRemove.add(shortTok);
        }
    }
    for (const t of toRemove) candidates.delete(t);

    return candidates; // token -> { isPhrase, covers:Set<lineIndices>, count }
}

// Greedy set cover algorithm
function greedySetCover(candidates, totalLines) {
    const uncovered = new Set(Array.from({ length: totalLines }, (_, i) => i));
    const selected = [];

    // Score function for candidates
    function scoreCandidate(token, metadata) {
        const newCoverage = [...metadata.covers].filter(i => uncovered.has(i)).length;
        const length = token.length;
        const phraseBonus = metadata.isPhrase ? 0.85 : 0.0;
        return (newCoverage + phraseBonus) / (Math.log(length + 1) + 0.5);
    }

    while (uncovered.size > 0) {
        let bestCandidate = null;
        let bestScore = 0;

        for (const [token, metadata] of candidates.entries()) {
            // Skip tokens with numbers
            if (containsNumbers(token)) continue;

            const currentScore = scoreCandidate(token, metadata);

            if (currentScore > bestScore) {
                bestCandidate = [token, metadata];
                bestScore = currentScore;
            } else if (currentScore === bestScore && bestCandidate) {
                const newCoverageA = [...metadata.covers].filter(i => uncovered.has(i)).length;
                const newCoverageB = [...bestCandidate[1].covers].filter(i => uncovered.has(i)).length;

                if (newCoverageA > newCoverageB ||
                    (newCoverageA === newCoverageB &&
                     (token.length > bestCandidate[0].length ||
                      (token.length === bestCandidate[0].length && token < bestCandidate[0])))) {
                    bestCandidate = [token, metadata];
                }
            }
        }

        if (!bestCandidate || bestScore === 0) break;

        const [token, metadata] = bestCandidate;
        selected.push({
            token,
            isPhrase: metadata.isPhrase,
            covers: new Set([...metadata.covers])
        });

        for (const coveredLine of metadata.covers) {
            uncovered.delete(coveredLine);
        }

        candidates.delete(token);
    }

    return { selected, uncovered: [...uncovered] };
}

// Merge forced keywords into selected set
function mergeForcedKeywords(selectedKeywords, candidates, forcedKeywords) {
    for (const forced of forcedKeywords) {
        const lowerForced = forced.toLowerCase();
        const candidateData = candidates.get(lowerForced);

        if (candidateData && !selectedKeywords.some(s => s.token === lowerForced)) {
            selectedKeywords.push({
                token: lowerForced,
                isPhrase: candidateData.isPhrase,
                covers: new Set([...candidateData.covers])
            });
        }
    }

    return selectedKeywords;
}

// Assign subjects to best matching keyword
function assignSubjectsToKeywords(subjects, selectedKeywords, forcedKeywords) {
    const forcedSet = new Set([...forcedKeywords].map(f => f.toLowerCase()));
    const coverageCount = new Map(selectedKeywords.map(s => [s.token, s.covers.size]));
    const isPhraseMap = new Map(selectedKeywords.map(s => [s.token, s.isPhrase]));
    const assignment = new Map();

    subjects.forEach((subject, index) => {
        const matches = [];
        const lowerSubject = subject.toLowerCase();

        for (const keyword of selectedKeywords) {
            const matchesSubject = keyword.isPhrase ?
                lowerSubject.includes(keyword.token) :
                isWordInOriginal(lowerSubject, keyword.token);

            if (matchesSubject) {
                matches.push(keyword.token);
            }
        }

        if (matches.length === 0) return;

        // Sort matches by priority
        matches.sort((a, b) => {
            const aForced = forcedSet.has(a);
            const bForced = forcedSet.has(b);

            if (aForced !== bForced) return bForced - aForced;

            const aCoverage = coverageCount.get(a) || 0;
            const bCoverage = coverageCount.get(b) || 0;

            if (aCoverage !== bCoverage) return bCoverage - aCoverage;
            if (b.length !== a.length) return b.length - a.length;

            return a.localeCompare(b);
        });

        assignment.set(index, matches[0]);
    });

    // Ensure forced keywords have at least one assignment
    const coverageMap = new Map(selectedKeywords.map(s => [s.token, new Set([...s.covers])]));

    for (const keyword of selectedKeywords) {
        if (!forcedSet.has(keyword.token)) continue;

        const coverage = coverageMap.get(keyword.token) || new Set();
        if (coverage.size === 0) continue;

        let hasAssignment = false;
        for (const line of coverage) {
            if (assignment.get(line) === keyword.token) {
                hasAssignment = true;
                break;
            }
        }

        if (hasAssignment) continue;

        // Find a line to assign to this keyword
        let targetLine = [...coverage].find(i => !assignment.has(i));
        if (targetLine === undefined) {
            targetLine = [...coverage].find(i => !forcedSet.has(assignment.get(i) || ''));
        }
        if (targetLine === undefined) {
            targetLine = [...coverage][0];
        }

        assignment.set(targetLine, keyword.token);
    }

    return { assignment, isPhraseMap, coverageCount };
}

// Score keywords for content mode
// Now accepts rules so we can force-include '+' items in content mode as well
// Updated scoreContentKeywords (optimized: robust matching only when forced exist)
// Updated scoreContentKeywords using normalized, fast checks for phrase matching/counting
function scoreContentKeywords(candidates, rules, subjects) {
    const scored = [];
    const needRobust = rules.forced && rules.forced.size > 0;

    // Precompute normalized lines once (very fast) to avoid repeated heavy regex work
    const normLines = subjects.map(s => normalizeForMatching(s)); // returns ' ' + cleaned + ' '

    // small helper: count non-overlapping occurrences of normPhrase in a normalized line (both padded with spaces)
    function countOccurrencesInNormLine(normLine, normPhrase) {
        if (!normLine || !normPhrase) return 0;
        let count = 0;
        let idx = normLine.indexOf(normPhrase);
        while (idx !== -1) {
            count++;
            idx = normLine.indexOf(normPhrase, idx + normPhrase.length);
        }
        return count;
    }

    // Convert candidates entries into scored items using candidate.count as frequency (fast)
    for (const [token, meta] of candidates.entries()) {
        const frequency = meta.count || 0;
        const wordCount = token.split(/[^a-z0-9]+/).filter(Boolean).length || 1;

        let phraseBonus = 1.0;
        if (wordCount === 2) phraseBonus = 1.1;
        if (wordCount === 3) phraseBonus = 1.2;

        const contextBonus = Math.log(1 + frequency);
        const rawScore = (frequency * phraseBonus * contextBonus) / (Math.log(wordCount + 1.5) || 1);

        scored.push({
            token,
            frequency,
            wordCount,
            phraseBonus,
            contextBonus,
            score: rawScore,
            covers: new Set(meta.covers || []),
            isPhrase: !!meta.isPhrase
        });
    }

    // Ensure forced '+' are present ALWAYS and detect occurrences using normalized fast matching
    const FORCED_BONUS = 1000;
    for (const forced of rules.forced) {
        const f = forced.toLowerCase().replace(/\s+/g, ' ').trim();
        if (!f) continue;
        if (containsBannedSubstring(f, rules.containBans) || containsNumbers(f)) continue;

        // normalized phrase to search for in normLines (padded with spaces)
        const normPhrase = ' ' + f + ' ';

        let existing = scored.find(s => s.token === f);
        if (existing) {
            existing.score = existing.score + FORCED_BONUS;
            existing.isForced = true;

            // refresh covers and frequency using normalized lines (fast)
            for (let idx = 0; idx < normLines.length; idx++) {
                const nline = normLines[idx];
                if (!nline) continue;

                if (existing.isPhrase) {
                    if (nline.includes(normPhrase)) existing.covers.add(idx);
                } else {
                    // single-word match using whole-word normalized includes
                    if (nline.includes(normPhrase)) existing.covers.add(idx);
                }
            }
            existing.frequency = Math.max(existing.frequency, existing.covers.size || 0);
        } else {
            // Not present in scored -> attempt to find/count occurrences using normalized lines
            const covers = new Set();
            let count = 0;

            for (let idx = 0; idx < normLines.length; idx++) {
                const nline = normLines[idx];
                if (!nline) continue;

                if (f.indexOf(' ') >= 0) {
                    // multi-word: use normalized phrase exact substring (tolerant to punctuation because normalized)
                    if (nline.includes(normPhrase)) {
                        covers.add(idx);
                        // count non-overlapping occurrences in normalized line
                        count += countOccurrencesInNormLine(nline, normPhrase);
                    }
                } else {
                    // single word: normalized whole-word include + count occurrences
                    if (nline.includes(normPhrase)) {
                        covers.add(idx);
                        count += countOccurrencesInNormLine(nline, normPhrase);
                    }
                }
            }

            const wc = f.split(/[^a-z0-9]+/).filter(Boolean).length || 1;
            let phraseBonus = 1.0;
            if (wc === 2) phraseBonus = 1.1;
            if (wc === 3) phraseBonus = 1.2;
            const contextBonus = Math.log(1 + count);
            const baseScore = (count * phraseBonus * contextBonus) / (Math.log(wc + 1.5) || 1);

            scored.push({
                token: f,
                frequency: count,
                wordCount: wc,
                phraseBonus,
                contextBonus,
                score: baseScore + FORCED_BONUS,
                covers: covers,
                isPhrase: f.indexOf(' ') >= 0,
                isForced: true
            });
        }
    }

    // Final sort
    scored.sort((a, b) => b.score - a.score);

    return scored;
}

// Detect exception reasons for a subject
function detectExceptionReasons(subject, rules) {
    const reasons = [];
    const lowerSubject = subject.toLowerCase();

    for (const word of rules.exceptionWords) {
        if (isWordInOriginal(lowerSubject, word)) {
            reasons.push(word);
        }
    }

    for (const phrase of rules.exceptionPhrases) {
        if (lowerSubject.includes(phrase)) {
            reasons.push(phrase);
        }
    }

    for (const ban of rules.containBans) {
        if (lowerSubject.includes(ban)) {
            reasons.push(`-${ban}`);
        }
    }

    return reasons;
}

// Render results for subject mode
function renderSubjectMode(subjects, selectedKeywords, rules, assignment, uncoveredIndices) {
    // Sort keywords by priority
    selectedKeywords.sort((a, b) => {
        const aForced = rules.forced.has(a.token);
        const bForced = rules.forced.has(b.token);

        if (aForced !== bForced) return bForced - aForced;

        const aAssignments = [...assignment].filter(([_, token]) => token === a.token).length;
        const bAssignments = [...assignment].filter(([_, token]) => token === b.token).length;

        if (aAssignments !== bAssignments) return bAssignments - aAssignments;
        if (b.covers.size !== a.covers.size) return b.covers.size - a.covers.size;

        return a.token.localeCompare(b.token);
    });

    // Prepare display data - limit to max 20 keywords (kept as before)
    const displayKeywords = selectedKeywords
        .map(keyword => ({
            token: keyword.token,
            isPhrase: keyword.isPhrase,
            totalCoverage: keyword.covers.size,
            assignedCount: [...assignment].filter(([_, token]) => token === keyword.token).length,
            isForced: rules.forced.has(keyword.token)
        }))
        .filter(kw => kw.assignedCount > 0 || (kw.isForced && kw.totalCoverage > 0))
        .slice(0, 20); // Limit to 20 keywords

    // Update counters
    lineCountEl.textContent = subjects.length;
    kwCountEl.textContent = displayKeywords.length;

    // Render keyword chips
    kwChipsEl.innerHTML = displayKeywords
        .map(kw => `<span class="chip mono">${escapeHtml(kw.token.toUpperCase())}</span>`)
        .join('');

    // Render keyword groups
    groupsEl.innerHTML = '';
    displayKeywords.forEach((keyword, index) => {
        const groupElement = document.createElement('div');
        groupElement.className = 'group fade-in';

        const forcedBadge = keyword.isForced ?
            `<span class="badge ok">must-use</span>` : '';

        const countBadge = `<span class="badge">${keyword.assignedCount} / ${keyword.totalCoverage}</span>`;

        // Get all assigned lines for this keyword (original subjects)
        const allAssignedLines = [...assignment]
            .filter(([_, token]) => token === keyword.token)
            .map(([lineIndex]) => subjects[lineIndex]);

        const totalAssigned = allAssignedLines.length;
        const displayedAssigned = allAssignedLines.slice(0, 10); // limit to 10 per group

        // Build HTML for displayed lines
        const displayedHtml = displayedAssigned.map(line => `
            <div class="rowline">
                ${highlightText(line, keyword.token, keyword.isPhrase)}
            </div>
        `).join('');

        // If there are more than 10, show small indicator
        const moreHtml = (totalAssigned > 10) ?
            `<div class="rowline tiny muted">... and ${totalAssigned - 10} more</div>` : '';

        groupElement.innerHTML = `
            <header>
                <div class="title">
                    <span class="chip mono">${escapeHtml(keyword.token)}</span>
                    ${forcedBadge}
                    ${countBadge}
                </div>
                <span class="pill tiny">#${index + 1}</span>
            </header>
            <div class="body">
                ${displayedHtml}
                ${moreHtml}
            </div>
        `;

        groupsEl.appendChild(groupElement);
    });

    // Render uncovered subjects
    uncoveredListEl.innerHTML = '';
    if (uncoveredIndices.size > 0) {
        uncovSection.style.display = '';

        const sortedUncovered = [...uncoveredIndices].sort((a, b) => a - b);
        sortedUncovered.forEach(index => {
            const line = subjects[index];
            const reasons = detectExceptionReasons(line, rules);

            const reasonsHtml = reasons.length > 0 ?
                `<span class="tiny muted">Blocked by: ${reasons.map(r => `<code>${escapeHtml(r)}</code>`).join(', ')}</span>` :
                '';

            const rowElement = document.createElement('div');
            rowElement.className = 'un-row fade-in';
            rowElement.innerHTML = `
                <div>${escapeHtml(line)}</div>
                ${reasonsHtml}
            `;

            uncoveredListEl.appendChild(rowElement);
        });
    } else {
        uncovSection.style.display = 'none';
    }
}

// Render results for content mode
function renderContentMode(subjects, scoredKeywords) {
    // Limit to max 20 keywords
    const topKeywords = scoredKeywords.slice(0, 20);

    // Update counters
    lineCountEl.textContent = subjects.length;
    kwCountEl.textContent = topKeywords.length;

    // Render keyword chips
    kwChipsEl.innerHTML = topKeywords
        .map(kw => `<span class="chip mono">${escapeHtml(kw.token.toUpperCase())}</span>`)
        .join('');

    // Render keyword groups
    groupsEl.innerHTML = '';
    topKeywords.forEach((keyword, index) => {
        const groupElement = document.createElement('div');
        groupElement.className = 'group fade-in';

        // Prepare covers - sort and limit to 10 items
        const sortedCovers = [...keyword.covers].sort((a, b) => a - b);
        const totalCovers = sortedCovers.length;
        const displayedCovers = sortedCovers.slice(0, 10); // limit to 10 per group

        const coversHtml = displayedCovers.map(i => {
            const context = extractContext(subjects[i], keyword.token);
            const highlighted = highlightText(context, keyword.token, keyword.isPhrase);
            return `<div class="rowline">${highlighted}</div>`;
        }).join('');

        const moreHtml = (totalCovers > 10) ?
            `<div class="rowline tiny muted">... and ${totalCovers - 10} more</div>` : '';

        groupElement.innerHTML = `
            <header>
                <div class="title">
                    <span class="chip mono">${escapeHtml(keyword.token)}</span>
                    <span class="badge ok">score: ${keyword.score.toFixed(2)}</span>
                </div>
                <span class="pill tiny">#${index + 1}</span>
            </header>
            <div class="body">
                ${coversHtml}
                ${moreHtml}
            </div>
        `;

        groupsEl.appendChild(groupElement);
    });

    // Hide uncovered section in content mode
    uncovSection.style.display = 'none';
}

// Add simple stemming function to handle plural forms
function stemWord(word) {
    // Basic English plural rules
    if (word.endsWith('ies') && word.length > 3) {
        return word.slice(0, -3) + 'y';
    }
    if (word.endsWith('es') && word.length > 2) {
        // Check for words ending with consonant + o (e.g., potatoes -> potato)
        if (word.endsWith('oes') && word.length > 3) {
            return word.slice(0, -2);
        }
        // Check for words ending with s, x, z, ch, sh (e.g., boxes -> box)
        if (['s', 'x', 'z', 'ch', 'sh'].some(suffix => word.endsWith(suffix + 'es'))) {
            return word.slice(0, -2);
        }
        return word.slice(0, -1);
    }
    if (word.endsWith('s') && word.length > 1 && !word.endsWith('ss')) {
        return word.slice(0, -1);
    }
    return word;
}

// Merge plural forms into their singular counterparts
function mergePluralForms(keywords, rules) {
    const mergedKeywords = [];
    const keywordMap = new Map();
    const toRemove = new Set();

    // First pass: add all keywords to map and list
    for (const keyword of keywords) {
        if (rules.forced.has(keyword.token) || keyword.isPhrase) {
            // Don't merge forced keywords or phrases
            mergedKeywords.push(keyword);
            continue;
        }

        const stemmed = stemWord(keyword.token);
        if (stemmed === keyword.token) {
            // Not a plural form, add directly
            mergedKeywords.push(keyword);
            keywordMap.set(keyword.token, keyword);
        } else {
            // This is a plural form, check if singular exists
            if (keywordMap.has(stemmed)) {
                const singularKeyword = keywordMap.get(stemmed);
                // Merge coverage from plural to singular
                for (const line of keyword.covers) {
                    singularKeyword.covers.add(line);
                }
                toRemove.add(keyword.token);
            } else {
                // Singular form doesn't exist yet, add plural but track stemmed form
                mergedKeywords.push(keyword);
                keywordMap.set(stemmed, keyword);
            }
        }
    }

    // Remove merged plural forms
    return mergedKeywords.filter(kw => !toRemove.has(kw.token));
}

// Main processing function
function run() {
    try {
        const mode = document.querySelector('input[name="mode"]:checked').value;
        const subjects = parseLines(subjectsEl.value);
        if (subjects.length === 0) {
            showError('Please enter some text to analyze.');
            return;
        }
        const rules = parseRules(rulesEl.value);

        // Lowercased subjects for internal processing
        const lowerSubjects = subjects.map(s => s.toLowerCase());

        if (mode === 'subject') {
            // SUBJECT mode: per-line analysis
            const candidates = buildCandidatesSubject(lowerSubjects, rules);
            const coverResult = greedySetCover(new Map(candidates), subjects.length);
            let selectedKeywords = mergeForcedKeywords(coverResult.selected, candidates, rules.forced);
            selectedKeywords = mergePluralForms(selectedKeywords, rules);

            const assignmentResult = assignSubjectsToKeywords(lowerSubjects, selectedKeywords, rules.forced);

            const uncoveredIndices = new Set(coverResult.uncovered);
            for (const keyword of selectedKeywords) {
                if (!rules.forced.has(keyword.token) && keyword.covers.size === 1) {
                    uncoveredIndices.add([...keyword.covers][0]);
                }
            }

            renderSubjectMode(
                subjects,
                selectedKeywords,
                rules,
                assignmentResult.assignment,
                uncoveredIndices
            );
        } else {
            // CONTENT mode: corpus-wide analysis (not limited by per-line uniqueness)
            const candidates = buildCandidatesContent(lowerSubjects, rules);
            const scoredKeywords = scoreContentKeywords(candidates, rules, lowerSubjects);
            renderContentMode(subjects, scoredKeywords);
        }
    } catch (err) {
        showError('Processing error: ' + err.message);
        console.error(err);
    }
}
