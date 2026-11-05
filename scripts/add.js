// Add-food page (a full view, not a popup — opened via the floating + button
// or by tapping a category header on the day view). Four tabs:
//  - Suche: text search via the Open Food Facts API
//  - Barcode: scans a barcode with the camera and looks the product up by code
//  - Übernehmen: copies an entry already logged on another day (e.g. "today's
//    lunch, same as yesterday's") onto the current one
//  - Schnelleingabe: the original manual name + macros form
// Suche and Barcode share the same result-row UI (renderResultRows/buildResultRow
// below): a quick + button that adds a 100g default instantly, or tapping the
// row expands an inline amount editor right underneath itself. That editor
// can count in grams or servings where the source knows a serving size (see
// gramsForUnit). Both search-like
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

// --- Undo toast: a brief "Rückgängig" affordance after adding, shared by
// all four tabs. Suche/Barcode/Schnelleingabe all funnel through addEntry()
// below; Übernehmen is wired separately where it copies entries, since it
// doesn't navigate away and can add several entries in one tap (a whole meal).
let undoToastTimer = null;
function showUndoToast(count, onUndo){
  const toastEl = document.getElementById('undoToast');
  document.getElementById('undoToastText').textContent =
    count > 1 ? `${count} ${t('entriesAddedSuffix')}` : t('entryAdded');

  // Replacing the button swaps out any previous click listener in one go —
  // simpler than tracking/removing the old one by hand, and correct even if
  // another add happens while the toast from the last one is still showing
  clearTimeout(undoToastTimer);
  const oldBtn = document.getElementById('undoToastBtn');
  const btn = oldBtn.cloneNode(true);
  oldBtn.replaceWith(btn);
  btn.addEventListener('click', async () => {
    clearTimeout(undoToastTimer);
    toastEl.classList.remove('show');
    await onUndo();
  });

  toastEl.classList.add('show');
  undoToastTimer = setTimeout(() => toastEl.classList.remove('show'), 2000);
}

// Removes entries that were just pushed to currentEntries, by index — NOT by
// object reference: renderDay() always reloads currentEntries fresh from
// storage (day.js, currentEntries = entries, parsed anew from JSON), so by
// the time "Rückgängig" is actually clicked, the object pushed a moment ago
// no longer exists anywhere in the array, only an equivalent-looking new one
// does. Each index is the position the entry was pushed to (addEntry/
// pushCopiedEntry below always append, so that's currentEntries.length right
// before the push) — correct as long as nothing else reshuffled the array in
// the few seconds the toast is up, which holds for the normal case this is
// meant for. Highest index first, so removing one doesn't shift the others.
function undoAddedEntries(indices, markedBtns){
  return async () => {
    [...indices].sort((a, b) => b - a).forEach((idx) => {
      if(idx >= 0 && idx < currentEntries.length) currentEntries.splice(idx, 1);
    });
    await saveEntries(currentDate, currentEntries);
    renderDay();
    (markedBtns || []).forEach((btn) => {
      btn.textContent = '+';
      btn.disabled = false;
      btn.classList.remove('copied');
    });
  };
}

