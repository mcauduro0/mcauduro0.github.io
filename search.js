// DeepStack search: one tokenizer shared by the build-time index (src/search-index.mjs) and the
// browser, plus the scoring the /search/ page runs on dist/search.json. No dependencies, no
// storage. The network calls are the index itself and, only when the form carries
// data-question-log (content/site.json questionLogEndpoint), one beacon per settled query with
// its hit count: the text and the number, nothing else, so DeepStack can see what readers ask
// for and do not find (the sensor, section 12 of the plan).
//
// Scoring: each query term is looked for in the three fields of an entry (a word-prefix match on the
// title, the excerpt or the token list). A title match outranks an excerpt match, which outranks a
// token match; exact words score a little above prefixes. At most twenty results are shown.
//
// The relevance floor (the same rule as the MCP Worker's search, mcp-worker/src/lib.js): an entry
// counts only when it carries more than half of the query's distinct terms (a majority) and one of
// its hits is strong, a title term or the whole phrase in the title or the excerpt (for a one-word
// query the word itself). A prefix counts as a match only from four characters on, so "me" does
// not reach Meta nor "app" Apple. When nothing clears the floor the page says so (noFormedSide:
// "No results for" the query, then the house's sentence), points at the nearest canonical question
// DeepStack settles when the query lands on one
// (nearestQuestion, with a threshold of its own), and lists up to three loosely related entries as
// nearest, never as results.

const STOP = new Set(('a about after all also an and any are as at be because been before being between both but by can could did do does done ' +
  'during each for from had has have he her here his how if in into is it its just like more most no nor not now of on one only or other our over ' +
  'own per said same says should since so some such than that the their them then there these they this those through to too two under until up ' +
  'very via was we were what when where which while who why will with within without would you your').split(' '));

export function tokenize(text, { keepStopwords = false } = {}) {
  const words = String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']s\b/g, '').replace(/[’']/g, '')
    .split(/[^a-z0-9]+/).filter((w) => w.length > 1 && (keepStopwords || !STOP.has(w)));
  return [...new Set(words)];
}

export function queryTerms(query) {
  const terms = tokenize(query);
  return terms.length ? terms : tokenize(query, { keepStopwords: true });
}

// "monthly" is a note under /notes/ (what agents asked, Onda 5); "note" stays the Editorial Notes.
export const TYPE_LABEL = { story: 'Story', question: 'Question', sides: 'Who is on each side', company: 'Company', person: 'Person', note: 'Editorial note', test: 'Dated test', monthly: 'Monthly note', result: 'Result' };
const TYPE_RANK = { story: 0, question: 1, sides: 2, result: 3, note: 4, company: 5, person: 6, test: 7, monthly: 8 };
export const LIMIT = 20;

// The index entry, with its three fields split into words once.
export function prepare(entry) {
  return { ...entry, _title: tokenize(entry.title, { keepStopwords: true }), _excerpt: tokenize(entry.excerpt, { keepStopwords: true }), _tokens: String(entry.tokens || '').split(' ').filter(Boolean) };
}

const fieldScore = (words, term, prefixPoints, exactBonus) => {
  let best = 0;
  for (const w of words) {
    if (w === term) return prefixPoints + exactBonus;
    if (best === 0 && term.length >= 4 && w.startsWith(term)) best = prefixPoints;
  }
  return best;
};

// The query's words in order, stopwords kept, for the phrase test.
const phraseWords = (query) => tokenize(query, { keepStopwords: true });
const hasPhrase = (words, phrase) => {
  if (!phrase.length || words.length < phrase.length) return false;
  for (let i = 0; i + phrase.length <= words.length; i++) {
    let j = 0;
    while (j < phrase.length && words[i + j] === phrase[j]) j++;
    if (j === phrase.length) return true;
  }
  return false;
};

// The score of an entry and what it rests on: `matched` is how many distinct terms it carries,
// `strong` whether a term is in the title or the whole phrase is in the title or the excerpt.
export function assessEntry(entry, terms, phrase = []) {
  let score = 0;
  let matched = 0;
  let strong = false;
  for (const term of terms) {
    const inTitle = fieldScore(entry._title, term, 10, 3);
    const s = inTitle + fieldScore(entry._excerpt, term, 5, 1) + fieldScore(entry._tokens, term, 2, 1);
    if (!s) continue;
    matched++;
    score += s;
    if (inTitle) strong = true;
  }
  if (!strong && matched && phrase.length) {
    // One distinct term: the word itself is the phrase, whatever stopwords padded it ("in
    // Loudoun", "what about ERCOT"), so any hit is strong.
    if (terms.length === 1) strong = true;
    else if (hasPhrase(entry._title, phrase) || hasPhrase(entry._excerpt, phrase)) { strong = true; score += 4; }
  }
  return { score, matched, strong };
}

