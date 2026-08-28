// Week and month views: navigation between periods, the day/week/month panel
// switcher, and the month view's list/heatmap rendering.

document.getElementById('toggleWeek').addEventListener('click', async ()=>{
  showView('week');
  weekOffset = 0; // always open on the current week, not wherever we left off last time
  await renderWeek();
});
document.getElementById('toggleWeekBack').addEventListener('click', ()=> showView('day'));
document.getElementById('toggleWeekToMonth').addEventListener('click', async ()=>{
  showView('month');
  monthOffset = 0;
  await renderMonth();
});

document.getElementById('toggleMonth').addEventListener('click', async ()=>{
  showView('month');
  monthOffset = 0;
  await renderMonth();
});
document.getElementById('toggleMonthBack').addEventListener('click', ()=> showView('day'));
document.getElementById('toggleMonthToWeek').addEventListener('click', async ()=>{
  showView('week');
  weekOffset = 0;
  await renderWeek();
});

// 0 = the calendar week containing today, -1 = one week earlier, +1 = one week later, ...
let weekOffset = 0;
document.getElementById('prevWeek').addEventListener('click', async ()=>{
  weekOffset -= 1;
  await renderWeek();
});
document.getElementById('nextWeek').addEventListener('click', async ()=>{
  weekOffset += 1;
  await renderWeek();
});

// Week-view render: builds the Mon-Sun calendar week for the current weekOffset,
// loads each day's entries, shows the weekly kcal/protein average and a per-day kcal bar list
async function renderWeek(){
  const listEl = document.getElementById('weekList');
  listEl.innerHTML = `<div class="loading">${t('loadingWeek')}</div>`;

  // Find that week's Monday, regardless of which weekday "today" is, then shift
  // by weekOffset full weeks to navigate to earlier/later weeks
  const today = new Date();
  const dow = today.getDay(); // 0=So, 1=Mo, ... 6=Sa
  const diffToMonday = (dow === 0 ? -6 : 1 - dow);
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diffToMonday + weekOffset*7);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  document.getElementById('weekRangeText').textContent =
    `${monday.getDate()}.${monday.getMonth()+1}. – ${sunday.getDate()}.${sunday.getMonth()+1}.`;

  const days = [];
  for(let i=0; i<7; i++){
    days.push(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  }

  const results = [];
  for(const d of days){
    const entries = await loadEntries(d);
    results.push({ date: d, totals: sumEntries(entries), logged: entries.length>0 });
  }

  const loggedDays = results.filter(r=>r.logged);
  const avgKcal = loggedDays.length ? Math.round(loggedDays.reduce((s,r)=>s+r.totals.kcal,0)/loggedDays.length) : 0;
  const avgProtein = loggedDays.length ? Math.round(loggedDays.reduce((s,r)=>s+r.totals.protein,0)/loggedDays.length) : 0;

  document.getElementById('wsKcalAvg').textContent = avgKcal;
  document.getElementById('wsProteinAvg').textContent = avgProtein + 'g';
  document.getElementById('wsDaysLogged').textContent = loggedDays.length + '/7';

  listEl.innerHTML = '';
  results.forEach(r=>{
    const row = document.createElement('div');
    row.className = 'week-day' + (isSameDay(r.date, new Date()) ? ' is-today' : '');
    row.innerHTML = `
      <div class="wd-label">${t('dow')[r.date.getDay()]}<span class="wd-date">${r.date.getDate()}.${r.date.getMonth()+1}.</span></div>
      <div class="wd-bar-track"><div class="wd-bar-fill" style="width:${pct(r.totals.kcal, TARGETS.kcal)}%"></div></div>
      <div class="wd-kcal">${r.logged ? Math.round(r.totals.kcal) : '–'}</div>
    `;
    row.addEventListener('click', () => jumpToDay(r.date));
    listEl.appendChild(row);
  });
}

// 0 = the calendar month containing today, -1 = one month earlier, +1 = one month later, ...
let monthOffset = 0;
let monthMode = 'heatmap'; // 'list' or 'heatmap' — heatmap is the default view

document.getElementById('prevMonth').addEventListener('click', async ()=>{
  monthOffset -= 1;
  await renderMonth();
});
document.getElementById('nextMonth').addEventListener('click', async ()=>{
  monthOffset += 1;
  await renderMonth();
});

document.getElementById('monthModeList').addEventListener('click', ()=>{
  monthMode = 'list';
  document.getElementById('monthModeList').classList.add('active');
  document.getElementById('monthModeHeatmap').classList.remove('active');
  document.getElementById('monthList').classList.remove('hidden');
  document.getElementById('monthHeatmap').classList.add('hidden');
});
document.getElementById('monthModeHeatmap').addEventListener('click', ()=>{
  monthMode = 'heatmap';
  document.getElementById('monthModeHeatmap').classList.add('active');
  document.getElementById('monthModeList').classList.remove('active');
  document.getElementById('monthHeatmap').classList.remove('hidden');
  document.getElementById('monthList').classList.add('hidden');
});

