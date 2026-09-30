// Day view: rendering the stat tiles + the meal list (grouped into breakfast/
// lunch/dinner/snacks) and the edit/delete confirmation popups. The add-food
// page itself (opened via the floating + button or a category header) lives
// in add.js.

let currentDate = new Date();
let currentEntries = [];
// Which week's Mon-Sun is shown in the header strip. Kept separate from
// currentDate so paging the strip with ‹ › only browses which week is shown —
// it does NOT change the viewed day. Only tapping a day cell changes
// currentDate; stripAnchor is then re-synced to it on the next renderDay()
// (also covers jumpToDay() from the week/month views), so the strip always
// snaps back to showing the selected day's own week once one is picked.
let stripAnchor = new Date(currentDate);

// Circumference of the top stat tiles' circular rings (r=27, see .stat-ring-circle)
const STAT_RING_CIRCUMFERENCE = 2 * Math.PI * 27;

// Fills one stat tile: today's value inside the ring, target as its own line
// below. Always whole numbers here — this is the day's overall totals/
// targets, so decimal macro precision (shown elsewhere: meal rows, search/
// edit previews) would just add clutter without adding anything useful at a
// glance. Two separate lines instead of "current/target" on one also avoids
// ever needing to cram both numbers into the same cramped line.
function setStatTile(numId, subId, ringId, value, target){
  document.getElementById(numId).textContent = Math.round(value);
  document.getElementById(subId).textContent = `${t('of')} ${target}`;
  const ring = document.getElementById(ringId);
  ring.style.strokeDasharray = STAT_RING_CIRCUMFERENCE;
  ring.style.strokeDashoffset = STAT_RING_CIRCUMFERENCE * (1 - pct(value, target) / 100);
}

// Meal categories: category id -> the suffix used by its list/kcal element ids
// (mealListBreakfast, catKcalBreakfast, ...). Entries saved before this feature
// existed have no `category` field — those fall back to 'snacks' wherever a
// category is read, so old data still displays without needing a migration.
const MEAL_CATEGORIES = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks',
};
function categoryOf(entry){
  return MEAL_CATEGORIES[entry.category] ? entry.category : 'snacks';
}

// Rough, fixed split of the day's kcal target across the 4 meals — there's no
// per-meal target setting, just this approximate breakdown, used to drive
// each meal-group header's circular progress ring (below).
const MEAL_KCAL_SHARE = { breakfast: 0.25, lunch: 0.35, dinner: 0.30, snacks: 0.10 };
const CAT_RING_CIRCUMFERENCE = 2 * Math.PI * 15.5; // matches the r="15.5" on .cat-ring circles

// Shows/hides one meal's entry list, flipping its header's chevron to match
function toggleMealGroup(category){
  const suffix = MEAL_CATEGORIES[category];
  const listEl = document.getElementById('mealList' + suffix);
  const header = document.querySelector(`.meal-group-header[data-category="${category}"]`);
  const nowHidden = listEl.classList.toggle('hidden');
  header.querySelector('.group-chevron').textContent = nowHidden ? '▾' : '▴';
}

// The 7 header-strip cells, created once and reused on every render (see
// renderDateBar below) — each cell's own click listener reads its live date
// from this array rather than a closure captured at creation time.
const weekStripCellDates = [null, null, null, null, null, null, null];

