// Weight page: log body weight — today by default, but any past day can be
// picked too, to backfill days you forgot — and see it charted over time,
// with a simple current/change/count summary. Stored as its own localStorage
// array (fuellog:weights), independent of the daily meal entries.

// Whether the history list below the chart shows everything or just the
// last 5 — reset to collapsed every time the page is freshly opened
let weightHistoryExpanded = false;

document.getElementById('toggleWeight').addEventListener('click', async ()=>{
  showView('weight');
  weightHistoryExpanded = false;
  await renderWeight();
});
document.getElementById('weightBack').addEventListener('click', ()=> showView('day'));

function loadWeights(){
  try{
    const raw = localStorage.getItem('fuellog:weights');
    const list = raw ? JSON.parse(raw) : [];
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }catch(e){
    return [];
  }
}
function saveWeights(list){
  try{ localStorage.setItem('fuellog:weights', JSON.stringify(list)); }catch(e){}
}

// One entry per day: logging again for a date that's already there overwrites it
function upsertWeight(dateKey, weight){
  const list = loadWeights();
  const idx = list.findIndex((w) => w.date === dateKey);
  if(idx >= 0) list[idx].weight = weight;
  else list.push({ date: dateKey, weight });
  saveWeights(list);
}
function deleteWeight(dateKey){
  saveWeights(loadWeights().filter((w) => w.date !== dateKey));
}

// The weight modal — opened either via "Gewicht eintragen" (defaults to today,
// pre-filled if today's already logged) or by tapping a history row (that
// day's own date + weight, for editing)
function openWeightModal(dateKey, weight){
  const dateInput = document.getElementById('wmDate');
  dateInput.max = fmtKey(new Date());
  dateInput.value = dateKey;
  document.getElementById('wmDateText').textContent = fmtLabel(parseDateKey(dateKey));
  document.getElementById('wmWeight').value = weight != null ? weight : '';
  document.getElementById('weightModal').classList.remove('hidden');
}
function closeWeightModal(){
  document.getElementById('weightModal').classList.add('hidden');
}
document.getElementById('weightAddBtn').addEventListener('click', ()=>{
  const todayKey = fmtKey(new Date());
  const existing = loadWeights().find((w) => w.date === todayKey);
  openWeightModal(todayKey, existing ? existing.weight : null);
});
// Picking a different date inside the modal pre-fills its existing value too,
// so switching to a past day acts as "edit" rather than overwriting it blind
document.getElementById('wmDate').addEventListener('change', ()=>{
  const dateKey = document.getElementById('wmDate').value;
  document.getElementById('wmDateText').textContent = fmtLabel(parseDateKey(dateKey));
  const existing = loadWeights().find((w) => w.date === dateKey);
  document.getElementById('wmWeight').value = existing ? existing.weight : '';
});
document.getElementById('weightModalCancelBtn').addEventListener('click', closeWeightModal);
document.getElementById('weightModal').addEventListener('click', (e)=>{
  if(e.target.id === 'weightModal') closeWeightModal();
});
document.getElementById('weightModalSaveBtn').addEventListener('click', async ()=>{
  const dateKey = document.getElementById('wmDate').value;
  const value = Number(document.getElementById('wmWeight').value);
  if(!dateKey || !value || value <= 0) return;
  upsertWeight(dateKey, value);
  closeWeightModal();
  await renderWeight();
});

async function renderWeight(){
  const list = loadWeights();

  document.getElementById('weightCount').textContent = list.length;
  if(list.length === 0){
    document.getElementById('weightCurrent').textContent = '–';
    document.getElementById('weightChange').textContent = '–';
    document.getElementById('weightChartWrap').innerHTML = `<div class="search-hint">${t('weightEmpty')}</div>`;
    document.getElementById('weightHistory').innerHTML = '';
    return;
  }

  const current = list[list.length - 1].weight;
  const change = current - list[0].weight;
  document.getElementById('weightCurrent').textContent = current.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' kg';
  document.getElementById('weightChange').textContent =
    (change >= 0 ? '+' : '') + change.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' kg';

  document.getElementById('weightChartWrap').innerHTML = list.length >= 2
    ? buildWeightChart(list)
    : `<div class="search-hint">${t('weightNeedMore')}</div>`;

  // Tapping a row opens the modal pre-filled with that day for quick editing;
  // the ✕ deletes it directly (stopPropagation so it doesn't also open the
  // modal). Collapsed to the last 5 by default — "Alle anzeigen" below shows
  // the rest, re-rendering with weightHistoryExpanded flipped.
  const HISTORY_COLLAPSED_COUNT = 5;
  const reversed = [...list].reverse();
  const shown = weightHistoryExpanded ? reversed : reversed.slice(0, HISTORY_COLLAPSED_COUNT);

  const historyEl = document.getElementById('weightHistory');
  historyEl.innerHTML = '';
  shown.forEach((w) => {
    const row = document.createElement('div');
    row.className = 'weight-row';
    row.innerHTML = `
      <span class="wr-date">${fmtLabel(parseDateKey(w.date))}</span>
      <span class="wr-right">
        <span class="wr-val">${w.weight.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg</span>
        <button class="wr-del" data-date="${w.date}" title="${t('deleteTooltip')}">✕</button>
      </span>
    `;
    row.addEventListener('click', () => openWeightModal(w.date, w.weight));
    historyEl.appendChild(row);
  });
  historyEl.querySelectorAll('.wr-del').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      deleteWeight(btn.getAttribute('data-date'));
      await renderWeight();
    });
  });

  if(list.length > HISTORY_COLLAPSED_COUNT){
    const moreBtn = document.createElement('button');
    moreBtn.className = 'weight-show-all';
    moreBtn.textContent = weightHistoryExpanded ? t('showLess') : `${t('showAll')} (${list.length})`;
    moreBtn.addEventListener('click', () => {
      weightHistoryExpanded = !weightHistoryExpanded;
      renderWeight();
    });
    historyEl.appendChild(moreBtn);
  }
}