// How "on target" a day was, bucketed into a heatmap color class
function heatClass(logged, kcalPct){
  if(!logged) return 'hm-empty';
  if(kcalPct < 50) return 'hm-low';
  if(kcalPct < 80) return 'hm-mid';
  if(kcalPct <= 115) return 'hm-good';
  return 'hm-over';
}

// Month-view render: builds every day of the current monthOffset's calendar month,
// shows the monthly kcal/protein average, and renders both the list and the heatmap
// (only one is visible at a time, toggled via monthMode)
async function renderMonth(){
  const listEl = document.getElementById('monthList');
  const heatEl = document.getElementById('monthHeatmap');
  listEl.innerHTML = `<div class="loading">${t('loadingMonth')}</div>`;

  const base = new Date();
  const first = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const year = first.getFullYear(), month = first.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  document.getElementById('monthRangeText').textContent = `${t('mon')[month]} ${year}`;

  const days = [];
  for(let d=1; d<=daysInMonth; d++){
    days.push(new Date(year, month, d));
  }

  const results = [];
  for(const d of days){
    const entries = await loadEntries(d);
    results.push({ date: d, totals: sumEntries(entries), logged: entries.length>0 });
  }

  const loggedDays = results.filter(r=>r.logged);
  const avgKcal = loggedDays.length ? Math.round(loggedDays.reduce((s,r)=>s+r.totals.kcal,0)/loggedDays.length) : 0;
  const avgProtein = loggedDays.length ? Math.round(loggedDays.reduce((s,r)=>s+r.totals.protein,0)/loggedDays.length) : 0;

  document.getElementById('msKcalAvg').textContent = avgKcal;
  document.getElementById('msProteinAvg').textContent = avgProtein + 'g';
  document.getElementById('msDaysLogged').textContent = loggedDays.length + '/' + daysInMonth;

  // List mode: one row per day, same look as the week list
  listEl.innerHTML = '';
  results.forEach(r=>{
    const row = document.createElement('div');
    row.className = 'week-day' + (isSameDay(r.date, new Date()) ? ' is-today' : '');
    row.innerHTML = `
      <div class="wd-label">${t('dow')[r.date.getDay()]}<span class="wd-date">${r.date.getDate()}.${r.date.getMonth()+1}.</span></div>
      <div class="wd-bar-track"><div class="wd-bar-fill" style="width:${pct(r.totals.kcal, TARGETS.kcal)}%"></div></div>
      <div class="wd-kcal">${r.logged ? Math.round(r.totals.kcal) : '–'}</div>
    `;
    row.addEventListener('click', () => jumpToDay(r.date));
    listEl.appendChild(row);
  });

  // Heatmap mode: a Mon-Sun calendar grid, cell color = how close that day was to target
  heatEl.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'heatmap-grid';

  [1,2,3,4,5,6,0].forEach((dowIdx) => {
    const h = document.createElement('div');
    h.className = 'heatmap-dow';
    h.textContent = t('dow')[dowIdx];
    grid.appendChild(h);
  });

  const leadingBlanks = (first.getDay() === 0) ? 6 : first.getDay() - 1;
  for(let i=0; i<leadingBlanks; i++){
    const blank = document.createElement('div');
    blank.className = 'heatmap-cell hm-blank';
    grid.appendChild(blank);
  }
  results.forEach(r=>{
    const cell = document.createElement('div');
    const kcalPct = pct(r.totals.kcal, TARGETS.kcal);
    cell.className = 'heatmap-cell ' + heatClass(r.logged, kcalPct) + (isSameDay(r.date, new Date()) ? ' is-today' : '');
    cell.textContent = r.date.getDate();
    if(r.logged) cell.title = `${Math.round(r.totals.kcal)} kcal`;
    cell.addEventListener('click', () => jumpToDay(r.date));
    grid.appendChild(cell);
  });
  heatEl.appendChild(grid);

  const legend = document.createElement('div');
  legend.className = 'heatmap-legend';
  legend.innerHTML = `
    <span class="sw" style="background:var(--bg-panel);border:1px solid var(--line)"></span>${t('legendNone')}
    <span class="sw" style="background:rgba(198,241,53,0.45)"></span>${t('legendUnder')}
    <span class="sw" style="background:var(--lime)"></span>${t('legendOnTarget')}
    <span class="sw" style="background:var(--amber)"></span>${t('legendOver')}
  `;
  heatEl.appendChild(legend);
}