// Header week strip: shows the whole Mon-Sun week stripAnchor falls in, highlights
// whichever cell matches currentDate (if any), and marks today separately (in
// case it isn't the selected day, or isn't even in the currently browsed week).
//
// The 7 cells are built once and only ever have their text/class updated after
// that — rebuilding them from scratch on every render (innerHTML='' + fresh
// appendChild each time) could occasionally leave a just-recreated cell
// painting with the wrong background for a moment right after a tap, before a
// later style recalc corrected it (a real, reproducible timing quirk around
// var()-based colors on elements replaced within the same tick as the click
// that triggered the re-render — confirmed with a scripted repro). Updating
// existing, already-connected nodes in place sidesteps it entirely.
function renderDateBar(){
  document.getElementById('dateText').textContent = fmtLabel(currentDate);
  document.getElementById('todayTag').classList.toggle('hidden', !isSameDay(currentDate, new Date()));

  const dow = stripAnchor.getDay(); // 0=So, 1=Mo, ... 6=Sa
  const diffToMonday = (dow === 0 ? -6 : 1 - dow);
  const monday = new Date(stripAnchor.getFullYear(), stripAnchor.getMonth(), stripAnchor.getDate() + diffToMonday);

  const stripEl = document.getElementById('weekStripDays');
  if(stripEl.children.length !== 7){
    stripEl.innerHTML = '';
    for(let i=0; i<7; i++){
      const cell = document.createElement('button');
      cell.className = 'ws-day';
      cell.innerHTML = `<span class="ws-dow"></span><span class="ws-num"></span>`;
      cell.addEventListener('click', () => {
        currentDate = new Date(weekStripCellDates[i]);
        renderDay();
      });
      stripEl.appendChild(cell);
    }
  }

  const today = new Date();
  const cells = stripEl.children;
  for(let i=0; i<7; i++){
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    weekStripCellDates[i] = d;
    const isSelected = isSameDay(d, currentDate);
    const isToday = isSameDay(d, today);
    const cell = cells[i];
    cell.className = 'ws-day' + (isSelected ? ' selected' : '') + (isToday ? ' is-today' : '');
    cell.querySelector('.ws-dow').textContent = t('dow')[d.getDay()];
    cell.querySelector('.ws-num').textContent = d.getDate();
  }
}
document.getElementById('prevWeekNav').addEventListener('click', ()=>{
  stripAnchor = new Date(stripAnchor.getTime() - 7*86400000);
  renderDateBar();
});
document.getElementById('nextWeekNav').addEventListener('click', ()=>{
  stripAnchor = new Date(stripAnchor.getTime() + 7*86400000);
  renderDateBar();
});

// Main day-view render: loads the day's entries, updates the macro stat tiles/rings
// and rebuilds each category's meal list. Called on load, day navigation, add,
// edit and delete.
//
// renderDateBar() (which paints the header highlight) always runs synchronously
// first, so it's never stale — but the rest of this function awaits loadEntries(),
// and a second call can start (e.g. tapping another day quickly) before the first
// one's await resolves. Without a guard, the first call's now-outdated result
// would land last and repaint the stats/meal list for the wrong day right after
// the header had already moved on. renderToken makes a stale call bail out instead.
let renderToken = 0;
async function renderDay(){
  const myToken = ++renderToken;
  stripAnchor = new Date(currentDate);
  renderDateBar();

  const entries = await loadEntries(currentDate);
  if(myToken !== renderToken) return; // a newer renderDay() has since taken over
  currentEntries = entries;
  const totals = sumEntries(currentEntries);

  // Each stat tile shows "current/target" as its main number, and its rounded-rect
  // outline (the SVG ring-fill path) fills clockwise from 0-100% via stroke-dashoffset
  // — pathLength="100" on the path means dashoffset can be set directly as a percentage.
  setStatTile('statKcal', 'statKcalSub', 'ringKcal', totals.kcal, TARGETS.kcal);
  setStatTile('statProtein', 'statProteinSub', 'ringProtein', totals.protein, TARGETS.protein);
  setStatTile('statCarbs', 'statCarbsSub', 'ringCarbs', totals.carbs, TARGETS.carbs);
  setStatTile('statFat', 'statFatSub', 'ringFat', totals.fat, TARGETS.fat);

  // Group entries by category, keeping each entry's original index into
  // currentEntries — edit/delete always operate on that flat array by index.
  const grouped = { breakfast: [], lunch: [], dinner: [], snacks: [] };
  currentEntries.forEach((e, idx) => grouped[categoryOf(e)].push({ ...e, idx }));

  Object.keys(MEAL_CATEGORIES).forEach((cat) => renderMealGroup(cat, grouped[cat]));

  // Keeps the 3 preview cards (defined in week-month.js / weight.js) fresh
  // every time the day view renders — not awaited, each just fills in its
  // own stats line whenever it's done
  renderWeekPreview();
  renderMonthPreview();
  renderWeightPreview();
}

