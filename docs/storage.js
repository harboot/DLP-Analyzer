/* Alert Analyzer: storage */

function setCookie(name, value, days = 7) {
    const maxAge = days * 24 * 60 * 60;
    const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; expires=${expires}; SameSite=Lax`;
  }

  // Gets a cookie value by name
  function getCookie(name) {
    const pattern = new RegExp('(?:^|; )' + encodeURIComponent(name) + '=([^;]*)');
    const match = document.cookie.match(pattern);
    return match ? decodeURIComponent(match[1]) : null;
  }

  // Stores a value in a cookie and an expiring localStorage fallback.
  function setSecret(name, value, days = 7) {
    const retentionDays = Math.min(90, Math.max(1, Math.floor(Number(days) || 7)));
    const expiresAt = Date.now() + retentionDays * 24 * 60 * 60 * 1000;
    try { setCookie(name, value, retentionDays); } catch (_) {}
    try {
      localStorage.setItem(name, value);
      localStorage.setItem(`${name}:expiresAt`, String(expiresAt));
    } catch (_) {}
  }

  // Gets a value from a cookie or a non-expired localStorage fallback.
  function getSecret(name) {
    const cookieValue = getCookie(name);
    if (cookieValue !== null) return cookieValue;

    try {
      const value = localStorage.getItem(name);
      const expiresAt = Number(localStorage.getItem(`${name}:expiresAt`));
      if (!value || !expiresAt || Date.now() >= expiresAt) {
        localStorage.removeItem(name);
        localStorage.removeItem(`${name}:expiresAt`);
        return null;
      }
      return value;
    } catch (_) {
      return null;
    }
  }

  openAiApiKey = getSecret('OPENAI_API_KEY') || '';

const RULE_CACHE_VERSION = 1;
const CACHE_NS = 'dlp_rules_';
const STORE   = sessionStorage;

// Loads cached rule results from sessionStorage.
function loadRuleCache(hash){
  try{
    const raw = STORE.getItem(`${CACHE_NS}${hash}`);
    return raw ? JSON.parse(raw) : null;
  }catch{ return null; }
}

// Stores cached rule results in sessionStorage (with cleanup fallback).
function saveRuleCache(hash, data){
  try{
    STORE.setItem(`${CACHE_NS}${hash}`, JSON.stringify(data));
  }catch{
    clearRuleCaches();
  }
}

// Removes all rule-cache entries from sessionStorage.
function clearRuleCaches(){
  try{
    Object.keys(STORE).forEach(k=>{
      if (k.startsWith(CACHE_NS)) STORE.removeItem(k);
    });
  }catch{}
}

// Generates a stable composite ID for a row (avoids collisions across files).
