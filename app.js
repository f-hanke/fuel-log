// Daily macro targets. Loaded from localStorage (set via Settings), falling back
// to sensible defaults the first time the app runs.
const DEFAULT_TARGETS = { kcal: 3200, protein: 130, carbs: 460, fat: 90 };
function loadTargets(){
  try{
    const raw = localStorage.getItem('fuellog:targets');
    if(raw){
      const p = JSON.parse(raw);
      return {
        kcal: Number(p.kcal) || DEFAULT_TARGETS.kcal,
        protein: Number(p.protein) || DEFAULT_TARGETS.protein,
        carbs: Number(p.carbs) || DEFAULT_TARGETS.carbs,
        fat: Number(p.fat) || DEFAULT_TARGETS.fat,
      };
    }
  }catch(e){}
  return { ...DEFAULT_TARGETS };
}
let TARGETS = loadTargets();
function saveTargets(newTargets){
  TARGETS = newTargets;
  try{ localStorage.setItem('fuellog:targets', JSON.stringify(newTargets)); }catch(e){}
}

// UI text lives in i18n/de.js and i18n/en.js (loaded before this file), each
// defining a TRANSLATIONS_DE / TRANSLATIONS_EN object. t(key) below looks up
// the active language.
const TRANSLATIONS = { de: TRANSLATIONS_DE, en: TRANSLATIONS_EN };

let lang = localStorage.getItem('fuellog:lang') === 'en' ? 'en' : 'de';
function t(key){ return TRANSLATIONS[lang][key]; }

// Apply the active language to every static (non-rendered) piece of UI text
function applyStaticTranslations(){
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
}

// Re-render whichever of day/week/month is currently visible (e.g. after the
// language or targets changed in Settings)
async function refreshCurrentView(){
  if(!document.getElementById('dayView').classList.contains('hidden')) await renderDay();
  if(!document.getElementById('weekView').classList.contains('hidden')) await renderWeek();
  if(!document.getElementById('monthView').classList.contains('hidden')) await renderMonth();
}

// Switch the active UI language, re-render, and reflect the choice in Settings
async function setLang(newLang){
  lang = newLang;
  localStorage.setItem('fuellog:lang', lang);
  applyStaticTranslations();
  document.getElementById('langDeBtn').classList.toggle('active', lang === 'de');
  document.getElementById('langEnBtn').classList.toggle('active', lang === 'en');
  await refreshCurrentView();
}
document.getElementById('langDeBtn').addEventListener('click', () => setLang('de'));
document.getElementById('langEnBtn').addEventListener('click', () => setLang('en'));

