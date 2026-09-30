// Add-food page (a full view, not a popup — opened via the floating + button
// or by tapping a category header on the day view). Four tabs:
//  - Suche: text search via the Open Food Facts API
//  - Barcode: scans a barcode with the camera and looks the product up by code
//  - Übernehmen: copies an entry already logged on another day (e.g. "today's
//    lunch, same as yesterday's") onto the current one
//  - Schnelleingabe: the original manual name + macros form
// Suche and Barcode share the same result-row UI (renderResultRows/buildResultRow
// below): a quick + button that adds a 100g default instantly, or tapping the
// row expands an inline amount editor right underneath itself. Both search-like
// tabs and the quick-entry form all end up calling addEntry() to append to
// currentEntries (from day.js), save, and return to the day view. Übernehmen
// is the one exception — it stays open after each copy so several entries can
// be pulled from the same source day in one go (see copyEntryToToday below).
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
// search tab with all four tabs reset to a blank state
function openAddPage(category){
  document.getElementById('addCategory').value = category;
  switchAddTab('search');
  resetSearchTab();
  resetBarcodeTab();
  resetCopyTab();
  resetQuickTab();
  showView('add');
}

document.getElementById('fabAdd').addEventListener('click', ()=>{
  openAddPage(defaultCategoryByTime());
});
// Tapping a meal's own + opens the add page pre-set to that category;
// tapping anywhere else on the header just expands/collapses its list
document.querySelectorAll('.meal-group-header').forEach((header)=>{
  header.addEventListener('click', (e)=>{
    const category = header.getAttribute('data-category');
    if(e.target.closest('.cat-add-btn')){
      openAddPage(category);
    } else {
      toggleMealGroup(category);
    }
  });
});
document.getElementById('addBack').addEventListener('click', ()=>{
  stopScan();
  showView('day');
  // Übernehmen can silently add several entries while this page stays open
  // (see copyEntryToToday) — always refresh so none of that is stale once back
  renderDay();
});

function switchAddTab(tab){
  document.getElementById('addModeSearch').classList.toggle('active', tab === 'search');
  document.getElementById('addModeBarcode').classList.toggle('active', tab === 'barcode');
  document.getElementById('addModeCopy').classList.toggle('active', tab === 'copy');
  document.getElementById('addModeQuick').classList.toggle('active', tab === 'quick');
  document.getElementById('addSearchTab').classList.toggle('hidden', tab !== 'search');
  document.getElementById('addBarcodeTab').classList.toggle('hidden', tab !== 'barcode');
  document.getElementById('addCopyTab').classList.toggle('hidden', tab !== 'copy');
  document.getElementById('addQuickTab').classList.toggle('hidden', tab !== 'quick');
  if(tab !== 'barcode') stopScan();
}
document.getElementById('addModeSearch').addEventListener('click', ()=> switchAddTab('search'));
document.getElementById('addModeBarcode').addEventListener('click', ()=> switchAddTab('barcode'));
document.getElementById('addModeCopy').addEventListener('click', ()=> switchAddTab('copy'));
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

// --- Suche tab: text search, merged from two sources ---
// Open Food Facts covers branded/packaged products well but is weak on plain
// raw ingredients (a search for "onion" mostly returns onion-flavored sauces
// and snacks — OFF ranks by completeness/popularity, which favors branded
// goods). USDA FoodData Central is the opposite: built specifically for raw/
// generic foods (fruit, vegetables, meat, ...), no barcodes though, so it's
// not used for the Barcode tab. Both get queried and merged here.
let searchResults = [];

// A free public-use key with modest rate limits (30 req/hour, 50/day per IP) —
// fine for personal use. A user's own free key (instant signup, no card, see
// https://fdc.nal.usda.gov/api-key-signup.html) can just replace this string
// for higher limits; nothing else about the integration needs to change.
const FDC_API_KEY = 'DEMO_KEY';

function resetSearchTab(){
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
  searchResults = [];
}