export function scoreEntry(entry, terms, phrase = phraseWords(terms.join(' '))) {
  const a = assessEntry(entry, terms, phrase);
  return clearsFloor(a, terms.length) ? a.score : 0;
}

// The relevance floor: more than half of the distinct terms (two of two, two of three, three of
// four), and one strong hit. Half is not enough: one title word must not carry a two-word query.
export const clearsFloor = ({ matched, strong }, termCount) => matched * 2 > termCount && strong;

// The empty state (UX-1.16): "No results for" the query first, then the house's sentence. The MCP
// endpoint keeps its own one-sentence form (mcp-worker/src/lib.js), since an agent reads no page.
export const noFormedSide = (query) => `No results for “${String(query || '').replace(/\s+/g, ' ').trim()}”. DeepStack has no formed side on it yet: nothing published argues it.`;
export const NEAREST_LIMIT = 3;
export const QUESTION_LABEL = 'The nearest question DeepStack settles:';

// The Part an entry belongs to: the build writes `part` on story, sides and test entries (and
// `parts` on question entries); a Docket anchor also carries it in its id. Null for a company, a
// person or a note, which belong to no single Part.
export function partOfEntry(entry) {
  if (Number.isInteger(entry.part)) return entry.part;
  const m = /#test-p(\d+)-t\d+$/.exec(String(entry.url || ''));
  return m ? Number(m[1]) : null;
}

// Below the floor the absence answer points at the nearest canonical question when the query
// lands on one (Onda 5, lane CQ; the same rule as the MCP Worker's search, mcp-worker/src/lib.js).
// The pointer has a threshold of its own, since one shared word must not name a question, and a
// title word is still one word: "credit card rewards" must not name the debt question because
// "credit" sits in its title, any more than "price", "capital" or "inflation" name one. A question
// entry is named on its own only when it carries every one of the query's distinct terms (two of
// two, three of three, four of four; strength is waived, every term on the entry itself is the
// landing); else the question of the Part the query lands on: a Part with a nearby story, sides
// page or test (whatever its rank in `below`) that carries every term and missed the
// floor on strength alone; when several Parts qualify, the one whose nearby entries score most
// together, the later Part on a tie. A company, a person or a note belongs to no Part and lands
// nowhere. The limit of a keyword pointer stands in docs/api.md, section 2.1: a majority counts
// words, not meaning. `below` is the sorted list under the floor with each entry's assessment
// ({ entry, score, matched, strong }), `termCount` the number of distinct query terms; null hides
// the line.
export function nearestQuestion(below, entries, termCount) {
  const questions = entries.filter((e) => e.type === 'question');
  if (!questions.length) return null;
  const allTerms = (a) => a.matched === termCount;
  const direct = below.find((s) => s.entry.type === 'question' && allTerms(s));
  if (direct) return direct.entry;
  const owner = (part) => questions.find((e) => Array.isArray(e.parts) && e.parts.includes(part));
  const parts = new Map();
  for (const item of below) {
    const part = partOfEntry(item.entry);
    if (part === null || !owner(part)) continue;
    const p = parts.get(part) || { landed: false, score: 0 };
    p.score += item.score;
    if (allTerms(item)) p.landed = true;
    parts.set(part, p);
  }
  let pick = null;
  for (const [part, p] of parts) if (p.landed && (!pick || p.score > pick.score || (p.score === pick.score && part > pick.part))) pick = { part, score: p.score };
  return pick ? owner(pick.part) : null;
}

export function search(entries, query, limit = LIMIT) {
  const terms = queryTerms(query);
  if (!terms.length) return { terms, results: [] };
  const phrase = phraseWords(query);
  const scored = [];
  const below = [];
  for (const e of entries) {
    const a = assessEntry(e, terms, phrase);
    if (a.score <= 0) continue;
    (clearsFloor(a, terms.length) ? scored : below).push({ entry: e, score: a.score, matched: a.matched, strong: a.strong });
  }
  const order = (a, b) => b.score - a.score || (TYPE_RANK[a.entry.type] ?? 9) - (TYPE_RANK[b.entry.type] ?? 9) || a.entry.title.localeCompare(b.entry.title);
  if (!scored.length) {
    below.sort(order);
    return { terms, total: 0, results: [], answer: noFormedSide(query), nearest: below.slice(0, NEAREST_LIMIT).map((s) => s.entry), question: nearestQuestion(below, entries, terms.length) };
  }
  scored.sort(order);
  return { terms, total: scored.length, results: scored.slice(0, limit).map((s) => s.entry) };
}

