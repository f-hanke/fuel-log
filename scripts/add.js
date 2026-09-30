// Add-food page (a full view, not a popup — opened via the floating + button
// or by tapping a category header on the day view). Two tabs:
//  - Suche: looks up real products via the Open Food Facts API and scales
//    their per-100g nutrition to whatever amount was actually eaten
//  - Schnelleingabe: the original manual name + macros form
// Both end up calling addEntry() to append to currentEntries (from day.js)
// and save the day.

function defaultCategoryByTime(){
  const h = new Date().getHours();
  if(h < 11) return 'breakfast';
  if(h < 15) return 'lunch';
  if(h < 20) return 'dinner';
  return 'snacks';
}

// Opens the add page pre-set to the given category, always starting on the
// search tab with both tabs reset to a blank state
function openAddPage(category){
  document.getElementById('addCategory').value = category;
  switchAddTab('search');
  resetSearchTab();
  resetQuickTab();
  showView('add');
}

document.getElementById('fabAdd').addEventListener('click', ()=>{
  openAddPage(defaultCategoryByTime());
});
document.querySelectorAll('.meal-group-header').forEach((header)=>{
  header.addEventListener('click', ()=>{
    openAddPage(header.getAttribute('data-category'));
  });
});
document.getElementById('addBack').addEventListener('click', ()=> showView('day'));

function switchAddTab(tab){
  document.getElementById('addModeSearch').classList.toggle('active', tab === 'search');
  document.getElementById('addModeQuick').classList.toggle('active', tab === 'quick');
  document.getElementById('addSearchTab').classList.toggle('hidden', tab !== 'search');
  document.getElementById('addQuickTab').classList.toggle('hidden', tab !== 'quick');
}
document.getElementById('addModeSearch').addEventListener('click', ()=> switchAddTab('search'));
document.getElementById('addModeQuick').addEventListener('click', ()=> switchAddTab('quick'));

// Shared by both tabs: append the finished entry, persist, and return to the day view
async function addEntry(entry){
  currentEntries.push({ category: document.getElementById('addCategory').value, ...entry });
  await saveEntries(currentDate, currentEntries);
  showView('day');
  renderDay();
}

// --- Schnelleingabe tab: unchanged manual entry, just relocated onto this page ---
function resetQuickTab(){
  document.getElementById('aName').value = '';
  document.getElementById('aKcal').value = '';
  document.getElementById('aProtein').value = '';
  document.getElementById('aCarbs').value = '';
  document.getElementById('aFat').value = '';
}
document.getElementById('addConfirmBtn').addEventListener('click', async ()=>{
  const name = document.getElementById('aName').value.trim();
  const kcal = document.getElementById('aKcal').value;
  if(!name || !kcal){ return; }
  await addEntry({
    name,
    kcal: Number(kcal)||0,
    protein: Number(document.getElementById('aProtein').value)||0,
    carbs: Number(document.getElementById('aCarbs').value)||0,
    fat: Number(document.getElementById('aFat').value)||0,
  });
});

// --- Suche tab: Open Food Facts product search ---
// Each result has a quick + button (adds 100g instantly, no scrolling/typing)
// and can also be tapped to expand an inline amount editor right underneath
// itself — never a separate section at the bottom of the page.
let searchResults = [];

function resetSearchTab(){
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
  searchResults = [];
}

