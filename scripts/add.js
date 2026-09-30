// Add-food page (a full view, not a popup — opened via the floating + button
// or by tapping a category header on the day view). Three tabs:
//  - Suche: text search via the Open Food Facts API
//  - Barcode: scans a barcode with the camera and looks the product up by code
//  - Schnelleingabe: the original manual name + macros form
// Suche and Barcode share the same result-row UI (renderResultRows/buildResultRow
// below): a quick + button that adds a 100g default instantly, or tapping the
// row expands an inline amount editor right underneath itself. Both search-like
// tabs and the quick-entry form all end up calling addEntry() to append to
// currentEntries (from day.js) and save the day.
//
// Suche/Barcode entries also store `grams` + `per100` (the product's per-100g
// values) on the entry itself — day.js's edit modal uses that to let you see
// and change the logged amount later, instead of only raw macro numbers.
// Schnelleingabe entries have neither field, and are always edited as raw
// numbers, since there's no underlying product to scale from.

function defaultCategoryByTime(){
  const h = new Date().getHours();
  if(h < 11) return 'breakfast';
  if(h < 15) return 'lunch';
  if(h < 20) return 'dinner';
  return 'snacks';
}

// Opens the add page pre-set to the given category, always starting on the
// search tab with all three tabs reset to a blank state
function openAddPage(category){
  document.getElementById('addCategory').value = category;
  switchAddTab('search');
  resetSearchTab();
  resetBarcodeTab();
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
document.getElementById('addBack').addEventListener('click', ()=>{
  stopScan();
  showView('day');
});

function switchAddTab(tab){
  document.getElementById('addModeSearch').classList.toggle('active', tab === 'search');
  document.getElementById('addModeBarcode').classList.toggle('active', tab === 'barcode');
  document.getElementById('addModeQuick').classList.toggle('active', tab === 'quick');
  document.getElementById('addSearchTab').classList.toggle('hidden', tab !== 'search');
  document.getElementById('addBarcodeTab').classList.toggle('hidden', tab !== 'barcode');
  document.getElementById('addQuickTab').classList.toggle('hidden', tab !== 'quick');
  if(tab !== 'barcode') stopScan();
}
document.getElementById('addModeSearch').addEventListener('click', ()=> switchAddTab('search'));
document.getElementById('addModeBarcode').addEventListener('click', ()=> switchAddTab('barcode'));
document.getElementById('addModeQuick').addEventListener('click', ()=> switchAddTab('quick'));

// Shared by all three tabs: append the finished entry, persist, and return to the day view
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

// --- Shared result-row rendering (used by both Suche and Barcode) ---
// Each result has a quick + button (adds 100g instantly, no scrolling/typing)
// and can also be tapped to expand an inline amount editor right underneath
// itself — never a separate section at the bottom of the page.

// A product's per-100g nutriments, normalized to our own {kcal,protein,carbs,fat}
// naming — this is what gets stored on the entry (as `per100`) alongside the
// gram amount used, so day.js's edit modal can later show/change the amount
// instead of just raw macro numbers, for anything added via Suche/Barcode.
function per100Of(product){
  const n = product.nutriments;
  return {
    kcal: n['energy-kcal_100g'] || 0,
    protein: n['proteins_100g'] || 0,
    carbs: n['carbohydrates_100g'] || 0,
    fat: n['fat_100g'] || 0,
  };
}
function scaledMacros(product, grams){
  return scaleFromPer100(per100Of(product), grams);
}
function macroSummary(product, grams){
  const m = scaledMacros(product, grams);
  return `${m.kcal} kcal · ${fmtMacro(m.protein)}g P · ${fmtMacro(m.carbs)}g C · ${fmtMacro(m.fat)}g F`;
}

function buildResultRow(p, idx){
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
  return wrap;
}
function renderResultRows(container, products, emptyKey){
  if(products.length === 0){
    container.innerHTML = `<div class="search-hint">${t(emptyKey)}</div>`;
    return;
  }
  container.innerHTML = '';
  products.forEach((p, idx) => container.appendChild(buildResultRow(p, idx)));
}

// Expands/collapses the inline amount editor for one result within a
// container, closing any other open one in that same container
function toggleResultDetail(container, idx){
  const target = container.querySelector(`.search-result-detail[data-idx="${idx}"]`);
  const wasHidden = target.classList.contains('hidden');
  container.querySelectorAll('.search-result-detail').forEach((d) => d.classList.add('hidden'));
  if(wasHidden){
    target.classList.remove('hidden');
    const gramsInput = target.querySelector('.grams-input');
    gramsInput.focus();
    gramsInput.select();
  }
}

// Wires the quick-add / expand / confirm / live-preview interactions for one
// results container. `getProducts` is called lazily so it always reads the
// current array (search results get replaced on every new search)
function wireResultContainer(containerId, getProducts){
  const container = document.getElementById(containerId);
  container.addEventListener('click', async (e) => {
    const quickBtn = e.target.closest('.quick-add-btn');
    if(quickBtn){
      const p = getProducts()[Number(quickBtn.getAttribute('data-idx'))];
      await addEntry({ name: p.product_name, grams: 100, per100: per100Of(p), ...scaledMacros(p, 100) });
      return;
    }
    const confirmBtn = e.target.closest('.confirm-add-btn');
    if(confirmBtn){
      const idx = Number(confirmBtn.getAttribute('data-idx'));
      const grams = Number(container.querySelector(`.grams-input[data-idx="${idx}"]`).value) || 0;
      const p = getProducts()[idx];
      await addEntry({ name: p.product_name, grams, per100: per100Of(p), ...scaledMacros(p, grams) });
      return;
    }
    const row = e.target.closest('.search-result');
    if(row){ toggleResultDetail(container, Number(row.getAttribute('data-idx'))); }
  });
  container.addEventListener('input', (e) => {
    const gramsInput = e.target.closest('.grams-input');
    if(!gramsInput) return;
    const idx = Number(gramsInput.getAttribute('data-idx'));
    const grams = Number(gramsInput.value) || 0;
    container.querySelector(`.detail-macros[data-idx="${idx}"]`).textContent = macroSummary(getProducts()[idx], grams);
  });
}

// --- Suche tab: Open Food Facts text search ---
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
    // page_size is fetched larger than what's actually shown, because Open Food
    // Facts ranks branded/packaged products (more complete data, more scans)
    // above plain/generic ingredients — a search for a raw item like an onion
    // can bury or entirely push out the one usable "Zwiebel" entry behind pages
    // of onion-flavored sauces and spreads. Fetching more gives the filter below
    // a better chance of still finding it.
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=50&fields=product_name,brands,nutriments`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('bad response');
    const data = await res.json();
    // Only keep products that actually have a name and a kcal/100g value —
    // Open Food Facts entries are user-submitted and often incomplete (this is
    // especially common for generic/unbranded ingredients, which is also why
    // they're rare in results to begin with)
    searchResults = (data.products || []).filter(
      (p) => p.product_name && p.nutriments && p.nutriments['energy-kcal_100g'] != null
    );
    renderResultRows(resultsEl, searchResults, 'searchNoResults');
  }catch(e){
    resultsEl.innerHTML = `<div class="search-hint">${t('searchError')}</div>`;
  }
}

document.getElementById('searchBtn').addEventListener('click', runSearch);
document.getElementById('searchInput').addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); runSearch(); }
});
wireResultContainer('searchResults', () => searchResults);

// --- Barcode tab: scan with the camera (ZXing), then look the code up ---
let barcodeResults = [];
let codeReader = null;

function resetBarcodeTab(){
  stopScan();
  document.getElementById('barcodeStatus').textContent = '';
  document.getElementById('barcodeResults').innerHTML = '';
  barcodeResults = [];
}

async function startScan(){
  document.getElementById('barcodeStatus').textContent = '';
  document.getElementById('barcodeResults').innerHTML = '';
  document.getElementById('scannerWrap').classList.remove('hidden');
  document.getElementById('scanBtn').classList.add('hidden');
  try{
    codeReader = new ZXing.BrowserMultiFormatReader();
    await codeReader.decodeFromVideoDevice(undefined, 'scannerVideo', (result) => {
      if(result){
        const code = result.getText();
        stopScan();
        lookupBarcode(code);
      }
    });
  }catch(e){
    document.getElementById('barcodeStatus').textContent = t('cameraError');
    stopScan();
  }
}
function stopScan(){
  if(codeReader){ codeReader.reset(); codeReader = null; }
  document.getElementById('scannerWrap').classList.add('hidden');
  document.getElementById('scanBtn').classList.remove('hidden');
}

async function lookupBarcode(code){
  document.getElementById('barcodeStatus').textContent = t('searching');
  try{
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
    if(!res.ok) throw new Error('bad response');
    const data = await res.json();
    const p = data.product;
    if(data.status !== 1 || !p || !p.product_name || !p.nutriments || p.nutriments['energy-kcal_100g'] == null){
      barcodeResults = [];
      document.getElementById('barcodeStatus').textContent = t('scanNotFound');
      return;
    }
    barcodeResults = [p];
    document.getElementById('barcodeStatus').textContent = '';
    renderResultRows(document.getElementById('barcodeResults'), barcodeResults, 'scanNotFound');
  }catch(e){
    document.getElementById('barcodeStatus').textContent = t('searchError');
  }
}

document.getElementById('scanBtn').addEventListener('click', startScan);
document.getElementById('scanCancelBtn').addEventListener('click', stopScan);
wireResultContainer('barcodeResults', () => barcodeResults);