async function fetchOffResults(query){
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=50&fields=product_name,brands,nutriments`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('off bad response');
  const data = await res.json();
  // Only keep products that actually have a name and a positive kcal/100g
  // value — Open Food Facts entries are user-submitted and often incomplete,
  // and a 0 kcal entry is essentially always missing data, not a real food
  return (data.products || []).filter(
    (p) => p.product_name && p.nutriments && p.nutriments['energy-kcal_100g'] > 0
  );
}

// Normalizes one USDA food into Open Food Facts' own product shape (product_name/
// brands/nutriments with the same field names) so both sources can share
// buildResultRow/scaledMacros/per100Of unchanged. Restricted to the Foundation
// and SR Legacy datasets — USDA's actually-measured raw-ingredient data,
// skipping its "Branded" dataset (that's what OFF already covers) and its
// "Survey (FNDDS)" dataset (recipe/mixed-dish estimates, less precise).
function fdcToProduct(food){
  const nutrient = (num) => {
    const n = food.foodNutrients.find((x) => String(x.nutrientNumber) === num);
    return n ? n.value : null;
  };
  const kcal = nutrient('208');
  if(!(kcal > 0)) return null;
  return {
    product_name: food.description,
    brands: 'USDA',
    nutriments: {
      'energy-kcal_100g': kcal,
      'proteins_100g': nutrient('203') || 0,
      'carbohydrates_100g': nutrient('205') || 0,
      'fat_100g': nutrient('204') || 0,
    },
  };
}
async function fetchFdcResults(query){
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${FDC_API_KEY}&query=${encodeURIComponent(query)}&pageSize=25&dataType=Foundation,SR%20Legacy`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('fdc bad response'); // also covers a rate-limited DEMO_KEY (429)
  const data = await res.json();
  return (data.foods || []).map(fdcToProduct).filter(Boolean);
}

// Open Food Facts and USDA each rank their own results very differently
// internally, so a merged list needs one consistent ranking of its own — this
// scores by how closely a result's name matches the query, so e.g. "Onions,
// raw" (near-exact) ranks above a long branded "Onion Rings, Zwiebel" name
// even though both contain the query text.
function relevanceScore(name, query){
  const n = (name || '').toLowerCase();
  const q = query.toLowerCase().trim();
  if(!q) return 0;
  if(n === q) return 100;
  if(n.startsWith(q)) return 80 - Math.min(20, n.length - q.length);
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if(new RegExp(`\\b${escaped}\\b`).test(n)) return 60 - Math.min(30, n.length - q.length);
  if(n.includes(q)) return 20 - Math.min(15, n.length - q.length);
  return 0;
}