async function runSearch(){
  const query = document.getElementById('searchInput').value.trim();
  const resultsEl = document.getElementById('searchResults');
  if(!query){ resultsEl.innerHTML = ''; return; }

  resultsEl.innerHTML = `<div class="loading">${t('searching')}</div>`;
  try{
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&fields=product_name,brands,nutriments`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('bad response');
    const data = await res.json();
    // Only keep products that actually have a name and a kcal/100g value —
    // Open Food Facts entries are user-submitted and often incomplete
    searchResults = (data.products || []).filter(
      (p) => p.product_name && p.nutriments && p.nutriments['energy-kcal_100g'] != null
    );
    renderSearchResults();
  }catch(e){
    resultsEl.innerHTML = `<div class="search-hint">${t('searchError')}</div>`;
  }
}

function renderSearchResults(){
  const resultsEl = document.getElementById('searchResults');
  if(searchResults.length === 0){
    resultsEl.innerHTML = `<div class="search-hint">${t('searchNoResults')}</div>`;
    return;
  }
  resultsEl.innerHTML = '';
  searchResults.forEach((p, idx) => {
    const kcal100 = Math.round(p.nutriments['energy-kcal_100g']);
    const wrap = document.createElement('div');
    wrap.className = 'search-result-wrap';
    wrap.innerHTML = `
      <div class="meal search-result" data-idx="${idx}">
        <div>
          <div class="name">${escapeHtml(p.product_name)}</div>
          <div class="macros">${escapeHtml(p.brands || '')}</div>
        </div>
        <div class="meal-right">
          <span class="kcalval">${kcal100} kcal/100g</span>
          <button class="quick-add-btn" data-idx="${idx}" title="${t('addBtn')}">+</button>
        </div>
      </div>
      <div class="search-result-detail hidden" data-idx="${idx}">
        <div class="row">
          <div class="macrocell">
            <label class="mini" data-i18n="searchAmount">Menge (g)</label>
            <input type="number" class="grams-input" data-idx="${idx}" value="100" min="1">
          </div>
        </div>
        <div class="detail-macros" data-idx="${idx}">${macroSummary(p, 100)}</div>
        <button class="add-submit confirm-add-btn" data-idx="${idx}">${t('addBtn')}</button>
      </div>
    `;
    resultsEl.appendChild(wrap);
  });
}

// Scales one product's per-100g nutriments to the given gram amount
function scaledMacros(product, grams){
  const n = product.nutriments;
  const factor = grams / 100;
  return {
    kcal: Math.round((n['energy-kcal_100g'] || 0) * factor),
    protein: Math.round((n['proteins_100g'] || 0) * factor),
    carbs: Math.round((n['carbohydrates_100g'] || 0) * factor),
    fat: Math.round((n['fat_100g'] || 0) * factor),
  };
}
function macroSummary(product, grams){
  const m = scaledMacros(product, grams);
  return `${m.kcal} kcal · ${m.protein}g P · ${m.carbs}g C · ${m.fat}g F`;
}

// Expands/collapses the inline amount editor for one result, closing any other
function toggleResultDetail(idx){
  const target = document.querySelector(`.search-result-detail[data-idx="${idx}"]`);
  const wasHidden = target.classList.contains('hidden');
  document.querySelectorAll('.search-result-detail').forEach((d) => d.classList.add('hidden'));
  if(wasHidden){
    target.classList.remove('hidden');
    const gramsInput = target.querySelector('.grams-input');
    gramsInput.focus();
    gramsInput.select();
  }
}

async function addSearchResult(idx, grams){
  const p = searchResults[idx];
  await addEntry({ name: p.product_name, ...scaledMacros(p, grams) });
}

document.getElementById('searchBtn').addEventListener('click', runSearch);
document.getElementById('searchInput').addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); runSearch(); }
});

// Delegated listeners: search results are rebuilt on every search, so a single
// listener on the (static) container handles clicks/input for all of them
document.getElementById('searchResults').addEventListener('click', async (e) => {
  const quickBtn = e.target.closest('.quick-add-btn');
  if(quickBtn){ await addSearchResult(Number(quickBtn.getAttribute('data-idx')), 100); return; }

  const confirmBtn = e.target.closest('.confirm-add-btn');
  if(confirmBtn){
    const idx = Number(confirmBtn.getAttribute('data-idx'));
    const grams = Number(document.querySelector(`.grams-input[data-idx="${idx}"]`).value) || 0;
    await addSearchResult(idx, grams);
    return;
  }

  const row = e.target.closest('.search-result');
  if(row){ toggleResultDetail(Number(row.getAttribute('data-idx'))); }
});
document.getElementById('searchResults').addEventListener('input', (e) => {
  const gramsInput = e.target.closest('.grams-input');
  if(!gramsInput) return;
  const idx = Number(gramsInput.getAttribute('data-idx'));
  const grams = Number(gramsInput.value) || 0;
  document.querySelector(`.detail-macros[data-idx="${idx}"]`).textContent = macroSummary(searchResults[idx], grams);
});