// ---------- the question log ----------
// A sender for {q, hits}: sendBeacon with a plain-text body (no preflight, survives navigation),
// a keepalive fetch when the browser has no beacon. The page never waits for the answer and never
// reads it. The same query is not sent twice in a row; a query still being typed is not sent at
// all (the caller debounces). Without an endpoint the sender does nothing.
export function makeReporter(endpoint, { nav = null, fetchImpl = null } = {}) {
  if (!endpoint) return () => false;
  let last = '';
  return (query, hits) => {
    const q = String(query || '').trim();
    if (!q || q === last) return false;
    last = q;
    const body = JSON.stringify({ q, hits: Number.isInteger(hits) && hits >= 0 ? hits : 0 });
    try { if (nav && typeof nav.sendBeacon === 'function' && nav.sendBeacon(endpoint, body)) return true; } catch { /* the fetch below */ }
    try {
      if (typeof fetchImpl === 'function') { const p = fetchImpl(endpoint, { method: 'POST', body, keepalive: true, credentials: 'omit', headers: { 'content-type': 'text/plain' } }); if (p && typeof p.catch === 'function') p.catch(() => {}); return true; }
    } catch { /* nothing to do: the search is unaffected */ }
    return false;
  };
}

// ---------- Browser ----------
function init(doc, win) {
  const form = doc.querySelector('[data-search-form]');
  if (!form) return;
  const input = form.querySelector('input[name="q"]');
  const list = doc.getElementById('search-results');
  const status = doc.getElementById('search-status');
  const empty = doc.getElementById('search-empty');
  const report = makeReporter(form.getAttribute('data-question-log'), { nav: win.navigator, fetchImpl: typeof win.fetch === 'function' ? (url, init) => fetch(url, init) : null });
  let reportTimer;
  // A query is reported once it has settled: on submit at once, while typing a second after the
  // last keystroke, so the log holds questions, not keystrokes.
  const settle = (query, total, now) => {
    win.clearTimeout(reportTimer);
    if (now) report(query, total); else reportTimer = win.setTimeout(() => report(query, total), 1000);
  };
  let entries = null;
  let loading = null;
  const load = () => {
    if (!loading) loading = fetch('/search.json', { credentials: 'omit' }).then((r) => r.json()).then((data) => { entries = data.entries.map(prepare); return entries; });
    return loading;
  };
  const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const say = (text) => { if (status) status.textContent = text; };
  const hit = (e) => {
    const li = el('li', `search-hit search-${e.type}`);
    const a = el('a');
    a.href = e.url;
    a.append(el('span', 'search-type', TYPE_LABEL[e.type] || e.type), el('strong', 'search-title', e.title), el('span', 'search-excerpt', e.excerpt));
    li.append(a);
    return li;
  };
  // Below the floor: the sentence, the nearest canonical question when one exists, then the
  // nearest items labeled as such (never as results).
  const nearestBox = empty.querySelector('[data-nearest]');
  const nearestList = empty.querySelector('[data-nearest-list]');
  const questionBox = empty.querySelector('[data-question]');
  const questionLink = empty.querySelector('[data-question-link]');
  const render = (query, out) => {
    list.replaceChildren();
    const q = query.trim();
    if (!q) { say(''); empty.hidden = true; return; }
    if (!out.results.length) {
      empty.hidden = false;
      empty.querySelector('[data-query]').textContent = q;
      const nearest = out.nearest || [];
      const question = out.question || null;
      if (questionLink && question) { questionLink.href = question.url; questionLink.textContent = question.title; }
      if (questionBox) questionBox.hidden = !question;
      if (nearestList) nearestList.replaceChildren(...nearest.map(hit));
      if (nearestBox) nearestBox.hidden = !nearest.length;
      say(noFormedSide(q));
      return;
    }
    empty.hidden = true;
    for (const e of out.results) list.append(hit(e));
    say(out.total > out.results.length ? `Top ${out.results.length} of ${out.total} results for “${q}”.` : `${out.total} ${out.total === 1 ? 'result' : 'results'} for “${q}”.`);
  };
  let seq = 0;
  const run = async (query, settled = false) => {
    const mine = ++seq;
    if (!query.trim()) { win.clearTimeout(reportTimer); render(query, { results: [] }); return; }
    say('Searching…');
    try {
      const all = await load();
      if (mine !== seq) return;
      const out = search(all, query);
      render(query, out);
      settle(query, out.total || 0, settled);
    } catch {
      if (mine === seq) say('The search index could not be loaded. Try again, or browse The Buildout, the Docket, Companies and People.');
    }
  };
  const setUrl = (query) => {
    const url = new URL(win.location.href);
    if (query.trim()) url.searchParams.set('q', query.trim()); else url.searchParams.delete('q');
    win.history.replaceState(null, '', url);
  };
  const initial = new URL(win.location.href).searchParams.get('q') || '';
  if (initial) input.value = initial;
  form.addEventListener('submit', (event) => { event.preventDefault(); setUrl(input.value); run(input.value, true); });
  let timer;
  input.addEventListener('input', () => { win.clearTimeout(timer); timer = win.setTimeout(() => { setUrl(input.value); run(input.value); }, 160); });
  input.focus();
  if (initial.trim()) run(initial, true); else load().catch(() => {});
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(document, window));
  else init(document, window);
}
