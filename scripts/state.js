// Shared state (targets, language, theme) and generic helpers used by every
// view (day.js, week-month.js, settings.js). Loaded first so those files can
// rely on everything here already being defined.

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

// Dark/light theme. The actual <html data-theme="..."> attribute is already set as
// early as possible by the inline script in index.html (to avoid a flash of the
// wrong theme); this just keeps our own state and the Settings buttons in sync.
let theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
function setTheme(newTheme){
  theme = newTheme;
  try{ localStorage.setItem('fuellog:theme', theme); }catch(e){}
  if(theme === 'light'){
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  document.getElementById('themeColorMeta').setAttribute('content', theme === 'light' ? '#F4F6F2' : '#0F1613');
  document.getElementById('themeDarkBtn').classList.toggle('active', theme === 'dark');
  document.getElementById('themeLightBtn').classList.toggle('active', theme === 'light');
}

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

// Escape user-entered meal names before inserting them as innerHTML, to avoid XSS
function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