// Remember the calculator's last inputs so the user doesn't have to retype them
function loadCalcInputs(){
  try{
    const raw = localStorage.getItem('fuellog:calcInputs');
    return raw ? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}
function saveCalcInputs(inputs){
  try{ localStorage.setItem('fuellog:calcInputs', JSON.stringify(inputs)); }catch(e){}
}

// Open Settings: pre-fill language, current targets, and the last-used calculator inputs
function openSettingsModal(){
  document.getElementById('langDeBtn').classList.toggle('active', lang === 'de');
  document.getElementById('langEnBtn').classList.toggle('active', lang === 'en');

  document.getElementById('tgKcal').value = TARGETS.kcal;
  document.getElementById('tgProtein').value = TARGETS.protein;
  document.getElementById('tgCarbs').value = TARGETS.carbs;
  document.getElementById('tgFat').value = TARGETS.fat;

  const calc = loadCalcInputs();
  document.getElementById('calcWeight').value = calc.weight || '';
  document.getElementById('calcHeight').value = calc.height || '';
  document.getElementById('calcAge').value = calc.age || '';
  document.getElementById('calcGender').value = calc.gender || 'm';
  document.getElementById('calcActivity').value = calc.activity || '1.55';

  document.getElementById('settingsModal').classList.remove('hidden');
}
function closeSettingsModal(){
  document.getElementById('settingsModal').classList.add('hidden');
}
document.getElementById('settingsToggle').addEventListener('click', openSettingsModal);
document.getElementById('settingsCloseBtn').addEventListener('click', closeSettingsModal);
document.getElementById('settingsModal').addEventListener('click', (e)=>{
  if(e.target.id === 'settingsModal') closeSettingsModal();
});

document.getElementById('settingsSaveBtn').addEventListener('click', async ()=>{
  const kcal = Number(document.getElementById('tgKcal').value) || TARGETS.kcal;
  const protein = Number(document.getElementById('tgProtein').value) || TARGETS.protein;
  const carbs = Number(document.getElementById('tgCarbs').value) || TARGETS.carbs;
  const fat = Number(document.getElementById('tgFat').value) || TARGETS.fat;
  saveTargets({ kcal, protein, carbs, fat });
  closeSettingsModal();
  await refreshCurrentView();
});

// Estimate daily targets from body stats: Mifflin-St Jeor BMR x activity factor
// for kcal, ~1.8g protein/kg bodyweight, 25% of kcal from fat, rest from carbs.
// Fills the target fields above (still requires "Speichern" to actually apply them).
document.getElementById('calcApplyBtn').addEventListener('click', ()=>{
  const weight = Number(document.getElementById('calcWeight').value);
  const height = Number(document.getElementById('calcHeight').value);
  const age = Number(document.getElementById('calcAge').value);
  const gender = document.getElementById('calcGender').value;
  const activity = Number(document.getElementById('calcActivity').value);
  if(!weight || !height || !age) return;

  saveCalcInputs({ weight, height, age, gender, activity });

  const bmr = 10*weight + 6.25*height - 5*age + (gender === 'm' ? 5 : -161);
  const tdee = bmr * activity;

  const proteinG = Math.round(weight * 1.8);
  const fatG = Math.round((tdee * 0.25) / 9);
  const carbsG = Math.max(0, Math.round((tdee - proteinG*4 - fatG*9) / 4));

  document.getElementById('tgKcal').value = Math.round(tdee);
  document.getElementById('tgProtein').value = proteinG;
  document.getElementById('tgCarbs').value = carbsG;
  document.getElementById('tgFat').value = fatG;
});

// Date -> "YYYY-MM-DD", used as the localStorage key suffix for a day's entries
function fmtKey(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
// Date -> human-readable label (in the active language) shown in the date bar
function fmtLabel(d){
  return `${t('dow')[d.getDay()]}, ${d.getDate()}. ${t('mon')[d.getMonth()]} ${d.getFullYear()}`;
}
function isSameDay(a,b){ return fmtKey(a)===fmtKey(b); }

let currentDate = new Date();
let currentEntries = [];

// Load all logged meals for one day from localStorage (empty array if none/corrupt)
async function loadEntries(dateObj){
  const key = 'fuellog:entries:' + fmtKey(dateObj);
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  }catch(e){
    return [];
  }
}
// Persist one day's meal list to localStorage, keyed by date
async function saveEntries(dateObj, entries){
  const key = 'fuellog:entries:' + fmtKey(dateObj);
  try{
    localStorage.setItem(key, JSON.stringify(entries));
  }catch(e){
    console.error('Speichern fehlgeschlagen', e);
  }
}

// Add up kcal/protein/carbs/fat across a day's meal entries
function sumEntries(entries){
  return entries.reduce((acc,e)=>{
    acc.kcal += Number(e.kcal)||0;
    acc.protein += Number(e.protein)||0;
    acc.carbs += Number(e.carbs)||0;
    acc.fat += Number(e.fat)||0;
    return acc;
  }, {kcal:0,protein:0,carbs:0,fat:0});
}

// Clamp a value's percentage of a target to 0-100, for progress bar widths
function pct(val, target){ return Math.max(0, Math.min(100, Math.round((val/target)*100))); }

// Main day-view render: loads the day's entries, updates the macro stat tiles/bars
// and rebuilds the meal list. Called on load, day navigation, add, and delete.
async function renderDay(){
  document.getElementById('dateText').textContent = fmtLabel(currentDate);
  document.getElementById('todayTag').classList.toggle('hidden', !isSameDay(currentDate, new Date()));

  currentEntries = await loadEntries(currentDate);
  const totals = sumEntries(currentEntries);

  document.getElementById('statKcal').textContent = Math.round(totals.kcal);
  document.getElementById('statKcalSub').textContent = `${t('of')} ${TARGETS.kcal}`;
  document.getElementById('barKcal').style.width = pct(totals.kcal, TARGETS.kcal) + '%';

  document.getElementById('statProtein').textContent = Math.round(totals.protein);
  document.getElementById('statProteinSub').textContent = `${t('of')} ${TARGETS.protein}`;
  document.getElementById('barProtein').style.width = pct(totals.protein, TARGETS.protein) + '%';

  document.getElementById('statCarbs').textContent = Math.round(totals.carbs);
  document.getElementById('statCarbsSub').textContent = `${t('of')} ${TARGETS.carbs}`;
  document.getElementById('barCarbs').style.width = pct(totals.carbs, TARGETS.carbs) + '%';

  document.getElementById('statFat').textContent = Math.round(totals.fat);
  document.getElementById('statFatSub').textContent = `${t('of')} ${TARGETS.fat}`;
  document.getElementById('barFat').style.width = pct(totals.fat, TARGETS.fat) + '%';

  const listEl = document.getElementById('mealList');
  listEl.innerHTML = '';
  if(currentEntries.length === 0){
    listEl.innerHTML = `<div class="empty">${t('emptyDay')}</div>`;
  } else {
    currentEntries.forEach((e, idx)=>{
      const row = document.createElement('div');
      row.className = 'meal';
      row.innerHTML = `
        <div>
          <div class="name">${escapeHtml(e.name || t('meal'))}</div>
          <div class="macros">P ${Math.round(e.protein)||0}g · C ${Math.round(e.carbs)||0}g · F ${Math.round(e.fat)||0}g</div>
        </div>
        <div class="meal-right">
          <span class="kcalval">${Math.round(e.kcal)||0}</span>
          <button class="edit-btn" data-idx="${idx}" title="${t('editTooltip')}">✎</button>
          <button class="del-btn" data-idx="${idx}" title="${t('deleteTooltip')}">✕</button>
        </div>
      `;
      listEl.appendChild(row);
    });
    listEl.querySelectorAll('.edit-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const idx = Number(btn.getAttribute('data-idx'));
        openEditModal(idx);
      });
    });
    listEl.querySelectorAll('.del-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const idx = Number(btn.getAttribute('data-idx'));
        openDeleteModal(idx);
      });
    });
  }
}

