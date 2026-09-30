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
let searchResults = [];
let selectedProduct = null;

function resetSearchTab(){
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
  document.getElementById('searchDetail').classList.add('hidden');
  searchResults = [];
  selectedProduct = null;
}

async function runSearch(){
  const query = document.getElementById('searchInput').value.trim();
  const resultsEl = document.getElementById('searchResults');
  document.getElementById('searchDetail').classList.add('hidden');
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
    const row = document.createElement('div');
    row.className = 'meal search-result';
    row.innerHTML = `
      <div>
        <div class="name">${escapeHtml(p.product_name)}</div>
        <div class="macros">${escapeHtml(p.brands || '')}</div>
      </div>
      <div class="meal-right"><span class="kcalval">${kcal100} kcal/100g</span></div>
    `;
    row.addEventListener('click', () => selectSearchResult(idx));
    resultsEl.appendChild(row);
  });
}

function selectSearchResult(idx){
  selectedProduct = searchResults[idx];
  document.getElementById('searchDetailName').textContent = selectedProduct.product_name;
  document.getElementById('searchGrams').value = 100;
  updateSearchTotals();
  document.getElementById('searchDetail').classList.remove('hidden');
}

// Scales the selected product's per-100g nutriments to the entered gram amount
function scaledMacros(){
  const grams = Number(document.getElementById('searchGrams').value) || 0;
  const n = selectedProduct.nutriments;
  const factor = grams / 100;
  return {
    kcal: Math.round((n['energy-kcal_100g'] || 0) * factor),
    protein: Math.round((n['proteins_100g'] || 0) * factor),
    carbs: Math.round((n['carbohydrates_100g'] || 0) * factor),
    fat: Math.round((n['fat_100g'] || 0) * factor),
  };
}
function updateSearchTotals(){
  if(!selectedProduct) return;
  const m = scaledMacros();
  document.getElementById('searchKcal').textContent = m.kcal;
  document.getElementById('searchProtein').textContent = m.protein;
  document.getElementById('searchCarbs').textContent = m.carbs;
  document.getElementById('searchFat').textContent = m.fat;
}

document.getElementById('searchBtn').addEventListener('click', runSearch);
document.getElementById('searchInput').addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); runSearch(); }
});
document.getElementById('searchGrams').addEventListener('input', updateSearchTotals);
document.getElementById('searchAddBtn').addEventListener('click', async () => {
  if(!selectedProduct) return;
  await addEntry({ name: selectedProduct.product_name, ...scaledMacros() });
});