// Renders one category's meal list, its kcal subtotal badge, and its header's
// circular progress ring (logged kcal vs. that meal's rough share of the day's target)
function renderMealGroup(category, entries){
  const suffix = MEAL_CATEGORIES[category];
  const kcalTotal = entries.reduce((s, e) => s + (Number(e.kcal) || 0), 0);
  const mealTarget = TARGETS.kcal * MEAL_KCAL_SHARE[category];
  document.getElementById('catKcal' + suffix).textContent =
    `${Math.round(kcalTotal)}/${Math.round(mealTarget)} kcal`;

  const ring = document.getElementById('catRing' + suffix);
  ring.style.strokeDasharray = CAT_RING_CIRCUMFERENCE;
  ring.style.strokeDashoffset = CAT_RING_CIRCUMFERENCE * (1 - pct(kcalTotal, mealTarget) / 100);

  const listEl = document.getElementById('mealList' + suffix);
  listEl.innerHTML = '';
  entries.forEach((e) => {
    const row = document.createElement('div');
    row.className = 'meal';
    row.innerHTML = `
      <div>
        <div class="name">${escapeHtml(e.name || t('meal'))}</div>
        <div class="macros">P ${fmtMacro(e.protein)}g · C ${fmtMacro(e.carbs)}g · F ${fmtMacro(e.fat)}g</div>
      </div>
      <div class="meal-right">
        <span class="kcalval">${Math.round(e.kcal)||0}</span>
        <button class="edit-btn" data-idx="${e.idx}" title="${t('editTooltip')}">✎</button>
        <button class="del-btn" data-idx="${e.idx}" title="${t('deleteTooltip')}">✕</button>
      </div>
    `;
    listEl.appendChild(row);
  });
  listEl.querySelectorAll('.edit-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      openEditModal(Number(btn.getAttribute('data-idx')));
    });
  });
  listEl.querySelectorAll('.del-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      openDeleteModal(Number(btn.getAttribute('data-idx')));
    });
  });
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

// An entry added via Suche/Barcode carries its product's per-100g values and
// the amount used — that's what lets its amount be viewed/changed later,
// instead of only raw macro numbers like a Schnelleingabe entry has.
function isProductEntry(entry){
  return !!(entry && entry.per100 && entry.grams != null);
}

// Open the edit popup for the meal at this index, pre-filled with its current
// values. Shows the grams field (product entries) or the raw macro fields
// (everything else) depending on how the entry was originally added.
function openEditModal(idx){
  pendingEditIdx = idx;
  const entry = currentEntries[idx];
  if(!entry) return;
  document.getElementById('eCategory').value = categoryOf(entry);
  document.getElementById('eName').value = entry.name || '';

  const isProduct = isProductEntry(entry);
  document.getElementById('editManualFields').classList.toggle('hidden', isProduct);
  document.getElementById('editGramsFields').classList.toggle('hidden', !isProduct);

  if(isProduct){
    document.getElementById('eGrams').value = entry.grams;
    updateEditGramsPreview();
  } else {
    document.getElementById('eKcal').value = entry.kcal || '';
    document.getElementById('eProtein').value = entry.protein || '';
    document.getElementById('eCarbs').value = entry.carbs || '';
    document.getElementById('eFat').value = entry.fat || '';
  }
  document.getElementById('editModal').classList.remove('hidden');
}

// Live macro preview while adjusting a product entry's amount in the edit modal
function updateEditGramsPreview(){
  const entry = currentEntries[pendingEditIdx];
  if(!isProductEntry(entry)) return;
  const grams = Number(document.getElementById('eGrams').value) || 0;
  const m = scaleFromPer100(entry.per100, grams);
  document.getElementById('eGramsPreview').textContent =
    `${m.kcal} kcal · ${fmtMacro(m.protein)}g P · ${fmtMacro(m.carbs)}g C · ${fmtMacro(m.fat)}g F`;
}
document.getElementById('eGrams').addEventListener('input', updateEditGramsPreview);

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
  const category = document.getElementById('eCategory').value;
  const name = document.getElementById('eName').value.trim();
  if(!name) return;

  const entry = currentEntries[pendingEditIdx];
  if(isProductEntry(entry)){
    const grams = Number(document.getElementById('eGrams').value) || 0;
    if(!grams) return;
    currentEntries[pendingEditIdx] = {
      category, name, grams, per100: entry.per100, ...scaleFromPer100(entry.per100, grams)
    };
  } else {
    const kcal = document.getElementById('eKcal').value;
    if(!kcal) return;
    currentEntries[pendingEditIdx] = {
      category, name, kcal: Number(kcal)||0,
      protein: Number(document.getElementById('eProtein').value)||0,
      carbs: Number(document.getElementById('eCarbs').value)||0,
      fat: Number(document.getElementById('eFat').value)||0,
    };
  }
  await saveEntries(currentDate, currentEntries);
  closeEditModal();
  renderDay();
});