let pendingDeleteIdx = null;

// Open the delete-confirmation popup for the meal at this index (nothing is
// deleted yet — only the confirm button in the modal actually removes it)
function openDeleteModal(idx){
  pendingDeleteIdx = idx;
  const entry = currentEntries[idx];
  document.getElementById('deleteModalText').textContent = entry ? (entry.name || t('meal')) : '';
  document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal(){
  pendingDeleteIdx = null;
  document.getElementById('deleteModal').classList.add('hidden');
}

document.getElementById('deleteCancelBtn').addEventListener('click', closeDeleteModal);
document.getElementById('deleteModal').addEventListener('click', (e)=>{
  if(e.target.id === 'deleteModal') closeDeleteModal();
});
document.getElementById('deleteConfirmBtn').addEventListener('click', async ()=>{
  if(pendingDeleteIdx === null) return;
  currentEntries.splice(pendingDeleteIdx, 1);
  await saveEntries(currentDate, currentEntries);
  closeDeleteModal();
  renderDay();
});

let pendingEditIdx = null;

// Open the edit popup for the meal at this index, pre-filled with its current values
function openEditModal(idx){
  pendingEditIdx = idx;
  const entry = currentEntries[idx];
  if(!entry) return;
  document.getElementById('eName').value = entry.name || '';
  document.getElementById('eKcal').value = entry.kcal || '';
  document.getElementById('eProtein').value = entry.protein || '';
  document.getElementById('eCarbs').value = entry.carbs || '';
  document.getElementById('eFat').value = entry.fat || '';
  document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal(){
  pendingEditIdx = null;
  document.getElementById('editModal').classList.add('hidden');
}

document.getElementById('editCancelBtn').addEventListener('click', closeEditModal);
document.getElementById('editModal').addEventListener('click', (e)=>{
  if(e.target.id === 'editModal') closeEditModal();
});
document.getElementById('editSaveBtn').addEventListener('click', async ()=>{
  if(pendingEditIdx === null) return;
  const name = document.getElementById('eName').value.trim();
  const kcal = document.getElementById('eKcal').value;
  const protein = document.getElementById('eProtein').value;
  const carbs = document.getElementById('eCarbs').value;
  const fat = document.getElementById('eFat').value;
  if(!name || !kcal){ return; }
  currentEntries[pendingEditIdx] = {
    name, kcal: Number(kcal)||0, protein: Number(protein)||0,
    carbs: Number(carbs)||0, fat: Number(fat)||0
  };
  await saveEntries(currentDate, currentEntries);
  closeEditModal();
  renderDay();
});

// Escape user-entered meal names before inserting them as innerHTML, to avoid XSS
function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

document.getElementById('prevDay').addEventListener('click', ()=>{
  currentDate = new Date(currentDate.getTime() - 86400000);
  renderDay();
});
document.getElementById('nextDay').addEventListener('click', ()=>{
  currentDate = new Date(currentDate.getTime() + 86400000);
  renderDay();
});

// Read the add-meal form, append a new entry for the current day, save and re-render
document.getElementById('addBtn').addEventListener('click', async ()=>{
  const name = document.getElementById('mName').value.trim();
  const kcal = document.getElementById('mKcal').value;
  const protein = document.getElementById('mProtein').value;
  const carbs = document.getElementById('mCarbs').value;
  const fat = document.getElementById('mFat').value;
  if(!name || !kcal){ return; }
  currentEntries.push({
    name, kcal: Number(kcal)||0, protein: Number(protein)||0,
    carbs: Number(carbs)||0, fat: Number(fat)||0
  });
  await saveEntries(currentDate, currentEntries);
  document.getElementById('mName').value='';
  document.getElementById('mKcal').value='';
  document.getElementById('mProtein').value='';
  document.getElementById('mCarbs').value='';
  document.getElementById('mFat').value='';
  renderDay();
});

// Switches between the day/week/month panels (only one is ever visible at a time)
function showView(view){
  document.getElementById('dayView').classList.toggle('hidden', view !== 'day');
  document.getElementById('datebar').classList.toggle('hidden', view !== 'day');
  document.getElementById('weekView').classList.toggle('hidden', view !== 'week');
  document.getElementById('monthView').classList.toggle('hidden', view !== 'month');
}

// Jump straight to a given day (used when tapping a row/cell in week or month view)
function jumpToDay(d){
  currentDate = new Date(d);
  showView('day');
  renderDay();
}

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
let monthMode = 'list'; // 'list' or 'heatmap'

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

applyStaticTranslations();
renderDay();

if ("serviceWorker" in navigator) {
  let swRegistration = null;

  window.addEventListener("load", () => {
    // updateViaCache:'none' tells the browser to never reuse an HTTP-cached copy of
    // sw.js for update checks — always hit the network, so stale CDN/browser caching
    // can't hide a new version from us
    navigator.serviceWorker.register("sw.js", { updateViaCache: 'none' }).then((reg) => {
      swRegistration = reg;
      // Force a fresh check for a newer sw.js every time the app is opened,
      // instead of waiting for the browser's own (slow/unreliable) update timer
      reg.update();
    }).catch(() => {});
  });

  // iOS home-screen apps are often just "resumed" from the background instead of
  // getting a real page load (the load listener above never fires again), so also
  // re-check for updates whenever the app becomes visible/foregrounded again
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && swRegistration) {
      swRegistration.update();
    }
  });
  window.addEventListener("pageshow", () => {
    if (swRegistration) swRegistration.update();
  });

  // Once a new service worker takes control (new version activated),
  // reload automatically so the update is visible without closing the app —
  // this never touches localStorage, so logged meals are never affected
  let reloadedForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadedForUpdate) return;
    reloadedForUpdate = true;
    window.location.reload();
  });
}