// Shared by Suche/Barcode/Schnelleingabe: append the finished entry, persist, and return to the day view
async function addEntry(entry){
  const full = { category: document.getElementById('addCategory').value, ...entry };
  const idx = currentEntries.length;
  currentEntries.push(full);
  await saveEntries(currentDate, currentEntries);
  showView('day');
  renderDay();
  showUndoToast(1, undoAddedEntries([idx]));
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

// --- Units: grams (always), serving (from the source's serving size, e.g.
// "1 scoop = 35 g" for protein powder).
// The amount editor counts in the selected unit, but the entry itself always
// stores grams, so editing and the macro maths stay exactly as they were.

// Gram amount for an amount typed in a given unit. Anything missing a weight
// for that unit just yields 0 — the unit option isn't offered in that case.
function gramsForUnit(p, unit, amount){
  if(unit === 'serving') return Math.round(amount * (p.serving_quantity || 0));
  return amount;
}
function gramsFor(container, p, idx){
  const amount = Number(container.querySelector(`.grams-input[data-idx="${idx}"]`).value) || 0;
  const unit = container.querySelector(`.unit-select[data-idx="${idx}"]`).value;
  return gramsForUnit(p, unit, amount);
}

// The unit choices for one row: grams always, plus the serving if the source
// gives a serving size (Open Food Facts' serving_quantity)
function unitOptionsHtml(p){
  const opts = [`<option value="g">g</option>`];
  if(p.serving_quantity > 0){
    opts.push(`<option value="serving">${t('unitServing')} (${Math.round(p.serving_quantity)} g)</option>`);
  }
  return opts.join('');
}

// Shows the gram equivalent (when not already in grams) next to the macros
function updateDetailPreview(container, p, idx){
  const unit = container.querySelector(`.unit-select[data-idx="${idx}"]`).value;
  const grams = gramsFor(container, p, idx);
  const prefix = unit === 'g' ? '' : `≈ ${grams} g · `;
  container.querySelector(`.detail-macros[data-idx="${idx}"]`).textContent = prefix + macroSummary(p, grams);
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
          <label class="mini">${t('searchAmount')}</label>
          <input type="number" class="grams-input" data-idx="${idx}" value="100" min="1">
        </div>
        <div class="macrocell">
          <label class="mini">${t('searchUnit')}</label>
          <select class="unit-select" data-idx="${idx}">${unitOptionsHtml(p)}</select>
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
// container, closing any other open one in that same container. Returns
// whether it was just opened.
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
  return wasHidden;
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
      rememberProduct(p);
      await addEntry({ name: p.product_name, grams: 100, per100: per100Of(p), ...scaledMacros(p, 100) });
      return;
    }
    const confirmBtn = e.target.closest('.confirm-add-btn');
    if(confirmBtn){
      const idx = Number(confirmBtn.getAttribute('data-idx'));
      const p = getProducts()[idx];
      const grams = gramsFor(container, p, idx);
      rememberProduct(p);
      await addEntry({ name: p.product_name, grams, per100: per100Of(p), ...scaledMacros(p, grams) });
      return;
    }
    const row = e.target.closest('.search-result');
    if(row){
      const idx = Number(row.getAttribute('data-idx'));
      toggleResultDetail(container, idx);
    }
  });
  container.addEventListener('input', (e) => {
    const gramsInput = e.target.closest('.grams-input');
    if(!gramsInput) return;
    const idx = Number(gramsInput.getAttribute('data-idx'));
    updateDetailPreview(container, getProducts()[idx], idx);
  });
  container.addEventListener('change', (e) => {
    const unitSelect = e.target.closest('.unit-select');
    if(!unitSelect) return;
    // Switching unit resets the amount to something sensible for it:
    // 100 g, or one serving
    const idx = Number(unitSelect.getAttribute('data-idx'));
    container.querySelector(`.grams-input[data-idx="${idx}"]`).value = unitSelect.value === 'g' ? 100 : 1;
    updateDetailPreview(container, getProducts()[idx], idx);
  });
}

// --- Suche tab: text search via Open Food Facts ---
// Open Food Facts is German-language friendly (most products are German
// packaging with German names), so it's the only source. OFF ranks by
// popularity, so a very short query like "Ei" is flooded by "Eis", Mayo, etc.
// and the eggs never make the top 50. QUERY_ALIASES adds the plural form for
// such queries, so both are searched and merged.
let searchResults = [];

const QUERY_ALIASES = { ei: ['eier'] };

// --- Recently used / scanned products ---
// Every product that was added or scanned is remembered (newest first), so
// it can be found again without searching — shown at the top of the Suche tab
// when it's empty, and ranked above fresh results when it matches a search.
const RECENT_KEY = 'fuellog:recentProducts';
const RECENT_MAX = 30;

