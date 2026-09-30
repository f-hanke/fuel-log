// Weight page: log body weight — today by default, but any past day can be
// picked too, to backfill days you forgot — and see it charted over time,
// with a simple current/change/count summary. Stored as its own localStorage
// array (fuellog:weights), independent of the daily meal entries.

document.getElementById('toggleWeight').addEventListener('click', async ()=>{
  showView('weight');
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
  // the ✕ deletes it directly (stopPropagation so it doesn't also open the modal)
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