// Day view preview card: latest weight + change since the first entry (same
// numbers as the weight page's own summary row, condensed to one line),
// plus a small label-free version of the same line chart
async function renderWeightPreview(){
  const list = loadWeights();
  const statsEl = document.getElementById('weightPreviewStats');
  const chartEl = document.getElementById('weightPreviewChart');
  if(list.length === 0){ statsEl.textContent = t('previewEmpty'); chartEl.innerHTML = ''; return; }
  const current = list[list.length - 1].weight;
  const change = current - list[0].weight;
  const changeText = (change >= 0 ? '+' : '') + change.toLocaleString(undefined, { maximumFractionDigits: 1 });
  statsEl.textContent = `${current.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg · ${changeText} kg`;
  chartEl.innerHTML = list.length >= 2 ? buildWeightSparkline(list) : '';
}

// Shared by buildWeightChart/buildWeightSparkline: maps each entry to an
// {x,y} point within the given plot area, with a little vertical headroom
// above/below the actual min/max so the line never runs flush along the top
// or bottom edge (keeps a flat/near-flat run of weigh-ins readable too)
function weightChartPoints(list, innerW, innerH, padLeft, padTop){
  const weights = list.map((w) => w.weight);
  const rawMin = Math.min(...weights), rawMax = Math.max(...weights);
  const pad = (rawMax - rawMin) * 0.15 || 0.5;
  const minW = rawMin - pad, maxW = rawMax + pad;
  const wRange = maxW - minW;

  const dates = list.map((w) => parseDateKey(w.date).getTime());
  const minD = dates[0], maxD = dates[dates.length - 1];
  const dRange = (maxD - minD) || 1;

  return list.map((w, i) => ({
    x: padLeft + ((dates[i] - minD) / dRange) * innerW,
    y: padTop + innerH - ((w.weight - minW) / wRange) * innerH,
  }));
}

// Builds a simple SVG line chart (no library — same hand-rolled approach as
// the ring/heatmap graphics elsewhere): points spaced by actual date, y scaled
// between the list's min/max weight, with the most recent point highlighted.
// Includes a y-axis (weight) and x-axis (date) so both scales are readable.
function buildWeightChart(list){
  const width = 300, height = 160, padTop = 10, padBottom = 20, padLeft = 34, padRight = 10;
  const innerW = width - padLeft - padRight, innerH = height - padTop - padBottom;
  const points = weightChartPoints(list, innerW, innerH, padLeft, padTop);

  const pointsAttr = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const dots = points.map((p, i) => {
    const isLast = i === points.length - 1;
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${isLast ? 4 : 2.5}" class="weight-dot${isLast ? ' weight-dot-last' : ''}"/>`;
  }).join('');

  // A handful of evenly spaced horizontal gridlines, each labeled with its
  // weight on the left — e.g. 62 / 63.3 / 64.7 / 66 kg — instead of just a
  // min/max label floating at the very top and bottom
  const weights = list.map((w) => w.weight);
  const rawMin = Math.min(...weights), rawMax = Math.max(...weights);
  const wPad = (rawMax - rawMin) * 0.15 || 0.5;
  const minW = rawMin - wPad, maxW = rawMax + wPad, wRange = maxW - minW;
  const GRID_LINES = 4;
  const grid = [];
  for(let i=0; i<GRID_LINES; i++){
    const frac = i / (GRID_LINES - 1);
    const y = padTop + innerH - frac * innerH;
    const val = minW + frac * wRange;
    grid.push(`
      <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" class="weight-grid-line"/>
      <text x="${padLeft - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="weight-axis-label">${val.toLocaleString(undefined, { maximumFractionDigits: 1 })}</text>
    `);
  }

  // A few x-axis date labels (first, last, and up to 2 evenly spaced in
  // between) — not one per point, which would overlap once there are more
  // than a handful of entries
  const X_LABEL_COUNT = Math.min(4, list.length);
  const xIndices = [...new Set(
    Array.from({ length: X_LABEL_COUNT }, (_, i) =>
      Math.round(i * (list.length - 1) / Math.max(1, X_LABEL_COUNT - 1))
    )
  )];
  const xLabels = xIndices.map((i) => {
    const d = parseDateKey(list[i].date);
    const anchor = i === 0 ? 'start' : (i === list.length - 1 ? 'end' : 'middle');
    return `<text x="${points[i].x.toFixed(1)}" y="${height - 5}" text-anchor="${anchor}" class="weight-axis-label">${d.getDate()}.${d.getMonth() + 1}.</text>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="weight-chart">
      ${grid.join('')}
      ${xLabels}
      <polyline points="${pointsAttr}" class="weight-line"/>
      ${dots}
    </svg>
  `;
}

// A compact, label-free version of the same chart for the day view's
// preview card — just the line and the latest point
function buildWeightSparkline(list){
  const width = 300, height = 46, pad = 6;
  const innerW = width - pad * 2, innerH = height - pad * 2;
  const points = weightChartPoints(list, innerW, innerH, pad, pad);
  const pointsAttr = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return `
    <svg viewBox="0 0 ${width} ${height}" class="weight-sparkline">
      <polyline points="${pointsAttr}" class="weight-line"/>
      <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3" class="weight-dot-last"/>
    </svg>
  `;
}