async function runSearch(){
  const query = document.getElementById('searchInput').value.trim();
  const resultsEl = document.getElementById('searchResults');
  if(!query){ resultsEl.innerHTML = ''; return; }

  resultsEl.innerHTML = `<div class="loading">${t('searching')}</div>`;
  const [offOutcome, fdcOutcome] = await Promise.allSettled([fetchOffResults(query), fetchFdcResults(query)]);

  // Only show the error state if BOTH sources failed (e.g. no internet) — a
  // rate-limited DEMO_KEY shouldn't take down Open Food Facts results too
  if(offOutcome.status === 'rejected' && fdcOutcome.status === 'rejected'){
    resultsEl.innerHTML = `<div class="search-hint">${t('searchError')}</div>`;
    return;
  }

  const fdcResults = fdcOutcome.status === 'fulfilled' ? fdcOutcome.value : [];
  const offResults = offOutcome.status === 'fulfilled' ? offOutcome.value : [];
  searchResults = [...fdcResults, ...offResults]
    .sort((a, b) => relevanceScore(b.product_name, query) - relevanceScore(a.product_name, query));

  renderResultRows(resultsEl, searchResults, 'searchNoResults');
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
    if(data.status !== 1 || !p || !p.product_name || !p.nutriments || !(p.nutriments['energy-kcal_100g'] > 0)){
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

// --- Übernehmen tab: copy entries already logged on another day ---
// Grouped by meal (breakfast/lunch/dinner/snacks), same as the day view
// itself: each group's header shows a kcal subtotal and a + to copy the
// whole meal in one tap, or tap the header itself to expand it and copy
// entries individually. A copy always lands in the category currently
// selected in addCategory, which may well differ from the source's own.
const CATEGORY_ORDER = ['breakfast', 'lunch', 'dinner', 'snacks'];
const CATEGORY_LABEL_KEYS = { breakfast: 'catBreakfast', lunch: 'catLunch', dinner: 'catDinner', snacks: 'catSnacks' };

let copySourceEntries = [];

function resetCopyTab(){
  const dateInput = document.getElementById('copyDateInput');
  dateInput.max = fmtKey(new Date());
  // Defaults to the day before whichever day is being added to (currentDate),
  // not necessarily today — matters when backfilling a past day too
  dateInput.value = fmtKey(new Date(currentDate.getTime() - 86400000));
  loadCopySource();
}

async function loadCopySource(){
  const dateKey = document.getElementById('copyDateInput').value;
  if(!dateKey){ document.getElementById('copyResults').innerHTML = ''; copySourceEntries = []; return; }
  copySourceEntries = await loadEntries(parseDateKey(dateKey));
  renderCopyResults();
}
document.getElementById('copyDateInput').addEventListener('change', loadCopySource);

function renderCopyResults(){
  const resultsEl = document.getElementById('copyResults');
  if(copySourceEntries.length === 0){
    resultsEl.innerHTML = `<div class="search-hint">${t('copyEmpty')}</div>`;
    return;
  }
  resultsEl.innerHTML = '';
  // Keep each entry's index into the flat copySourceEntries array — individual
  // copies (and the edit/delete equivalents elsewhere) always address entries
  // that way, not by position within a single category's own sub-list
  const withIdx = copySourceEntries.map((e, idx) => ({ ...e, idx }));

  CATEGORY_ORDER.forEach((cat) => {
    const entries = withIdx.filter((e) => categoryOf(e) === cat);
    if(entries.length === 0) return;

    const kcalTotal = entries.reduce((s, e) => s + (Number(e.kcal) || 0), 0);
    const group = document.createElement('div');
    group.className = 'meal-group';
    group.innerHTML = `
      <div class="meal-group-header copy-group-toggle" data-category="${cat}">
        <span class="cat-name">${t(CATEGORY_LABEL_KEYS[cat])}</span>
        <span class="cat-meta">
          <span class="cat-kcal">${Math.round(kcalTotal)} kcal</span>
          <button class="quick-add-btn copy-group-add" data-category="${cat}" title="${t('addBtn')}">+</button>
          <span class="group-chevron">▾</span>
        </span>
      </div>
      <div class="copy-group-entries hidden" data-category="${cat}"></div>
    `;
    const entriesEl = group.querySelector('.copy-group-entries');
    entries.forEach((e) => {
      const row = document.createElement('div');
      row.className = 'meal';
      row.innerHTML = `
        <div>
          <div class="name">${escapeHtml(e.name || t('meal'))}</div>
          <div class="macros">P ${fmtMacro(e.protein)}g · C ${fmtMacro(e.carbs)}g · F ${fmtMacro(e.fat)}g</div>
        </div>
        <div class="meal-right">
          <span class="kcalval">${Math.round(e.kcal) || 0}</span>
          <button class="quick-add-btn copy-entry-add" data-idx="${e.idx}" title="${t('addBtn')}">+</button>
        </div>
      `;
      entriesEl.appendChild(row);
    });
    resultsEl.appendChild(group);
  });
}

// Single delegated listener for the whole tab: a tap can mean "copy this one
// entry", "copy this whole meal", or "expand/collapse this meal" — checked in
// that priority order so the buttons inside a header don't also toggle it
document.getElementById('copyResults').addEventListener('click', async (e) => {
  const entryBtn = e.target.closest('.copy-entry-add');
  if(entryBtn){
    await copyEntryToToday(Number(entryBtn.getAttribute('data-idx')));
    markCopied(entryBtn);
    return;
  }
  const groupBtn = e.target.closest('.copy-group-add');
  if(groupBtn){
    const cat = groupBtn.getAttribute('data-category');
    await copyGroupToToday(cat);
    markCopied(groupBtn);
    document.querySelectorAll(`.copy-group-entries[data-category="${cat}"] .copy-entry-add`).forEach(markCopied);
    return;
  }
  const toggle = e.target.closest('.copy-group-toggle');
  if(toggle){
    const cat = toggle.getAttribute('data-category');
    const entriesEl = document.querySelector(`.copy-group-entries[data-category="${cat}"]`);
    const nowHidden = entriesEl.classList.toggle('hidden');
    toggle.querySelector('.group-chevron').textContent = nowHidden ? '▾' : '▴';
  }
});

function markCopied(btn){
  btn.textContent = '✓';
  btn.disabled = true;
  btn.classList.add('copied');
}

// Neither of these navigates back to the day view — copying is often done a
// few entries (or a couple of whole meals) at a time from the same source
// day, so the page stays open (addBack always calls renderDay() on the way
// out to catch up on whatever changed while it was)
function pushCopiedEntry(src){
  const { category, ...rest } = src;
  currentEntries.push({ category: document.getElementById('addCategory').value, ...rest });
}
async function copyEntryToToday(idx){
  pushCopiedEntry(copySourceEntries[idx]);
  await saveEntries(currentDate, currentEntries);
}
async function copyGroupToToday(category){
  copySourceEntries.filter((e) => categoryOf(e) === category).forEach(pushCopiedEntry);
  await saveEntries(currentDate, currentEntries);
}
