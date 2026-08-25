const TARGETS = { kcal: 3200, protein: 130, carbs: 460, fat: 90 };
const DOW = ['So','Mo','Di','Mi','Do','Fr','Sa'];
const MON = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

// Date -> "YYYY-MM-DD", used as the localStorage key suffix for a day's entries
function fmtKey(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
// Date -> human-readable German label shown in the date bar
function fmtLabel(d){
  return `${DOW[d.getDay()]}, ${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()}`;
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
  document.getElementById('statKcalSub').textContent = `von ${TARGETS.kcal}`;
  document.getElementById('barKcal').style.width = pct(totals.kcal, TARGETS.kcal) + '%';

  document.getElementById('statProtein').textContent = Math.round(totals.protein);
  document.getElementById('statProteinSub').textContent = `von ${TARGETS.protein}`;
  document.getElementById('barProtein').style.width = pct(totals.protein, TARGETS.protein) + '%';

  document.getElementById('statCarbs').textContent = Math.round(totals.carbs);
  document.getElementById('statCarbsSub').textContent = `von ${TARGETS.carbs}`;
  document.getElementById('barCarbs').style.width = pct(totals.carbs, TARGETS.carbs) + '%';

  document.getElementById('statFat').textContent = Math.round(totals.fat);
  document.getElementById('statFatSub').textContent = `von ${TARGETS.fat}`;
  document.getElementById('barFat').style.width = pct(totals.fat, TARGETS.fat) + '%';

  const listEl = document.getElementById('mealList');
  listEl.innerHTML = '';
  if(currentEntries.length === 0){
    listEl.innerHTML = '<div class="empty">Noch keine Mahlzeiten für diesen Tag erfasst.</div>';
  } else {
    currentEntries.forEach((e, idx)=>{
      const row = document.createElement('div');
      row.className = 'meal';
      row.innerHTML = `
        <div>
          <div class="name">${escapeHtml(e.name || 'Mahlzeit')}</div>
          <div class="macros">P ${Math.round(e.protein)||0}g · C ${Math.round(e.carbs)||0}g · F ${Math.round(e.fat)||0}g</div>
        </div>
        <div class="meal-right">
          <span class="kcalval">${Math.round(e.kcal)||0}</span>
          <button class="del-btn" data-idx="${idx}" title="Löschen">✕</button>
        </div>
      `;
      listEl.appendChild(row);
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
  document.getElementById('deleteModalText').textContent = entry ? (entry.name || 'Mahlzeit') : '';
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

document.getElementById('toggleWeek').addEventListener('click', async ()=>{
  document.getElementById('dayView').classList.add('hidden');
  document.getElementById('datebar').classList.add('hidden');
  document.getElementById('weekView').classList.remove('hidden');
  await renderWeek();
});
document.getElementById('toggleWeekBack').addEventListener('click', ()=>{
  document.getElementById('weekView').classList.add('hidden');
  document.getElementById('datebar').classList.remove('hidden');
  document.getElementById('dayView').classList.remove('hidden');
});

// Week-view render: builds the Mon-Sun calendar week containing today, loads each
// day's entries, shows the weekly kcal/protein average and a per-day kcal bar list
async function renderWeek(){
  const listEl = document.getElementById('weekList');
  listEl.innerHTML = '<div class="loading">Lade Woche…</div>';

  // Find this week's Monday, regardless of which weekday "today" is
  const today = new Date();
  const dow = today.getDay(); // 0=So, 1=Mo, ... 6=Sa
  const diffToMonday = (dow === 0 ? -6 : 1 - dow);
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diffToMonday);

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
      <div class="wd-label">${DOW[r.date.getDay()]}<span class="wd-date">${r.date.getDate()}.${r.date.getMonth()+1}.</span></div>
      <div class="wd-bar-track"><div class="wd-bar-fill" style="width:${pct(r.totals.kcal, TARGETS.kcal)}%"></div></div>
      <div class="wd-kcal">${r.logged ? Math.round(r.totals.kcal) : '–'}</div>
    `;
    listEl.appendChild(row);
  });
}

renderDay();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      // Force a fresh check for a newer sw.js every time the app is opened,
      // instead of waiting for the browser's own (slow/unreliable) update timer
      reg.update();
    }).catch(() => {});
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
