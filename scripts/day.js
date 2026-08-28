// Day view: rendering the stat tiles + meal list, the add-meal form, and the
// edit/delete confirmation popups for individual meal entries.

let currentDate = new Date();
let currentEntries = [];

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