function loadRecent(){
  // Entries saved before USDA was removed are dropped (they carry an fdcId)
  try{ return (JSON.parse(localStorage.getItem(RECENT_KEY)) || []).filter((r) => !r.fdcId); }catch(e){ return []; }
}
function productKey(p){
  return `${p.product_name}|${p.brands || ''}`;
}
function rememberProduct(p){
  // Only the fields needed to rebuild the row and scale the macros — no
  // transient loading flags
  const clean = {
    product_name: p.product_name,
    brands: p.brands,
    nutriments: p.nutriments,
    serving_quantity: p.serving_quantity,
  };
  const key = productKey(clean);
  const list = [clean, ...loadRecent().filter((r) => productKey(r) !== key)].slice(0, RECENT_MAX);
  try{ localStorage.setItem(RECENT_KEY, JSON.stringify(list)); }catch(e){}
}

// Shows the recently used products as the idle content of the Suche tab —
// or, with a query, those of them that match it. This is what the first
// keystroke shows: an instant, local-only result from what's already been
// used before, well before the network search (only triggered by Suchen/
// Enter — see runSearch) has a chance to answer.
function showRecents(query){
  const resultsEl = document.getElementById('searchResults');
  const all = loadRecent();
  searchResults = query
    ? all.filter((r) => relevanceScore(r.product_name, query) > 0)
        .sort((a, b) => relevanceScore(b.product_name, query) - relevanceScore(a.product_name, query))
    : all;
  if(searchResults.length === 0){ resultsEl.innerHTML = ''; return; }
  renderResultRows(resultsEl, searchResults, 'searchNoResults');
  resultsEl.insertAdjacentHTML('afterbegin', `<div class="search-section-label">${t('recentLabel')}</div>`);
}

function resetSearchTab(){
  document.getElementById('searchInput').value = '';
  showRecents();
}

