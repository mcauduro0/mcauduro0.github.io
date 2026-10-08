// DeepStack search: one tokenizer shared by the build-time index (src/search-index.mjs) and the
// browser, plus the scoring the /search/ page runs on dist/search.json. No dependencies, no
// storage, and the only network call is the index itself.
//
// Scoring: every query term must match at least one field of an entry (a word-prefix match on the
// title, the excerpt or the token list). A title match outranks an excerpt match, which outranks a
// token match; exact words score a little above prefixes. At most twenty results are shown.

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

export const TYPE_LABEL = { story: 'Story', sides: 'Who is on each side', company: 'Company', person: 'Person', note: 'Editorial note', test: 'Dated test' };
const TYPE_RANK = { story: 0, sides: 1, note: 2, company: 3, person: 4, test: 5 };
export const LIMIT = 20;

// The index entry, with its three fields split into words once.
export function prepare(entry) {
  return { ...entry, _title: tokenize(entry.title, { keepStopwords: true }), _excerpt: tokenize(entry.excerpt, { keepStopwords: true }), _tokens: String(entry.tokens || '').split(' ').filter(Boolean) };
}

const fieldScore = (words, term, prefixPoints, exactBonus) => {
  let best = 0;
  for (const w of words) {
    if (w === term) return prefixPoints + exactBonus;
    if (best === 0 && w.startsWith(term)) best = prefixPoints;
  }
  return best;
};

export function scoreEntry(entry, terms) {
  let total = 0;
  for (const term of terms) {
    const s = fieldScore(entry._title, term, 10, 3) + fieldScore(entry._excerpt, term, 5, 1) + fieldScore(entry._tokens, term, 2, 1);
    if (!s) return 0;
    total += s;
  }
  return total;
}

export function search(entries, query, limit = LIMIT) {
  const terms = queryTerms(query);
  if (!terms.length) return { terms, results: [] };
  const scored = [];
  for (const e of entries) {
    const score = scoreEntry(e, terms);
    if (score > 0) scored.push({ entry: e, score });
  }
  scored.sort((a, b) => b.score - a.score || (TYPE_RANK[a.entry.type] ?? 9) - (TYPE_RANK[b.entry.type] ?? 9) || a.entry.title.localeCompare(b.entry.title));
  return { terms, total: scored.length, results: scored.slice(0, limit).map((s) => s.entry) };
}

// ---------- Browser ----------
function init(doc, win) {
  const form = doc.querySelector('[data-search-form]');
  if (!form) return;
  const input = form.querySelector('input[name="q"]');
  const list = doc.getElementById('search-results');
  const status = doc.getElementById('search-status');
  const empty = doc.getElementById('search-empty');
  let entries = null;
  let loading = null;
  const load = () => {
    if (!loading) loading = fetch('/search.json', { credentials: 'omit' }).then((r) => r.json()).then((data) => { entries = data.entries.map(prepare); return entries; });
    return loading;
  };
  const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const say = (text) => { if (status) status.textContent = text; };
  const render = (query, out) => {
    list.replaceChildren();
    const q = query.trim();
    if (!q) { say(''); empty.hidden = true; return; }
    if (!out.results.length) {
      empty.hidden = false;
      empty.querySelector('[data-query]').textContent = q;
      say(`Nothing matched “${q}”.`);
      return;
    }
    empty.hidden = true;
    for (const e of out.results) {
      const li = el('li', `search-hit search-${e.type}`);
      const a = el('a');
      a.href = e.url;
      a.append(el('span', 'search-type', TYPE_LABEL[e.type] || e.type), el('strong', 'search-title', e.title), el('span', 'search-excerpt', e.excerpt));
      li.append(a);
      list.append(li);
    }
    say(out.total > out.results.length ? `Top ${out.results.length} of ${out.total} results for “${q}”.` : `${out.total} ${out.total === 1 ? 'result' : 'results'} for “${q}”.`);
  };
  let seq = 0;
  const run = async (query) => {
    const mine = ++seq;
    if (!query.trim()) { render(query, { results: [] }); return; }
    say('Searching…');
    try {
      const all = await load();
      if (mine !== seq) return;
      render(query, search(all, query));
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
  form.addEventListener('submit', (event) => { event.preventDefault(); setUrl(input.value); run(input.value); });
  let timer;
  input.addEventListener('input', () => { win.clearTimeout(timer); timer = win.setTimeout(() => { setUrl(input.value); run(input.value); }, 160); });
  input.focus();
  if (initial.trim()) run(initial); else load().catch(() => {});
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(document, window));
  else init(document, window);
}
