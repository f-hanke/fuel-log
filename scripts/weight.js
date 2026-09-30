// Weight page: log body weight — today by default, but any past day can be
// picked too, to backfill days you forgot — and see it charted over time,
// with a simple current/change/count summary. Stored as its own localStorage
// array (fuellog:weights), independent of the daily meal entries.

document.getElementById('toggleWeight').addEventListener('click', async ()=>{
  showView('weight');
  const dateInput = document.getElementById('weightDateInput');
  dateInput.max = fmtKey(new Date());
  dateInput.value = fmtKey(new Date());
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

// Picking a date that already has a logged value pre-fills it, so re-opening
// a past day acts as "edit" rather than silently overwriting it blind
document.getElementById('weightDateInput').addEventListener('change', ()=>{
  const dateKey = document.getElementById('weightDateInput').value;
  const existing = loadWeights().find((w) => w.date === dateKey);
  document.getElementById('weightInput').value = existing ? existing.weight : '';
});

document.getElementById('weightSaveBtn').addEventListener('click', async ()=>{
  const dateKey = document.getElementById('weightDateInput').value;
  const value = Number(document.getElementById('weightInput').value);
  if(!dateKey || !value || value <= 0) return;
  upsertWeight(dateKey, value);
  await renderWeight();
});

async function renderWeight(){
  const list = loadWeights();

  document.getElementById('weightCount').textContent = list.length;
  if(list.length === 0){
    document.getElementById('weightCurrent').textContent = '–';
    document.getElementById('weightChange').textContent = '–';
    document.getElementById('weightChartWrap').innerHTML = '';
    document.getElementById('weightHistory').innerHTML = `<div class="search-hint">${t('weightEmpty')}</div>`;
    return;
  }

  const current = list[list.length - 1].weight;
  const change = current - list[0].weight;
  document.getElementById('weightCurrent').textContent = current.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' kg';
  document.getElementById('weightChange').textContent =
    (change >= 0 ? '+' : '') + change.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' kg';

  document.getElementById('weightChartWrap').innerHTML = list.length >= 2 ? buildWeightChart(list) : '';

  // Tapping a row loads that day into the entry fields above for quick editing;
  // the ✕ deletes it directly (stopPropagation so it doesn't also load the row)
  const historyEl = document.getElementById('weightHistory');
  historyEl.innerHTML = '';
  [...list].reverse().forEach((w) => {
    const row = document.createElement('div');
    row.className = 'weight-row';
    row.innerHTML = `
      <span class="wr-date">${fmtLabel(parseDateKey(w.date))}</span>
      <span class="wr-right">
        <span class="wr-val">${w.weight.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg</span>
        <button class="wr-del" data-date="${w.date}" title="${t('deleteTooltip')}">✕</button>
      </span>
    `;
    row.addEventListener('click', () => {
      document.getElementById('weightDateInput').value = w.date;
      document.getElementById('weightInput').value = w.weight;
    });
    historyEl.appendChild(row);
  });
  historyEl.querySelectorAll('.wr-del').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      deleteWeight(btn.getAttribute('data-date'));
      await renderWeight();
    });
  });
}

// Builds a simple SVG line chart (no library — same hand-rolled approach as
// the ring/heatmap graphics elsewhere): points spaced by actual date, y scaled
// between the list's min/max weight, with the most recent point highlighted
function buildWeightChart(list){
  const width = 300, height = 130, padTop = 14, padBottom = 14, padX = 10;
  const weights = list.map((w) => w.weight);
  const minW = Math.min(...weights), maxW = Math.max(...weights);
  const wRange = (maxW - minW) || 1;
  const dates = list.map((w) => parseDateKey(w.date).getTime());
  const minD = dates[0], maxD = dates[dates.length - 1];
  const dRange = (maxD - minD) || 1;
  const innerW = width - padX * 2, innerH = height - padTop - padBottom;

  const points = list.map((w, i) => ({
    x: padX + ((dates[i] - minD) / dRange) * innerW,
    y: padTop + innerH - ((w.weight - minW) / wRange) * innerH,
  }));
  const pointsAttr = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const dots = points.map((p, i) => {
    const isLast = i === points.length - 1;
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${isLast ? 4 : 2.5}" class="weight-dot${isLast ? ' weight-dot-last' : ''}"/>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="weight-chart">
      <text x="${padX}" y="${padTop - 4}" class="weight-axis-label">${maxW.toLocaleString(undefined,{maximumFractionDigits:1})} kg</text>
      <text x="${padX}" y="${height - 2}" class="weight-axis-label">${minW.toLocaleString(undefined,{maximumFractionDigits:1})} kg</text>
      <polyline points="${pointsAttr}" class="weight-line"/>
      ${dots}
    </svg>
  `;
}
