// DeepStack Data Desk: custom interactive charts.
// The same module renders every chart at build time (Node) and re-renders it in the browser on interaction,
// so the default state is always present in the HTML and works without JavaScript.

const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MINUS = '\u2212';
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pct = (v) => `${clamp(v, 0, 100).toFixed(2)}%`;

export function num(value, decimals = 0) {
  return Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmt(value, { prefix = '', suffix = '', decimals = 0, signed = false } = {}) {
  const sign = value < 0 ? MINUS : signed && value > 0 ? '+' : '';
  return `${sign}${prefix}${num(value, decimals)}${suffix}`;
}

export function money(value) {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(value < 1e10 ? 2 : 1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(value < 1e7 ? 2 : 1)}M`;
  if (value >= 1000) return `$${Math.round(value).toLocaleString('en-US')}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(value < 0.01 ? 3 : 2)}`;
}

// ---------- Pure calculations (unit-tested in scripts/check-interactions.mjs) ----------

export function denominatorMath(spec, state) {
  const pe = spec.pe / (1 + state.eps / 100);
  const ey = 100 / pe;
  const gap = Math.round((ey - state.y) * 100);
  return { pe, ey, gap };
}

export function hurdleYears(runRate, needed, growth) {
  return Math.log(needed / runRate) / Math.log(1 + growth / 100);
}

export function pathReturn(from, to) {
  return (to / from - 1) * 100;
}

export function multipleOf(value, base) {
  return value / base;
}

export function capexPace(quarter, quarterDays) {
  const perDay = quarter / quarterDays; // billions per day
  return { perDay, perSecond: (perDay * 1e9) / 86400 };
}

export function logPosition(value, lo, hi) {
  return ((Math.log10(value) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * 100;
}

export function curveChange(now, then) {
  return Math.round((now - then) * 100);
}

export function realMath(nominal, real, infl) {
  const mine = nominal - infl;
  return { be: nominal - real, mine, gap: Math.round((mine - real) * 100) };
}

export function indexSeries(points, baseDate) {
  const base = points.find(([d]) => d === baseDate);
  if (!base) return [];
  return points.filter(([d]) => d >= baseDate).map(([d, v]) => [d, (v / base[1]) * 100]);
}

export function windowed(points, range) {
  return String(range) === 'all' ? points.slice() : points.slice(-Number(range));
}

// ---------- Shared pieces ----------

const segmented = (key, options, current, label) => `<div class="seg" role="group" aria-label="${esc(label)}">${options.map((o) => `<button type="button" data-set="${key}" data-value="${esc(o.id)}" aria-pressed="${String(o.id) === String(current)}">${esc(o.label)}</button>`).join('')}</div>`;

const slider = ({ key, label, min, max, step, value, out, hint = '' }) => `<label class="slider"><span class="slider-top"><span>${esc(label)}</span><output data-out="${key}">${esc(out)}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-set="${key}" aria-valuetext="${esc(out)}">${hint ? `<span class="slider-hint">${hint}</span>` : ''}</label>`;

const table = (head, rows) => `<div class="table-scroll"><table><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;

const impliedTag = '<span class="tag-implied">implied</span>';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const utcDate = (d) => new Date(Date.parse(`${d}T12:00:00Z`));
const monthLabel = (d) => `${SHORT_MONTHS[utcDate(d).getUTCMonth()]} ’${String(utcDate(d).getUTCFullYear()).slice(2)}`;
const monthLong = (d) => `${SHORT_MONTHS[utcDate(d).getUTCMonth()]} ${utcDate(d).getUTCFullYear()}`;
const qLabel = (d) => `Q${Math.floor(utcDate(d).getUTCMonth() / 3) + 1} ${utcDate(d).getUTCFullYear()}`;
const qShort = (d) => `Q${Math.floor(utcDate(d).getUTCMonth() / 3) + 1} ’${String(utcDate(d).getUTCFullYear()).slice(2)}`;
const pctVal = (v) => `${Number.isInteger(Math.round(v * 100) / 10) ? v.toFixed(1) : v.toFixed(2)}%`;
const spread = (n, count) => { if (n <= count) return [...Array(n).keys()]; return [...Array(count).keys()].map((i) => Math.round((i * (n - 1)) / (count - 1))); };

// Responsive line chart: SVG strokes scale with the box; every label is HTML so it stays legible on phones.
function lineChart({ xMin, xMax, yMin, yMax, yTicks, yFmt, xTicks = [], refs = [], series = [], dots = [] }) {
  const X = (v) => (((v - xMin) / ((xMax - xMin) || 1)) * 100).toFixed(2);
  const Y = (v) => ((1 - (v - yMin) / ((yMax - yMin) || 1)) * 100).toFixed(2);
  const d = (pts) => pts.map(([a, b], i) => `${i ? 'L' : 'M'}${X(a)} ${Y(b)}`).join(' ');
  const hline = (cls, v) => `<line class="${cls}" x1="0" x2="100" y1="${Y(v)}" y2="${Y(v)}" vector-effect="non-scaling-stroke"/>`;
  return `<div class="lc" aria-hidden="true">
<div class="lc-area">
<div class="lc-y">${yTicks.map((t) => `<span style="top:${Y(t)}%">${esc(yFmt(t))}</span>`).join('')}</div>
<div class="lc-plot">
<svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">${yTicks.map((t) => hline('lc-grid', t)).join('')}${refs.map((r) => hline('lc-ref', r.y)).join('')}${series.map((s) => `<path class="lc-line lc-${s.key}${s.dashed ? ' is-dashed' : ''}" d="${d(s.points)}" vector-effect="non-scaling-stroke"/>`).join('')}</svg>
${refs.filter((r) => r.label).map((r) => `<span class="lc-ref-label" style="top:${Y(r.y)}%">${esc(r.label)}</span>`).join('')}
${dots.map((p) => `<span class="lc-dot lc-${p.key}${p.below ? ' is-below' : ''}" style="left:${X(p.x)}%;top:${Y(p.y)}%">${p.label ? `<b>${esc(p.label)}</b>` : ''}</span>`).join('')}
</div>
</div>
<div class="lc-x">${xTicks.map((t) => `<span style="left:${X(t.x)}%">${esc(t.label)}</span>`).join('')}</div>
</div>`;
}

const niceRange = (values, step) => [Math.floor(Math.min(...values) / step) * step, Math.ceil(Math.max(...values) / step) * step];
const ticksFor = (lo, hi, step) => { const out = []; for (let t = lo; t <= hi + step / 1000; t += step) out.push(Number(t.toFixed(4))); return out; };
const liveLegend = (items) => `<p class="legend lc-legend">${items.map((i) => `<span><i class="lkey lkey-${i.key}${i.dashed ? ' is-dashed' : ''}"></i>${esc(i.label)}</span>`).join('')}</p>`;

// ---------- Chart types ----------

const TYPES = {};

// UX-0.9 (10 October 2026): the gap between the forward earnings yield and the 10-year Treasury yield
// is a valuation sensitivity, not a cushion, a risk premium or a comparable return; the tool says so.
export const DENOMINATOR_GAP_LABEL = 'Forward earnings yield minus 10-year Treasury yield';
export const DENOMINATOR_NOTE = 'This is a valuation sensitivity, not a risk-adjusted return comparison. Earnings are not contractual distributions, and the two assets differ in duration, growth, inflation exposure and risk.';
TYPES.denominator = {
  state: (spec) => ({ eps: 0, y: spec.treasury }),
  labels: {
    eps: (s) => fmt(s.eps, { suffix: '%', signed: true }),
    y: (s) => `${s.y.toFixed(2)}%`
  },
  controls(spec, s) {
    return `<div class="sliders">
${slider({ key: 'eps', label: 'Change in forward earnings', min: -40, max: 20, step: 1, value: s.eps, out: this.labels.eps(s) })}
${slider({ key: 'y', label: '10-year Treasury yield', min: 3.5, max: 6.5, step: 0.01, value: s.y.toFixed(2), out: this.labels.y(s) })}
</div>
<div class="presets" role="group" aria-label="Scenarios">${spec.presets.map((p) => `<button type="button" data-preset="${esc(JSON.stringify({ eps: p.eps, y: p.y }))}" aria-pressed="${p.eps === s.eps && p.y === s.y}">${esc(p.label)}</button>`).join('')}</div>`;
  },
  plot(spec, s) {
    const { pe, ey, gap } = denominatorMath(spec, s);
    const scaleMax = 8;
    const peMin = 12;
    const peMax = 32;
    const pePos = (v) => ((clamp(v, peMin, peMax) - peMin) / (peMax - peMin)) * 100;
    const tone = gap < 0 ? 'neg' : 'pos';
    return `<div class="dn-stats">
  <p class="dn-stat"><span class="dn-label">Multiple at today’s prices</span><span class="dn-value">${pe.toFixed(1)}x</span></p>
  <p class="dn-stat"><span class="dn-label">Stocks’ earnings yield</span><span class="dn-value">${ey.toFixed(2)}%</span></p>
  <p class="dn-stat dn-${tone}"><span class="dn-label">${DENOMINATOR_GAP_LABEL}</span><span class="dn-value">${fmt(gap, { suffix: ' bp', signed: true })}</span></p>
</div>
<div class="dn-bars" aria-hidden="true">
  <div class="dn-row"><span>S&amp;P 500 earnings yield</span><span class="track"><span class="bar bar-amber" style="width:${pct((ey / scaleMax) * 100)}"></span></span><b>${ey.toFixed(2)}%</b></div>
  <div class="dn-row"><span>10-year Treasury yield</span><span class="track"><span class="bar bar-ink" style="width:${pct((s.y / scaleMax) * 100)}"></span></span><b>${s.y.toFixed(2)}%</b></div>
</div>
<div class="pe-scale" aria-hidden="true">
  <span class="pe-track">${spec.benchmarks.map((b) => `<span class="pe-tick" style="left:${pct(pePos(b.pe))}"></span>`).join('')}<span class="pe-marker" style="left:${pct(pePos(pe))}"><span>${pe.toFixed(1)}x</span></span></span>
  <span class="pe-ends"><span>${peMin}x</span><span>${peMax}x</span></span>
</div>
<ul class="pe-bench">${spec.benchmarks.map((b) => { const d = pe - b.pe; return `<li><span>${esc(b.label)}</span><b>${b.pe.toFixed(1)}x</b><em class="${d > 0 ? 'neg' : 'pos'}">${Math.abs(d) < 0.05 ? 'same as today' : `today ${Math.abs(d).toFixed(1)}x ${d > 0 ? 'richer' : 'cheaper'}`}</em></li>`; }).join('')}</ul>
<p class="fine dn-note">${DENOMINATOR_NOTE}</p>`;
  },
  readout(spec, s) {
    const { pe, ey, gap } = denominatorMath(spec, s);
    const verdict = gap < 0 ? `The 10-year Treasury yields ${Math.abs(gap)} basis points more than the forward earnings yield.` : gap === 0 ? 'The forward earnings yield and the 10-year Treasury yield are equal.' : `The forward earnings yield is ${gap} basis points above the 10-year Treasury yield.`;
    return `At ${pe.toFixed(1)}x, stocks yield ${ey.toFixed(2)}% on forward profits against ${s.y.toFixed(2)}% on the 10-year. ${verdict}`;
  },
  table(spec) {
    const rows = spec.presets.map((p) => { const m = denominatorMath(spec, p); return [p.label, fmt(p.eps, { suffix: '%', signed: true }), `${p.y.toFixed(2)}%`, `${m.pe.toFixed(1)}x`, `${m.ey.toFixed(2)}%`, fmt(m.gap, { suffix: ' bp', signed: true })]; });
    return table(['Scenario', 'Earnings change', '10-year yield', 'Multiple', 'Earnings yield', 'Yield gap'], rows);
  }
};

TYPES.ladder = {
  state: (spec) => ({ sel: spec.selected }),
  controls(spec, s) {
    const chip = (m) => `<button type="button" class="chip chip-${m.kind}" data-set="sel" data-value="${m.id}" aria-pressed="${m.id === s.sel}"><b>${m.kind === 'policy' ? `${m.range[0].toFixed(2)}–${m.range[1].toFixed(2)}%` : `${m.value.toFixed(2)}%`}</b><span>${esc(m.label)}</span></button>`;
    const observed = spec.markers.filter((m) => m.kind !== 'threshold');
    const thresholds = spec.markers.filter((m) => m.kind === 'threshold');
    return `<div class="chips"><p class="chips-label">Where it is</p><div role="group" aria-label="Observed rates">${observed.map(chip).join('')}</div></div>
<div class="chips"><p class="chips-label">Where it breaks</p><div role="group" aria-label="Investor thresholds">${thresholds.map(chip).join('')}</div></div>`;
  },
  plot(spec, s) {
    const pos = (v) => ((v - spec.min) / (spec.max - spec.min)) * 100;
    const ticks = [];
    for (let v = Math.ceil(spec.min * 2) / 2; v <= spec.max + 1e-9; v += 0.5) ticks.push(v);
    const sel = spec.markers.find((m) => m.id === s.sel) || spec.markers[0];
    const total = spec.decomposition.parts.reduce((a, p) => a + p.value, 0);
    const r = spec.real;
    return `<div class="ladder" aria-hidden="true">
  <div class="ladder-track">
    ${ticks.map((t) => `<span class="ladder-tick" style="left:${pct(pos(t))}"><span>${t.toFixed(1)}%</span></span>`).join('')}
    ${spec.markers.map((m) => m.kind === 'policy'
      ? `<span class="ladder-range${m.id === sel.id ? ' is-sel' : ''}" style="left:${pct(pos(m.range[0]))};width:${pct(pos(m.range[1]) - pos(m.range[0]))}"></span>`
      : `<span class="ladder-dot ladder-${m.kind}${m.id === sel.id ? ' is-sel' : ''}" style="left:${pct(pos(m.value))}"></span>`).join('')}
    <span class="ladder-flag" style="left:${pct(pos(sel.value))}"><span>${sel.kind === 'policy' ? `${sel.range[0].toFixed(2)}–${sel.range[1].toFixed(2)}%` : `${sel.value.toFixed(2)}%`}</span></span>
  </div>
</div>
<div class="ladder-card ladder-card-${sel.kind}">
  <p class="ladder-card-top"><span>${esc(sel.label)}</span>${sel.date ? `<time>${esc(sel.date)}</time>` : ''}</p>
  <p>${esc(sel.text)}</p>
  <p class="ladder-who">${sel.kind === 'threshold' ? 'Threshold set by' : 'Source'}: ${esc(sel.who)}</p>
</div>
<div class="ladder-extra">
  <div class="decomp"><p class="mini-label">${esc(spec.decomposition.label)}</p><div class="decomp-bar">${spec.decomposition.parts.map((p, i) => `<span class="decomp-part decomp-${i}" style="width:${pct((p.value / total) * 100)}">${p.value / total > 0.2 ? `<b>${p.value} bp</b>` : ''}</span>`).join('')}</div><p class="decomp-legend">${spec.decomposition.parts.map((p, i) => `<span><i class="decomp-key decomp-${i}"></i>${esc(p.label)}: ${p.value} bp</span>`).join('')}</p></div>
  <div class="realg"><p class="mini-label">Real 10-year yield vs. the TSCS kill switch</p><div class="realg-track"><span class="realg-fill" style="width:${pct(((r.value - 2) / 1.5) * 100)}"></span><span class="realg-kill" style="left:${pct(((r.kill - 2) / 1.5) * 100)}"></span></div><p class="realg-legend"><span>${r.value.toFixed(2)}% on ${esc(r.date)}</span><span>Kill switch ${r.kill.toFixed(2)}%: ${Math.round((r.kill - r.value) * 100)} bp away</span></p></div>
</div>`;
  },
  readout(spec, s) {
    const m = spec.markers.find((x) => x.id === s.sel) || spec.markers[0];
    const level = m.kind === 'policy' ? `${m.range[0].toFixed(2)}% to ${m.range[1].toFixed(2)}%` : `${m.value.toFixed(2)}%`;
    return `${m.label}${m.date ? `, ${m.date}` : ''}: ${level}. ${m.text}`;
  },
  table(spec) {
    return table(['Level', 'What it is', 'Date', 'Source'], spec.markers.map((m) => [m.kind === 'policy' ? `${m.range[0].toFixed(2)}–${m.range[1].toFixed(2)}%` : `${m.value.toFixed(2)}%`, m.label, m.date || 'Threshold', m.who]));
  }
};

TYPES.path = {
  state: (spec) => ({ entry: spec.entries[0] }),
  controls(spec, s) {
    const opts = spec.entries.map((id) => { const p = spec.points.find((x) => x.id === id); return { id, label: `${p.label} ${fmt(p.value, { prefix: spec.prefix, decimals: spec.decimals })}` }; });
    return `<p class="controls-label">If you bought at</p>${segmented('entry', opts, s.entry, 'Entry point')}`;
  },
  plot(spec, s) {
    const values = spec.points.map((p) => p.value);
    const lo = Math.floor(Math.min(...values) * 0.85 / 10) * 10;
    const hi = Math.ceil(Math.max(...values) * 1.08 / 10) * 10;
    const x = (i) => 6 + (i / (spec.points.length - 1)) * 88;
    const y = (v) => 100 - ((v - lo) / (hi - lo)) * 100;
    const entry = spec.points.find((p) => p.id === s.entry);
    const target = spec.points.find((p) => p.id === spec.target);
    const ei = spec.points.indexOf(entry);
    const ti = spec.points.indexOf(target);
    const r = pathReturn(entry.value, target.value);
    const tone = r < 0 ? 'neg' : 'pos';
    const line = spec.points.map((p, i) => `${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
    const gridValues = [];
    for (let v = Math.ceil(lo / 50) * 50; v <= hi; v += 50) gridValues.push(v);
    return `<div class="path" aria-hidden="true">
  <div class="path-plot">
    ${gridValues.map((v) => `<span class="path-grid" style="top:${pct(y(v))}"><span>${fmt(v, { prefix: spec.prefix })}</span></span>`).join('')}
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
      <polyline class="path-line" points="${line}" vector-effect="non-scaling-stroke"/>
      <line class="path-entry ${tone}" x1="${x(ei).toFixed(2)}" y1="${y(entry.value).toFixed(2)}" x2="${x(ti).toFixed(2)}" y2="${y(entry.value).toFixed(2)}" vector-effect="non-scaling-stroke"/>
      <line class="path-delta ${tone}" x1="${x(ti).toFixed(2)}" y1="${y(entry.value).toFixed(2)}" x2="${x(ti).toFixed(2)}" y2="${y(target.value).toFixed(2)}" vector-effect="non-scaling-stroke"/>
    </svg>
    ${spec.points.map((p, i) => `<span class="path-pt${p.id === entry.id ? ' is-entry' : ''}${p.id === target.id ? ' is-target' : ''}" style="left:${pct(x(i))};top:${pct(y(p.value))}"><span class="path-val">${fmt(p.value, { prefix: spec.prefix, decimals: spec.decimals })}</span></span>`).join('')}
    <span class="path-badge ${tone}" style="left:${pct(x(ti))};top:${pct((y(entry.value) + y(target.value)) / 2)}">${fmt(r, { suffix: '%', decimals: 1, signed: true })}</span>
  </div>
  <div class="path-axis">${spec.points.map((p, i) => `<span style="left:${pct(x(i))}"><b>${esc(p.label)}</b>${esc(p.sub)}</span>`).join('')}</div>
</div>`;
  },
  readout(spec, s) {
    const entry = spec.points.find((p) => p.id === s.entry);
    const target = spec.points.find((p) => p.id === spec.target);
    const r = pathReturn(entry.value, target.value);
    return `Bought at the ${/^[A-Z]{2,}$/.test(entry.label) ? entry.label : entry.label.toLowerCase()} (${fmt(entry.value, { prefix: spec.prefix, decimals: spec.decimals })}): ${r < 0 ? 'down' : 'up'} ${Math.abs(r).toFixed(1)}% at the ${target.sub} close of ${fmt(target.value, { prefix: spec.prefix, decimals: spec.decimals })}.`;
  },
  table(spec) {
    const target = spec.points.find((p) => p.id === spec.target);
    return table(['Point', 'When', 'Price', 'Return to close'], spec.points.map((p) => [p.label, p.sub, fmt(p.value, { prefix: spec.prefix, decimals: spec.decimals }), p.id === target.id ? '—' : fmt(pathReturn(p.value, target.value), { suffix: '%', decimals: 1, signed: true })]));
  }
};

TYPES.rebase = {
  state: (spec) => ({ base: spec.base }),
  controls(spec, s) {
    return `<p class="controls-label">Measure everything against</p>${segmented('base', spec.items.map((i) => ({ id: i.id, label: i.short })), s.base, 'Yardstick')}`;
  },
  plot(spec, s) {
    const base = spec.items.find((i) => i.id === s.base);
    const max = Math.max(...spec.items.map((i) => i.value));
    const f = (v) => fmt(v, spec);
    return `<ol class="rows rebase-rows">${spec.items.map((i) => {
      const m = multipleOf(i.value, base.value);
      const isBase = i.id === base.id;
      return `<li class="${isBase ? 'is-base' : ''}"><span class="row-label">${esc(i.label)}<small>${esc(i.who)}</small></span><span class="track"><span class="bar" style="width:${pct((i.value / max) * 100)}"></span><span class="track-base" style="left:${pct((base.value / max) * 100)}"></span></span><span class="row-value">${i.qualifier ? `${esc(i.qualifier)} ` : ''}${f(i.value)}<small>${isBase ? 'yardstick' : `${m.toFixed(m < 10 ? 1 : 0)}× ${esc(base.short.toLowerCase())}`}</small></span></li>`;
    }).join('')}</ol>`;
  },
  readout(spec, s) {
    const base = spec.items.find((i) => i.id === s.base);
    const parts = spec.focus.filter((id) => id !== base.id).map((id) => { const i = spec.items.find((x) => x.id === id); const m = multipleOf(i.value, base.value); return `${i.label.toLowerCase()} ${i.value >= base.value ? 'are' : 'come to'} ${m.toFixed(m < 10 ? 1 : 0)} times`; });
    const subject = parts.length ? parts.join(', and ') : 'every figure is shown';
    return `Measured against ${base.label.toLowerCase()} (${base.qualifier ? `${base.qualifier} ` : ''}${fmt(base.value, spec)}), ${subject}${parts.length ? ' that yardstick' : ''}.`.replace(/^./, (c) => c.toUpperCase());
  },
  table(spec) {
    return table(['Measure', 'Value', 'Source'], spec.items.map((i) => [i.label, `${i.qualifier ? `${i.qualifier} ` : ''}${fmt(i.value, spec)}`, i.who]));
  }
};

TYPES.hurdle = {
  state: (spec) => ({ g: spec.growth }),
  labels: { g: (s) => `${s.g}% a year` },
  controls(spec, s) {
    return `<div class="sliders">${slider({ key: 'g', label: 'Annual growth in cloud revenue', min: spec.min, max: spec.max, step: 1, value: s.g, out: this.labels.g(s) })}</div>`;
  },
  plot(spec, s) {
    const years = hurdleYears(spec.runRate, spec.needed, s.g);
    const n = Math.min(Math.ceil(years - 1e-9), 9);
    const path = Array.from({ length: n + 1 }, (_, i) => spec.runRate * (1 + s.g / 100) ** i);
    const top = Math.max(spec.needed * 1.15, ...path);
    const backlog = spec.backlogs.reduce((a, b) => a + b.value, 0);
    return `<div class="hurdle" aria-hidden="true">
  <div class="hurdle-plot">
    <span class="hurdle-line" style="bottom:${pct((spec.needed / top) * 100)}"><span>Hurdle $${spec.needed}B</span></span>
    ${path.map((v, i) => `<span class="hurdle-col${i === 0 ? ' is-now' : ''}${v >= spec.needed ? ' is-over' : ''}" style="height:${pct((v / top) * 100)}"><b>$${Math.round(v).toLocaleString('en-US')}B</b><i>${i === 0 ? 'Now' : i}</i></span>`).join('')}
    ${Math.ceil(years - 1e-9) > 9 ? '<span class="hurdle-more">Still short after nine years</span>' : ''}
  </div>
  <p class="hurdle-axis">Years from today</p>
</div>
<div class="hurdle-stats">
  <p><span>Years to the hurdle</span><b>${years.toFixed(1)}</b></p>
  <p><span>Run rate today</span><b>$${spec.runRate}B</b></p>
  <p><span>Booked across three clouds</span><b>$${(backlog / 1000).toFixed(2)}T</b></p>
</div>`;
  },
  readout(spec, s) {
    const years = hurdleYears(spec.runRate, spec.needed, s.g);
    return `At ${s.g}% a year, cloud revenue needs about ${years.toFixed(1)} years to grow from $${spec.runRate} billion to $${spec.needed} billion. The spending it has to justify lands next year.`;
  },
  table(spec) {
    const rows = [20, 30, 40, 50, 60].map((g) => [`${g}% a year`, `${hurdleYears(spec.runRate, spec.needed, g).toFixed(1)} years`]);
    return table(['Growth rate', `Time to reach $${spec.needed}B from $${spec.runRate}B`], rows) + table(['Contracted revenue', 'Value'], spec.backlogs.map((b) => [b.label, `$${b.value}B`]));
  }
};

TYPES.capex = {
  state: () => ({}),
  controls() {
    return `<div class="clock" data-clock><p class="clock-label">Spent by the four since you opened this page</p><p class="clock-value" data-clock-value>$0</p><button type="button" class="clock-reset" data-clock-reset>Restart the clock</button></div>`;
  },
  plot(spec) {
    const max = Math.max(...spec.items.map((i) => i.value));
    const { perDay, perSecond } = capexPace(spec.quarter, spec.quarterDays);
    return `<ol class="rows">${spec.items.map((i, k) => `<li><span class="row-label">${esc(i.label)}${i.implied ? impliedTag : ''}</span><span class="track"><span class="bar${i.implied ? ' is-implied' : ''}${k === spec.items.length - 1 ? ' bar-amber' : ''}" style="width:${pct((i.value / max) * 100)}"></span></span><span class="row-value">$${num(i.value, i.value < 100 ? 1 : 0)}B</span></li>`).join('')}</ol>
<div class="capex-stats">
  <p><span>Per day</span><b>$${perDay.toFixed(2)}B</b></p>
  <p><span>Per second</span><b>$${Math.round(perSecond).toLocaleString('en-US')}</b></p>
  <p><span>New debt as share of capex</span><b>${spec.debtShare.map((d) => `${d.value}%`).join(' → ')}</b><small>${spec.debtShare.map((d) => esc(d.label)).join(' → ')}</small></p>
</div>`;
  },
  readout(spec) {
    const { perDay, perSecond } = capexPace(spec.quarter, spec.quarterDays);
    return `At last quarter’s pace the four spend about $${perDay.toFixed(1)} billion a day, or roughly $${(Math.round(perSecond / 100) * 100).toLocaleString('en-US')} every second.`;
  },
  table(spec) {
    return table(['Quarter', 'Capital spending'], spec.items.map((i) => [`${i.label}${i.implied ? ' (implied)' : ''}`, `$${num(i.value, 1)}B`])) + table(['Period', 'New debt as share of capital spending'], spec.debtShare.map((d) => [d.label, `${d.value}%`]));
  },
  mount(fig, spec) {
    const out = fig.querySelector('[data-clock-value]');
    const reset = fig.querySelector('[data-clock-reset]');
    if (!out) return;
    const { perSecond } = capexPace(spec.quarter, spec.quarterDays);
    let start = Date.now();
    const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = () => { out.textContent = `$${Math.round(((Date.now() - start) / 1000) * perSecond).toLocaleString('en-US')}`; };
    tick();
    setInterval(tick, reduce ? 1000 : 120);
    if (reset) reset.addEventListener('click', () => { start = Date.now(); tick(); });
  }
};

TYPES.taskcost = {
  state: (spec) => ({ scale: 'linear', vol: spec.volume }),
  labels: { vol: (s, spec) => `${spec.volumes[s.vol].toLocaleString('en-US')} tasks a month` },
  controls(spec, s) {
    return `${segmented('scale', [{ id: 'linear', label: 'Linear scale' }, { id: 'log', label: 'Log scale' }], s.scale, 'Scale')}
<div class="sliders">${slider({ key: 'vol', label: 'Monthly volume', min: 0, max: spec.volumes.length - 1, step: 1, value: s.vol, out: this.labels.vol(s, spec) })}</div>`;
  },
  plot(spec, s) {
    const max = Math.max(...spec.items.map((i) => i.value));
    const min = Math.min(...spec.items.map((i) => i.value));
    const lo = 10 ** Math.floor(Math.log10(min));
    const hi = 10 ** Math.ceil(Math.log10(max));
    const width = (v) => (s.scale === 'log' ? Math.max(logPosition(v, lo, hi), 1.5) : (v / max) * 100);
    const volume = spec.volumes[s.vol];
    return `<ol class="rows task-rows">${spec.items.map((i, k) => `<li><span class="row-label">${esc(i.label)}<small>${money(i.value)} per task</small></span><span class="track"><span class="bar${k === 0 ? ' bar-amber' : ''}" style="width:${pct(width(i.value))}"></span></span><span class="row-value">${money(i.value * volume)}<small>a month</small></span></li>`).join('')}</ol>
<p class="scale-note">${s.scale === 'log' ? `Log scale from ${money(lo)} to ${money(hi)} per task: each step is ten times the last.` : 'Linear scale: bar length is proportional to price.'}</p>`;
  },
  readout(spec, s) {
    const volume = spec.volumes[s.vol];
    const max = Math.max(...spec.items.map((i) => i.value));
    const min = Math.min(...spec.items.map((i) => i.value));
    return `At ${volume.toLocaleString('en-US')} tasks a month: ${spec.items.map((i) => `${i.label} ${money(i.value * volume)}`).join(', ')}. The most expensive model costs ${Math.round(max / min)} times the cheapest.`;
  },
  table(spec) {
    return table(['Model', 'Cost per task', ...spec.volumes.map((v) => `${v.toLocaleString('en-US')} tasks`)], spec.items.map((i) => [i.label, money(i.value), ...spec.volumes.map((v) => money(i.value * v))]));
  }
};

function viewRows(view, sort, groups) {
  const f = (v) => fmt(v, view);
  if (view.series) {
    const max = Math.max(...view.items.flatMap((i) => i.values));
    return `<p class="legend">${view.series.map((name, k) => `<span><i class="key key-${k}"></i>${esc(name)}</span>`).join('')}</p><ol class="rows series-rows">${view.items.map((i) => `<li><span class="row-label">${esc(i.label)}</span><span class="series-bars">${i.values.map((v, k) => `<span class="track"><span class="bar key-${k}${i.implied && i.implied[k] ? ' is-implied' : ''}" style="width:${pct((v / max) * 100)}"></span></span>`).join('')}</span><span class="row-value series-values">${i.values.map((v, k) => `<span>${f(v)}${i.implied && i.implied[k] ? impliedTag : ''}</span>`).join('')}</span></li>`).join('')}</ol>`;
  }
  if (view.items.some((i) => i.range)) {
    const max = Math.max(...view.items.map((i) => i.range[1])) * 1.1;
    return `<ol class="rows">${view.items.map((i) => `<li><span class="row-label">${esc(i.label)}</span><span class="track"><span class="bar bar-range" style="left:${pct((i.range[0] / max) * 100)};width:${pct(((i.range[1] - i.range[0]) / max) * 100)}"></span></span><span class="row-value">${f(i.range[0])}–${f(i.range[1]).replace(view.prefix || '', '')}</span></li>`).join('')}</ol>`;
  }
  let items = view.items.slice();
  if (sort === 'move') items.sort((a, b) => b.value - a.value);
  const maxPos = Math.max(0, ...items.map((i) => i.value));
  const maxNeg = Math.max(0, ...items.map((i) => -i.value));
  const range = maxPos + maxNeg || 1;
  const zero = (maxNeg / range) * 100;
  const row = (i) => {
    const w = (Math.abs(i.value) / range) * 100;
    const left = i.value < 0 ? zero - w : zero;
    const tone = i.tone || (i.value < 0 ? 'neg' : 'pos');
    return `<li><span class="row-label">${esc(i.label)}${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</span><span class="track">${maxNeg ? `<span class="track-zero" style="left:${pct(zero)}"></span>` : ''}<span class="bar bar-${tone}" style="left:${pct(left)};width:${pct(Math.max(w, 0.8))}"></span></span><span class="row-value ${tone}">${f(i.value)}</span></li>`;
  };
  if (sort === 'group' && groups) {
    return `<div class="grouped">${groups.map((g) => { const gi = items.filter((i) => i.group === g); return gi.length ? `<p class="group-label">${esc(g)}</p><ol class="rows">${gi.map(row).join('')}</ol>` : ''; }).join('')}</div>`;
  }
  return `<ol class="rows">${items.map(row).join('')}</ol>`;
}

TYPES.views = {
  state: (spec) => ({ view: spec.views[0].id, sort: spec.sortable ? spec.sortable[0].id : 'reported' }),
  controls(spec, s) {
    const parts = [];
    if (spec.views.length > 1) parts.push(segmented('view', spec.views.map((v) => ({ id: v.id, label: v.label })), s.view, 'View'));
    if (spec.sortable) parts.push(segmented('sort', spec.sortable, s.sort, 'Order'));
    return parts.join('');
  },
  plot(spec, s) {
    const view = spec.views.find((v) => v.id === s.view) || spec.views[0];
    return `<p class="unit-label">${esc(view.unitLabel)}</p>${viewRows(view, s.sort, spec.groups)}`;
  },
  readout(spec, s) {
    return (spec.views.find((v) => v.id === s.view) || spec.views[0]).readout;
  },
  table(spec) {
    return spec.views.map((view) => {
      if (view.series) return table([view.unitLabel, ...view.series], view.items.map((i) => [i.label, ...i.values.map((v, k) => `${fmt(v, view)}${i.implied && i.implied[k] ? ' (implied)' : ''}`)]));
      if (view.items.some((i) => i.range)) return table([view.unitLabel, 'Range'], view.items.map((i) => [i.label, `${fmt(i.range[0], view)} to ${fmt(i.range[1], view)}`]));
      return table([view.unitLabel, 'Value'], view.items.map((i) => [i.label, fmt(i.value, view)]));
    }).join('');
  }
};

TYPES.curve = {
  state: (spec) => ({ cmp: spec.selected }),
  pick: (spec, s) => spec.compares.find((c) => c.id === s.cmp) || spec.compares[0],
  controls(spec, s) {
    return segmented('cmp', spec.compares.map((c) => ({ id: c.id, label: c.label })), s.cmp, 'Compare today with');
  },
  plot(spec, s) {
    const cmp = this.pick(spec, s);
    const last = spec.tenors.length - 1;
    const today = spec.today.map((v, i) => [i, v]);
    const then = Object.entries(cmp.points).map(([t, v]) => [spec.tenors.indexOf(t), v]).filter(([i]) => i >= 0).sort((a, b) => a[0] - b[0]);
    const [yMin, yMax] = niceRange([...spec.today, ...then.map((p) => p[1]), ...spec.refs.map((r) => r.v)], 0.5);
    const chart = lineChart({
      xMin: 0, xMax: last, yMin, yMax, yTicks: ticksFor(yMin, yMax, 0.5), yFmt: (t) => `${t.toFixed(1)}%`,
      xTicks: spec.tenors.map((t, i) => ({ x: i, label: t })),
      refs: spec.refs.map((r) => ({ y: r.v, label: r.label })),
      series: [{ key: 'then', points: then, dashed: true }, { key: 'now', points: today }],
      dots: [...then.map(([i, v]) => ({ key: 'then', x: i, y: v, below: true, label: i === then.at(-1)[0] ? `${v.toFixed(2)}%` : '' })), ...today.map(([i, v]) => ({ key: 'now', x: i, y: v, label: i === last ? `${v.toFixed(2)}%` : '' }))]
    });
    const view = { suffix: ' bp', signed: true, items: then.map(([i, v]) => { const c = curveChange(spec.today[i], v); return { label: spec.tenors[i], value: c, tone: c > 0 ? 'neg' : 'pos' }; }) };
    return `${liveLegend([{ key: 'now', label: spec.todayLabel }, { key: 'then', label: `${cmp.label}, ${cmp.dateLabel}`, dashed: true }])}${chart}<p class="unit-label">Change since ${esc(cmp.dateLabel)}, basis points. Rising yields shown in red: dearer money for borrowers.</p>${viewRows(view, 'reported')}`;
  },
  readout(spec, s) {
    const cmp = this.pick(spec, s);
    const ch = (t) => curveChange(spec.today[spec.tenors.indexOf(t)], cmp.points[t]);
    const short = ch('2Y'); const long = ch('30Y'); const steep = long - short;
    const bpS = (n) => fmt(n, { suffix: ' bp', signed: true });
    return `Since ${cmp.dateLabel}, the 2-year has moved ${bpS(short)} and the 30-year ${bpS(long)}. ${steep > 5 ? `The curve has steepened by ${steep} basis points: the long end is leading.` : steep < -5 ? `The curve has flattened by ${-steep} basis points: the front end is leading.` : 'Both ends have moved together.'}`;
  },
  table(spec) {
    return table(['Tenor', spec.todayLabel, ...spec.compares.map((c) => `${c.label} (${c.dateLabel})`)], spec.tenors.map((t, i) => [t, `${spec.today[i].toFixed(2)}%`, ...spec.compares.map((c) => (typeof c.points[t] === 'number' ? `${c.points[t].toFixed(2)}%` : '—'))]));
  }
};

TYPES.realrates = {
  state(spec) {
    const first = spec.presets[0];
    return { h: spec.selected, infl: first.id === 'market' ? this.priced(this.pick(spec, { h: spec.selected })) : first.infl };
  },
  labels: { infl: (s) => `${Number(s.infl).toFixed(2)}%` },
  pick: (spec, s) => spec.horizons.find((h) => h.id === s.h) || spec.horizons[0],
  // Inflation priced at a maturity, rounded to the slider's 0.01 step.
  priced: (h) => Number((h.nominal - h.real).toFixed(2)),
  // "What bonds price" follows the maturity: switching maturity while on it moves the assumption too.
  adjust(spec, s, patch) {
    if (!patch.h || patch.h === s.h) return patch;
    const was = this.priced(this.pick(spec, s));
    return Math.abs(Number(s.infl) - was) < 1e-9 ? { ...patch, infl: this.priced(this.pick(spec, { h: patch.h })) } : patch;
  },
  sync(fig, spec, s) {
    const b = fig.querySelector('button[data-preset-id="market"]');
    if (!b) return;
    const v = this.priced(this.pick(spec, s));
    b.dataset.preset = JSON.stringify({ infl: v });
    const val = b.querySelector('b');
    if (val) val.textContent = pctVal(v);
  },
  controls(spec, s) {
    return `${segmented('h', spec.horizons.map((h) => ({ id: h.id, label: `${h.id.replace('Y', '')}-year` })), s.h, 'Maturity')}
<div class="sliders">${slider({ key: 'infl', label: 'Your inflation assumption, per year', min: 0.5, max: 5, step: 0.01, value: Number(s.infl).toFixed(2), out: this.labels.infl(s) })}</div>
<div class="presets" role="group" aria-label="Inflation assumptions">${spec.presets.map((p) => { const v = p.id === 'market' ? this.priced(this.pick(spec, s)) : p.infl; return `<button type="button"${p.id ? ` data-preset-id="${esc(p.id)}"` : ''} data-preset="${esc(JSON.stringify({ infl: v }))}" aria-pressed="${Math.abs(v - s.infl) < 1e-9}">${esc(p.label)} <b>${pctVal(v)}</b></button>`; }).join('')}</div>`;
  },
  plot(spec, s) {
    const h = this.pick(spec, s);
    const { be, mine, gap } = realMath(h.nominal, h.real, s.infl);
    const scale = Math.max(6, Math.ceil(h.nominal + 0.5));
    const w = (v) => pct((Math.max(v, 0) / scale) * 100);
    const tone = gap < 0 ? 'neg' : 'pos';
    const survey = { suffix: '%', decimals: 1, items: spec.surveys.map((x, i) => ({ label: x.label, value: x.value, tone: i === 0 ? 'ink' : 'amber' })) };
    return `<div class="dn-stats rr-stats">
  <p class="dn-stat"><span class="dn-label">${esc(h.id.replace('Y', ''))}-year Treasury</span><span class="dn-value">${h.nominal.toFixed(2)}%</span></p>
  <p class="dn-stat"><span class="dn-label">Real yield the market pays</span><span class="dn-value">${h.real.toFixed(2)}%</span></p>
  <p class="dn-stat"><span class="dn-label">Inflation the market prices</span><span class="dn-value">${be.toFixed(2)}%</span></p>
  <p class="dn-stat dn-${tone}"><span class="dn-label">Real yield at your inflation</span><span class="dn-value">${fmt(mine, { suffix: '%', decimals: 2 })}</span></p>
</div>
<div class="rr-bars" aria-hidden="true">
  <div class="rr-row"><span>Market split</span><span class="track"><span class="bar bar-ink" style="left:0;width:${w(h.real)}"></span><span class="bar bar-amber" style="left:${w(h.real)};width:${w(be)}"></span></span><b>${h.nominal.toFixed(2)}%</b></div>
  <div class="rr-row"><span>At your inflation</span><span class="track"><span class="bar bar-ink" style="left:0;width:${w(mine)}"></span><span class="bar bar-hatch" style="left:${w(mine)};width:${w(Math.min(s.infl, h.nominal))}"></span></span><b>${h.nominal.toFixed(2)}%</b></div>
  <p class="legend"><span><i class="key key-ink"></i>Real yield</span><span><i class="key key-amber"></i>Inflation the market prices</span><span><i class="key key-hatch"></i>Your inflation</span></p>
</div>
<p class="unit-label">Expected inflation, % a year</p>${viewRows(survey, 'reported')}`;
  },
  readout(spec, s) {
    const h = this.pick(spec, s);
    const { be, mine, gap } = realMath(h.nominal, h.real, s.infl);
    const cmp = Math.abs(gap) < 1 ? 'the same as inflation-protected bonds pay' : `${Math.abs(gap)} basis points ${gap < 0 ? 'below' : 'above'} what inflation-protected bonds pay`;
    return `At ${h.id.replace('Y', '')} years, Treasuries pay ${h.nominal.toFixed(2)}%, or ${h.real.toFixed(2)}% after inflation protection, so the market prices ${be.toFixed(2)}% inflation. At your ${Number(s.infl).toFixed(2)}% assumption, a lender earns ${fmt(mine, { suffix: '%', decimals: 2 })} in real terms, ${cmp}.`;
  },
  table(spec) {
    return table(['Maturity', 'Nominal yield', 'Real yield (TIPS)', 'Inflation priced'], spec.horizons.map((h) => [`${h.id.replace('Y', '')}-year`, `${h.nominal.toFixed(2)}%`, `${h.real.toFixed(2)}%`, `${(h.nominal - h.real).toFixed(2)}%`])) + table(['Expectation', 'Inflation, % a year'], spec.surveys.map((x) => [x.label, `${x.value.toFixed(2)}%`]));
  }
};

TYPES.trend = {
  state: (spec) => ({ range: spec.selected, show: 'both' }),
  controls(spec, s) {
    return segmented('range', spec.ranges, s.range, 'Window') + segmented('show', [{ id: 'both', label: 'Both' }, ...spec.series.map((x) => ({ id: x.id, label: x.label }))], s.show, 'Series');
  },
  plot(spec, s) {
    const shown = spec.series.map((x, k) => ({ ...x, k })).filter((x) => s.show === 'both' || x.id === s.show);
    const lines = shown.map((x) => ({ key: `s${x.k}`, label: x.label, pts: windowed(x.points, s.range) }));
    const withForecast = shown.some((x) => x.id === spec.forecast.of);
    const fc = withForecast ? spec.forecast.points : [];
    const t = (d) => Date.parse(`${d}T12:00:00Z`);
    const all = [...lines.flatMap((l) => l.pts), ...fc];
    const [yMin, yMax] = niceRange([...all.map((p) => p[1]), spec.target, 0], 1);
    const base = lines[0].pts;
    const xTicks = spread(base.length, 5).map((i) => ({ x: t(base[i][0]), label: monthLabel(base[i][0]) }));
    if (fc.length > 1) xTicks.push({ x: t(fc.at(-1)[0]), label: qShort(fc.at(-1)[0]) });
    const chart = lineChart({
      xMin: t(base[0][0]), xMax: t((fc.length > 1 ? fc : base).at(-1)[0]), yMin, yMax, yTicks: ticksFor(yMin, yMax, yMax - yMin > 6 ? 2 : 1), yFmt: (v) => `${v.toFixed(0)}%`, xTicks,
      refs: [{ y: spec.target, label: spec.targetLabel }],
      series: [...lines.map((l) => ({ key: l.key, points: l.pts.map(([d, v]) => [t(d), v]) })), ...(fc.length > 1 ? [{ key: 'fc', points: fc.map(([d, v]) => [t(d), v]), dashed: true }] : [])],
      dots: [...lines.map((l, i) => ({ key: l.key, x: t(l.pts.at(-1)[0]), y: l.pts.at(-1)[1], label: `${l.pts.at(-1)[1].toFixed(1)}%`, below: i > 0 })), ...(fc.length > 1 ? [{ key: 'fc', x: t(fc.at(-1)[0]), y: fc.at(-1)[1], label: `${fc.at(-1)[1].toFixed(1)}%` }] : [])]
    });
    return `${liveLegend([...lines.map((l) => ({ key: l.key, label: l.label })), ...(fc.length > 1 ? [{ key: 'fc', label: spec.forecast.label, dashed: true }] : [])])}${chart}`;
  },
  readout(spec, s) {
    const head = windowed(spec.series[0].points, s.range); const core = spec.series[1].points.at(-1);
    const last = head.at(-1);
    const above = head.filter(([, v]) => v > spec.target).length;
    const fc = spec.forecast.points.at(-1);
    return `Headline inflation was ${last[1].toFixed(1)}% in ${monthLong(last[0])}, core ${core[1].toFixed(1)}%. Since ${monthLong(head[0][0])}, headline has been above 2% in ${above} of ${head.length} months. The forecast path reaches ${fc[1].toFixed(1)}% by ${qLabel(fc[0])}.`;
  },
  table(spec) {
    const [a, b] = spec.series;
    return table(['Month', a.label, b.label], a.points.slice().reverse().map(([d, v]) => { const c = b.points.find(([k]) => k === d); return [monthLong(d), `${v.toFixed(1)}%`, c ? `${c[1].toFixed(1)}%` : '—']; })) + table(['Quarter', spec.forecast.label], spec.forecast.points.slice(1).map(([d, v]) => [qLabel(d), `${v.toFixed(1)}%`]));
  }
};

TYPES.indexed = {
  state: (spec) => ({ base: spec.selected }),
  controls(spec, s) {
    return segmented('base', spec.bases.map((b) => ({ id: b.id, label: `${b.label}, ${qLabel(b.id)}` })), s.base, 'Index to 100 at');
  },
  lines: (spec, s) => spec.series.map((x, k) => ({ key: `s${k}`, label: x.label, pts: indexSeries(x.points, s.base) })),
  plot(spec, s) {
    const lines = this.lines(spec, s);
    const t = (d) => Date.parse(`${d}T12:00:00Z`);
    const values = lines.flatMap((l) => l.pts.map((p) => p[1]));
    const step = Math.max(...values) - Math.min(...values, 100) > 60 ? 20 : 10;
    const [yMin, yMax] = niceRange([...values, 100], step);
    const base = lines[0].pts;
    const ends = lines.map((l) => l.pts.at(-1)[1]);
    const chart = lineChart({
      xMin: t(base[0][0]), xMax: t(base.at(-1)[0]), yMin, yMax, yTicks: ticksFor(yMin, yMax, step), yFmt: (v) => v.toFixed(0),
      xTicks: spread(base.length, 5).map((i) => ({ x: t(base[i][0]), label: qShort(base[i][0]) })),
      refs: [{ y: 100, label: '' }],
      series: lines.map((l) => ({ key: l.key, points: l.pts.map(([d, v]) => [t(d), v]) })),
      dots: lines.map((l, i) => ({ key: l.key, x: t(l.pts.at(-1)[0]), y: l.pts.at(-1)[1], label: fmt(l.pts.at(-1)[1] - 100, { suffix: '%', signed: true, decimals: Math.abs(l.pts.at(-1)[1] - 100) < 10 ? 1 : 0 }), below: ends[i] < Math.max(...ends) }))
    });
    return `${liveLegend(lines.map((l) => ({ key: l.key, label: l.label })))}<p class="unit-label">Index, ${esc(qLabel(s.base))} = 100 (dashed line)</p>${chart}`;
  },
  readout(spec, s) {
    const [a, b] = this.lines(spec, s).map((l) => l.pts.at(-1)[1] - 100);
    const raw = (spec.bases.find((x) => x.id === s.base) || spec.bases[0]).label;
    const label = raw.charAt(0).toLowerCase() + raw.slice(1);
    const ratio = b > 0.05 ? a / b : null;
    return `Since ${qLabel(s.base)} (${label}), ${spec.series[0].label.toLowerCase()} are ${fmt(a, { suffix: '%', signed: true, decimals: 1 })} and ${spec.series[1].label.toLowerCase()} ${fmt(b, { suffix: '%', signed: true, decimals: 1 })}. ${ratio === null ? 'Productivity has not grown over this window.' : ratio >= 1.5 ? `Profits have grown ${ratio.toFixed(1)} times faster.` : ratio > 0 ? 'The two have moved roughly together.' : 'Profits have fallen while productivity rose.'}`;
  },
  table(spec) {
    const [a, b] = spec.series;
    return table(['Quarter', `${a.label} (USD billion, annual rate)`, `${b.label} (index)`], a.points.slice().reverse().map(([d, v]) => { const c = b.points.find(([k]) => k === d); return [qLabel(d), Math.round(v).toLocaleString('en-US'), c ? c[1].toFixed(1) : '—']; }));
  }
};

// ---------- Figure ----------

const pad = (n) => String(n).padStart(2, '0');

export function renderFigure(spec, { story, headingLevel = 3, context = 'desk' } = {}) {
  const type = TYPES[spec.type];
  if (!type) throw new Error(`Unknown chart type ${spec.type}`);
  const state = type.state(spec);
  const h = `h${headingLevel}`;
  const id = `desk-${spec.id}`;
  const link = context === 'desk'
    ? `<a class="link-arrow" href="/stories/${story.slug}/">Read Part ${pad(story.part)}: ${esc(story.headline)}</a>`
    : `<a class="link-arrow" href="/data/#${id}">More in the Data Desk</a>`;
  return `<figure class="desk desk-${spec.type}" id="${id}" data-desk="${spec.type}" data-spec="${esc(JSON.stringify(spec))}" aria-labelledby="${id}-title">
<div class="desk-inner">
  <div class="desk-side">
  <header class="desk-head">
    <p class="kicker"><span class="kicker-series">Data Desk · ${spec.live ? 'Live · ' : ''}Part ${pad(story.part)}</span><span class="kicker-topic">${esc(story.section)}</span></p>
    <${h} id="${id}-title" class="desk-title">${esc(spec.title)}</${h}>
    <p class="desk-dek">${esc(spec.dek)}</p>
    ${spec.live ? `<p class="desk-asof"><span class="live-dot" aria-hidden="true"></span>Live data, updated ${esc(spec.live.asOf)}</p>` : ''}
  </header>
  <footer class="desk-foot">
    <p class="desk-read"><strong>The DeepStack read.</strong> ${esc(spec.read)}</p>
    <p class="desk-source">Source: ${esc(spec.source)}</p>
    <details class="desk-table"><summary>Show the data table</summary>${type.table(spec)}</details>
    ${link}
  </footer>
  </div>
  <div class="desk-controls">${type.controls(spec, state)}</div>
  <div class="desk-plot" data-plot>${type.plot(spec, state)}</div>
  <p class="desk-readout" data-readout aria-live="polite">${esc(type.readout(spec, state))}</p>
</div>
</figure>`;
}

// ---------- Browser ----------

function parseValue(raw) {
  return raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
}

export function mount(fig) {
  const spec = JSON.parse(fig.getAttribute('data-spec'));
  const type = TYPES[spec.type];
  if (!type) return;
  let state = type.state(spec);
  const plotEl = fig.querySelector('[data-plot]');
  const readEl = fig.querySelector('[data-readout]');
  const sync = () => {
    if (type.sync) type.sync(fig, spec, state);
    fig.querySelectorAll('button[data-set]').forEach((b) => b.setAttribute('aria-pressed', String(String(state[b.dataset.set]) === b.dataset.value)));
    fig.querySelectorAll('button[data-preset]').forEach((b) => { const p = JSON.parse(b.dataset.preset); b.setAttribute('aria-pressed', String(Object.keys(p).every((k) => Math.abs(p[k] - state[k]) < 1e-9))); });
    fig.querySelectorAll('input[data-set]').forEach((input) => {
      const key = input.dataset.set;
      if (Number(input.value) !== state[key]) input.value = state[key];
      const label = type.labels && type.labels[key] ? type.labels[key](state, spec) : String(state[key]);
      input.setAttribute('aria-valuetext', label);
      const out = fig.querySelector(`[data-out="${key}"]`);
      if (out) out.textContent = label;
    });
  };
  const render = () => {
    plotEl.innerHTML = type.plot(spec, state);
    readEl.textContent = type.readout(spec, state);
    sync();
  };
  const set = (patch) => { if (type.adjust) patch = type.adjust(spec, state, patch); state = { ...state, ...patch }; render(); };
  fig.addEventListener('input', (event) => {
    const input = event.target.closest && event.target.closest('input[data-set]');
    if (input) set({ [input.dataset.set]: parseValue(input.value) });
  });
  fig.addEventListener('click', (event) => {
    const button = event.target.closest && event.target.closest('button');
    if (!button || !fig.contains(button)) return;
    if (button.dataset.set) set({ [button.dataset.set]: parseValue(button.dataset.value) });
    else if (button.dataset.preset) set(JSON.parse(button.dataset.preset));
  });
  if (type.mount) type.mount(fig, spec);
  fig.classList.add('is-live');
  sync();
}

export function initExplorer(root) {
  const chips = root.querySelectorAll('[data-filter]');
  const search = root.querySelector('[data-search]');
  const items = root.querySelectorAll('[data-item]');
  const count = root.querySelector('[data-count]');
  let theme = 'all';
  const apply = () => {
    const q = (search ? search.value : '').trim().toLowerCase();
    let shown = 0;
    items.forEach((item) => {
      const ok = (theme === 'all' || item.dataset.theme === theme) && (!q || item.dataset.text.includes(q));
      item.hidden = !ok;
      if (ok) shown += 1;
    });
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === theme)));
    if (count) count.textContent = `${shown} of ${items.length} numbers`;
  };
  chips.forEach((c) => c.addEventListener('click', () => { theme = c.dataset.filter; apply(); }));
  if (search) search.addEventListener('input', apply);
  apply();
}

export function init(doc) {
  doc.querySelectorAll('[data-desk]').forEach((fig) => { try { mount(fig); } catch (error) { console.error('Data Desk chart failed', fig.id, error); } });
  doc.querySelectorAll('[data-explorer]').forEach(initExplorer);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(document));
  else init(document);
}