async function fetchOffResults(query){
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=50&fields=product_name,brands,nutriments,serving_quantity`;
  const getJson = async () => {
    const res = await fetch(url);
    if(!res.ok) throw new Error('off bad response');
    return res.json();
  };
  // Open Food Facts occasionally answers 503 for a moment (and such an error
  // response comes without CORS headers, so the browser reports it as a failed
  // fetch) — one retry after a short pause covers that
  let data;
  try{ data = await getJson(); }
  catch(e){
    await new Promise((r) => setTimeout(r, 800));
    data = await getJson();
  }
  // Only keep products that actually have a name and a positive kcal/100g
  // value — Open Food Facts entries are user-submitted and often incomplete,
  // and a 0 kcal entry is essentially always missing data, not a real food
  return (data.products || []).filter(
    (p) => p.product_name && p.nutriments && p.nutriments['energy-kcal_100g'] > 0
  );
}

// Open Food Facts ranks by popularity, not by how well a name matches the query,
// so this re-scores results by name: "Eier" (starts with "ei") ranks above a
// long name that only contains "ei" somewhere inside.
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
  if(!query){ showRecents(); return; }

  resultsEl.innerHTML = `<div class="loading">${t('searching')}</div>`;
  const terms = [query, ...(QUERY_ALIASES[query.toLowerCase()] || [])];
  const outcomes = await Promise.allSettled(terms.map(fetchOffResults));
  if(outcomes.every((o) => o.status === 'rejected')){
    resultsEl.innerHTML = `<div class="search-hint">${t('searchError')}</div>`;
    return;
  }

  // Merge the query's own results with its aliases', dropping duplicates. Alias
  // hits get a small ranking boost: for "Ei" the plural results are what's meant,
  // and a name like "Eis" would otherwise rank just above "Eier" by letter count.
  const seen = new Set();
  const boosted = new Set();
  const offResults = [];
  outcomes.forEach((o, i) => {
    if(o.status !== 'fulfilled') return;
    o.value.forEach((p) => {
      const key = productKey(p);
      if(seen.has(key)) return;
      seen.add(key);
      if(i > 0) boosted.add(key);
      offResults.push(p);
    });
  });
  const score = (p) => relevanceScore(p.product_name, query) + (boosted.has(productKey(p)) ? 10 : 0);

  // Recently used products that match the query go first, and are dropped from
  // the fresh results so the same product doesn't appear twice
  const recents = loadRecent()
    .filter((r) => relevanceScore(r.product_name, query) > 0)
    .sort((a, b) => relevanceScore(b.product_name, query) - relevanceScore(a.product_name, query));
  const recentKeys = new Set(recents.map(productKey));
  const fresh = offResults
    .filter((p) => !recentKeys.has(productKey(p)))
    .sort((a, b) => score(b) - score(a));
  searchResults = [...recents, ...fresh];

  renderResultRows(resultsEl, searchResults, 'searchNoResults');
}

document.getElementById('searchBtn').addEventListener('click', runSearch);
document.getElementById('searchInput').addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); runSearch(); }
});
// Every keystroke re-filters the recently used products locally — no network
// request, so it's instant. The actual Open Food Facts search only ever
// happens via runSearch (Suchen button / Enter), which overwrites this.
document.getElementById('searchInput').addEventListener('input', () => {
  showRecents(document.getElementById('searchInput').value.trim());
});
wireResultContainer('searchResults', () => searchResults);

// --- Barcode tab: scan with the camera (ZXing), then look the code up ---
let barcodeResults = [];
let codeReader = null;
let scanStream = null;
let scanTimer = null;
let scanCanvas = null;

function resetBarcodeTab(){
  stopScan();
  document.getElementById('barcodeStatus').textContent = '';
  document.getElementById('barcodeResults').innerHTML = '';
  barcodeResults = [];
}

// Scanning is done by hand here instead of via ZXing's own decodeFromVideoDevice
// loop. Reason: a barcode can be held facing the camera from any side, but
// ZXing's TRY_HARDER hint only adds a single extra 90°-rotated attempt per
// frame internally — on some phones' camera feeds that still isn't enough to
// catch every orientation (reported: only recognized once rotated exactly
// 90°). This loop instead draws every frame at all four 90° rotations and
// tries each one, so however the product is actually held, one of the four
// always reads it "the right way up". Also asks for a higher-resolution feed
// with continuous autofocus, which helps with a barcode held at an angle or
// partly covered by a finger/shadow (more/sharper bars for the decoder to
// work with) — though one that's mostly covered is still physically
// unreadable; no algorithm can invent bars that were never captured.
async function startScan(){
  document.getElementById('barcodeStatus').textContent = '';
  document.getElementById('barcodeResults').innerHTML = '';
  document.getElementById('scannerWrap').classList.remove('hidden');
  document.getElementById('scanBtn').classList.add('hidden');
  try{
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    codeReader = new ZXing.BrowserMultiFormatReader(hints);

    // { ideal: ... } throughout — never a hard constraint — so this still
    // works on a device without a rear/"environment" camera or without
    // autofocus control (e.g. a laptop, used while testing) instead of
    // failing outright with an OverconstrainedError
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 }, height: { ideal: 1080 },
        advanced: [{ focusMode: 'continuous' }],
      },
    });
    const video = document.getElementById('scannerVideo');
    video.srcObject = scanStream;
    await video.play();

    scanCanvas = document.createElement('canvas');
    const ctx = scanCanvas.getContext('2d', { willReadFrequently: true });
    const ROTATIONS = [0, 90, 180, 270];

    scanTimer = setInterval(() => {
      if(!video.videoWidth) return; // stream metadata not loaded yet
      for(const angle of ROTATIONS){
        const rotated = angle === 90 || angle === 270;
        scanCanvas.width = rotated ? video.videoHeight : video.videoWidth;
        scanCanvas.height = rotated ? video.videoWidth : video.videoHeight;
        ctx.save();
        ctx.translate(scanCanvas.width / 2, scanCanvas.height / 2);
        ctx.rotate(angle * Math.PI / 180);
        ctx.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2);
        ctx.restore();
        try{
          const source = new ZXing.HTMLCanvasElementLuminanceSource(scanCanvas);
          const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source));
          const result = codeReader.decodeBitmap(bitmap);
          stopScan();
          lookupBarcode(result.getText());
          return;
        }catch(e){
          // Not found at this rotation — the next one in ROTATIONS is tried,
          // and if all four miss, the next tick (150ms later) tries again
        }
      }
    }, 150);
  }catch(e){
    document.getElementById('barcodeStatus').textContent = t('cameraError');
    stopScan();
  }
}
function stopScan(){
  if(scanTimer){ clearInterval(scanTimer); scanTimer = null; }
  if(scanStream){ scanStream.getTracks().forEach((track) => track.stop()); scanStream = null; }
  const video = document.getElementById('scannerVideo');
  if(video.srcObject) video.srcObject = null;
  codeReader = null;
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
    rememberProduct(p);
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
// The day currently being browsed in the Übernehmen tab — stepped with ‹ ›
// instead of a date picker, same spirit as the day view's own navigation.
// Never allowed past today: there's nothing to copy from a day that hasn't
// happened yet.
let copySourceDate = new Date();

function resetCopyTab(){
  // Defaults to the day before whichever day is being added to (currentDate),
  // not necessarily today — matters when backfilling a past day too
  copySourceDate = new Date(currentDate.getTime() - 86400000);
  loadCopySource();
}

document.getElementById('copyPrevDay').addEventListener('click', () => {
  copySourceDate = new Date(copySourceDate.getTime() - 86400000);
  loadCopySource();
});
document.getElementById('copyNextDay').addEventListener('click', () => {
  const next = new Date(copySourceDate.getTime() + 86400000);
  if(fmtKey(next) > fmtKey(new Date())) return; // can't browse into the future
  copySourceDate = next;
  loadCopySource();
});

async function loadCopySource(){
  document.getElementById('copyDateText').textContent = fmtLabel(copySourceDate);

  // Flags the source day as "Heute"/"Gestern" when it is one of those — the
  // ‹ › stepper alone makes it easy to lose track of exactly how far back
  // you've gone, same reasoning as the day view's own today-tag
  const tag = document.getElementById('copyDateTag');
  const key = fmtKey(copySourceDate);
  if(key === fmtKey(new Date())){
    tag.textContent = t('today');
    tag.classList.remove('hidden');
  } else if(key === fmtKey(new Date(Date.now() - 86400000))){
    tag.textContent = t('yesterday');
    tag.classList.remove('hidden');
  } else {
    tag.classList.add('hidden');
  }

  copySourceEntries = await loadEntries(copySourceDate);
  renderCopyResults();
}

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
          <span class="group-chevron">▾</span>
          <span class="cat-meta-divider"></span>
          <button class="quick-add-btn copy-group-add" data-category="${cat}" title="${t('addBtn')}">+</button>
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
    const pushedIdx = await copyEntryToToday(Number(entryBtn.getAttribute('data-idx')));
    markCopied(entryBtn);
    showUndoToast(1, undoAddedEntries([pushedIdx], [entryBtn]));
    return;
  }
  const groupBtn = e.target.closest('.copy-group-add');
  if(groupBtn){
    const cat = groupBtn.getAttribute('data-category');
    const pushedIdxs = await copyGroupToToday(cat);
    markCopied(groupBtn);
    const entryBtns = [...document.querySelectorAll(`.copy-group-entries[data-category="${cat}"] .copy-entry-add`)];
    entryBtns.forEach(markCopied);
    showUndoToast(pushedIdxs.length, undoAddedEntries(pushedIdxs, [groupBtn, ...entryBtns]));
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
// Returns the index the entry landed at (see undoAddedEntries above for why
// an index, not the object itself, is what the undo toast needs)
function pushCopiedEntry(src){
  const { category, ...rest } = src;
  currentEntries.push({ category: document.getElementById('addCategory').value, ...rest });
  return currentEntries.length - 1;
}
async function copyEntryToToday(idx){
  const pushedIdx = pushCopiedEntry(copySourceEntries[idx]);
  await saveEntries(currentDate, currentEntries);
  return pushedIdx;
}
async function copyGroupToToday(category){
  const pushedIdxs = copySourceEntries.filter((e) => categoryOf(e) === category).map(pushCopiedEntry);
  await saveEntries(currentDate, currentEntries);
  return pushedIdxs;
}
