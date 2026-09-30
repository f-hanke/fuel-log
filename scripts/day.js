// Day view: rendering the stat tiles + the meal list (grouped into breakfast/
// lunch/dinner/snacks) and the edit/delete confirmation popups. The add-food
// page itself (opened via the floating + button or a category header) lives
// in add.js.

let currentDate = new Date();
let currentEntries = [];

// Fills one stat tile's "current/target" text and its rounded-rect ring outline
function setStatTile(numId, ringId, value, target){
  document.getElementById(numId).textContent = `${Math.round(value)}/${target}`;
  document.getElementById(ringId).style.strokeDashoffset = 100 - pct(value, target);
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

// Header week strip: shows the whole Mon-Sun week currentDate falls in, highlights
// the selected day, and marks today separately (in case it isn't the selected day)
function renderDateBar(){
  document.getElementById('dateText').textContent = fmtLabel(currentDate);
  document.getElementById('todayTag').classList.toggle('hidden', !isSameDay(currentDate, new Date()));

  const dow = currentDate.getDay(); // 0=So, 1=Mo, ... 6=Sa
  const diffToMonday = (dow === 0 ? -6 : 1 - dow);
  const monday = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + diffToMonday);

  const stripEl = document.getElementById('weekStripDays');
  stripEl.innerHTML = '';
  const today = new Date();
  for(let i=0; i<7; i++){
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const isSelected = isSameDay(d, currentDate);
    const isToday = isSameDay(d, today);
    const cell = document.createElement('button');
    cell.className = 'ws-day' + (isSelected ? ' selected' : '') + (isToday ? ' is-today' : '');
    cell.innerHTML = `<span class="ws-dow">${t('dow')[d.getDay()]}</span><span class="ws-num">${d.getDate()}</span>`;
    cell.addEventListener('click', () => {
      currentDate = new Date(d);
      renderDay();
    });
    stripEl.appendChild(cell);
  }
}
document.getElementById('prevWeekNav').addEventListener('click', ()=>{
  currentDate = new Date(currentDate.getTime() - 7*86400000);
  renderDay();
});
document.getElementById('nextWeekNav').addEventListener('click', ()=>{
  currentDate = new Date(currentDate.getTime() + 7*86400000);
  renderDay();
});

// Main day-view render: loads the day's entries, updates the macro stat tiles/rings
// and rebuilds each category's meal list. Called on load, day navigation, add,
// edit and delete.
async function renderDay(){
  renderDateBar();

  currentEntries = await loadEntries(currentDate);
  const totals = sumEntries(currentEntries);

  // Each stat tile shows "current/target" as its main number, and its rounded-rect
  // outline (the SVG ring-fill path) fills clockwise from 0-100% via stroke-dashoffset
  // — pathLength="100" on the path means dashoffset can be set directly as a percentage.
  setStatTile('statKcal', 'ringKcal', totals.kcal, TARGETS.kcal);
  setStatTile('statProtein', 'ringProtein', totals.protein, TARGETS.protein);
  setStatTile('statCarbs', 'ringCarbs', totals.carbs, TARGETS.carbs);
  setStatTile('statFat', 'ringFat', totals.fat, TARGETS.fat);

  // Group entries by category, keeping each entry's original index into
  // currentEntries — edit/delete always operate on that flat array by index.
  const grouped = { breakfast: [], lunch: [], dinner: [], snacks: [] };
  currentEntries.forEach((e, idx) => grouped[categoryOf(e)].push({ ...e, idx }));

  Object.keys(MEAL_CATEGORIES).forEach((cat) => renderMealGroup(cat, grouped[cat]));
}

// Renders one category's meal list and its kcal subtotal badge
function renderMealGroup(category, entries){
  const suffix = MEAL_CATEGORIES[category];
  const kcalTotal = entries.reduce((s, e) => s + (Number(e.kcal) || 0), 0);
  document.getElementById('catKcal' + suffix).textContent = Math.round(kcalTotal) + ' kcal';

  const listEl = document.getElementById('mealList' + suffix);
  listEl.innerHTML = '';
  entries.forEach((e) => {
    const row = document.createElement('div');
    row.className = 'meal';
    row.innerHTML = `
      <div>
        <div class="name">${escapeHtml(e.name || t('meal'))}</div>
        <div class="macros">P ${Math.round(e.protein)||0}g · C ${Math.round(e.carbs)||0}g · F ${Math.round(e.fat)||0}g</div>
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

// Open the edit popup for the meal at this index, pre-filled with its current values
function openEditModal(idx){
  pendingEditIdx = idx;
  const entry = currentEntries[idx];
  if(!entry) return;
  document.getElementById('eCategory').value = categoryOf(entry);
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
  const category = document.getElementById('eCategory').value;
  const name = document.getElementById('eName').value.trim();
  const kcal = document.getElementById('eKcal').value;
  const protein = document.getElementById('eProtein').value;
  const carbs = document.getElementById('eCarbs').value;
  const fat = document.getElementById('eFat').value;
  if(!name || !kcal){ return; }
  currentEntries[pendingEditIdx] = {
    category, name, kcal: Number(kcal)||0, protein: Number(protein)||0,
    carbs: Number(carbs)||0, fat: Number(fat)||0
  };
  await saveEntries(currentDate, currentEntries);
  closeEditModal();
  renderDay();
});
