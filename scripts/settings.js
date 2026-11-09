// Settings modal: language/theme switches, editable daily targets, the
// BMR-based target calculator, and export/import (moving to a new device,
// or just a manual backup — the app has no account/cloud sync of its own,
// everything lives in this browser's localStorage only).

document.getElementById('langDeBtn').addEventListener('click', () => setLang('de'));
document.getElementById('langEnBtn').addEventListener('click', () => setLang('en'));
document.getElementById('themeDarkBtn').addEventListener('click', () => setTheme('dark'));
document.getElementById('themeLightBtn').addEventListener('click', () => setTheme('light'));

// Remember the calculator's last inputs so the user doesn't have to retype them
function loadCalcInputs(){
  try{
    const raw = localStorage.getItem('fuellog:calcInputs');
    return raw ? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}
function saveCalcInputs(inputs){
  try{ localStorage.setItem('fuellog:calcInputs', JSON.stringify(inputs)); }catch(e){}
}

// Open Settings: pre-fill language, theme, current targets, and the last-used calculator inputs
function openSettingsModal(){
  document.getElementById('langDeBtn').classList.toggle('active', lang === 'de');
  document.getElementById('langEnBtn').classList.toggle('active', lang === 'en');
  document.getElementById('themeDarkBtn').classList.toggle('active', theme === 'dark');
  document.getElementById('themeLightBtn').classList.toggle('active', theme === 'light');

  document.getElementById('tgKcal').value = TARGETS.kcal;
  document.getElementById('tgProtein').value = TARGETS.protein;
  document.getElementById('tgCarbs').value = TARGETS.carbs;
  document.getElementById('tgFat').value = TARGETS.fat;

  const calc = loadCalcInputs();
  document.getElementById('calcWeight').value = calc.weight || '';
  document.getElementById('calcHeight').value = calc.height || '';
  document.getElementById('calcAge').value = calc.age || '';
  document.getElementById('calcGender').value = calc.gender || 'm';
  document.getElementById('calcActivity').value = calc.activity || '1.55';

  document.getElementById('settingsModal').classList.remove('hidden');
}
function closeSettingsModal(){
  document.getElementById('settingsModal').classList.add('hidden');
}
document.getElementById('settingsToggle').addEventListener('click', openSettingsModal);
document.getElementById('settingsCloseBtn').addEventListener('click', closeSettingsModal);
document.getElementById('settingsModal').addEventListener('click', (e)=>{
  if(e.target.id === 'settingsModal') closeSettingsModal();
});

document.getElementById('settingsSaveBtn').addEventListener('click', async ()=>{
  const kcal = Number(document.getElementById('tgKcal').value) || TARGETS.kcal;
  const protein = Number(document.getElementById('tgProtein').value) || TARGETS.protein;
  const carbs = Number(document.getElementById('tgCarbs').value) || TARGETS.carbs;
  const fat = Number(document.getElementById('tgFat').value) || TARGETS.fat;
  saveTargets({ kcal, protein, carbs, fat });
  closeSettingsModal();
  await refreshCurrentView();
});

// Estimate daily targets from body stats: Mifflin-St Jeor BMR x activity factor
// for kcal, ~1.8g protein/kg bodyweight, 25% of kcal from fat, rest from carbs.
// Fills the target fields above (still requires "Speichern" to actually apply them).
document.getElementById('calcApplyBtn').addEventListener('click', ()=>{
  const weight = Number(document.getElementById('calcWeight').value);
  const height = Number(document.getElementById('calcHeight').value);
  const age = Number(document.getElementById('calcAge').value);
  const gender = document.getElementById('calcGender').value;
  const activity = Number(document.getElementById('calcActivity').value);
  if(!weight || !height || !age) return;

  saveCalcInputs({ weight, height, age, gender, activity });

  const bmr = 10*weight + 6.25*height - 5*age + (gender === 'm' ? 5 : -161);
  const tdee = bmr * activity;

  const proteinG = Math.round(weight * 1.8);
  const fatG = Math.round((tdee * 0.25) / 9);
  const carbsG = Math.max(0, Math.round((tdee - proteinG*4 - fatG*9) / 4));

  document.getElementById('tgKcal').value = Math.round(tdee);
  document.getElementById('tgProtein').value = proteinG;
  document.getElementById('tgCarbs').value = carbsG;
  document.getElementById('tgFat').value = fatG;
});

// --- Export/import: the only way data gets from one device to another ---
// Every value is kept as its raw localStorage string (not re-parsed/re-
// serialized) so a round-trip is always byte-identical to the original,
// regardless of what shape any individual key's JSON happens to be.
function collectBackupData(){
  const data = {};
  for(let i = 0; i < localStorage.length; i++){
    const key = localStorage.key(i);
    if(key && key.startsWith('fuellog:')) data[key] = localStorage.getItem(key);
  }
  return data;
}
function setDataStatus(text){
  const el = document.getElementById('dataStatus');
  el.textContent = text;
  el.classList.toggle('hidden', !text);
}

document.getElementById('exportDataBtn').addEventListener('click', async () => {
  const payload = { app: 'fuellog', version: 1, exportedAt: new Date().toISOString(), data: collectBackupData() };
  const filename = `fuellog-backup-${fmtKey(new Date())}.json`;
  const file = new File([JSON.stringify(payload, null, 2)], filename, { type: 'application/json' });

  // The share sheet is what actually matches "send it to my other phone" —
  // AirDrop/Mail/iCloud Drive/Messages all show up in it directly. Falls
  // back to a plain download (e.g. on desktop browsers, or if sharing files
  // isn't supported) rather than failing outright.
  if(navigator.canShare && navigator.canShare({ files: [file] })){
    try{
      await navigator.share({ files: [file], title: filename });
      setDataStatus(t('exportDone'));
      return;
    }catch(e){
      if(e.name === 'AbortError'){ setDataStatus(''); return; } // user cancelled the share sheet
      // anything else (e.g. share not actually wired up despite canShare==true): fall through
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setDataStatus(t('exportDone'));
});

let pendingImportPayload = null;

document.getElementById('importDataBtn').addEventListener('click', () => {
  document.getElementById('importFileInput').click();
});
document.getElementById('importFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = ''; // so picking the exact same file again still fires 'change'
  if(!file) return;
  try{
    const payload = JSON.parse(await file.text());
    if(payload.app !== 'fuellog' || !payload.data || typeof payload.data !== 'object'){
      setDataStatus(t('importInvalid'));
      return;
    }
    pendingImportPayload = payload;
    showImportConfirm(payload);
  }catch(e){
    setDataStatus(t('importInvalid'));
  }
});

// Shows what's in the file and asks before touching anything — importing
// replaces this device's data wholesale (see importConfirmBtn below), so
// this is the one place that's worth a confirmation step for
function showImportConfirm(payload){
  setDataStatus('');
  const keys = Object.keys(payload.data);
  const days = keys.filter((k) => k.startsWith('fuellog:entries:')).length;
  let weightCount = 0;
  try{ weightCount = JSON.parse(payload.data['fuellog:weights'] || '[]').length; }catch(e){}
  const dateText = payload.exportedAt ? fmtLabel(new Date(payload.exportedAt)) : '';

  document.getElementById('importConfirmText').textContent =
    `${t('importConfirmPrefix')} ${dateText} · ${days} ${t('importDaysWord')}, ${weightCount} ${t('importWeightsWord')}. ${t('importOverwriteWarn')}`;
  document.getElementById('importConfirmBox').classList.remove('hidden');
}
document.getElementById('importCancelBtn').addEventListener('click', () => {
  pendingImportPayload = null;
  document.getElementById('importConfirmBox').classList.add('hidden');
});
document.getElementById('importConfirmBtn').addEventListener('click', () => {
  if(!pendingImportPayload) return;
  // Clear every existing fuellog: key first, then write the backup's own —
  // so the result exactly matches the file, instead of merging in a way
  // that could leave old data (e.g. a day not present in the backup) mixed
  // in with the restored data
  for(let i = localStorage.length - 1; i >= 0; i--){
    const key = localStorage.key(i);
    if(key && key.startsWith('fuellog:')) localStorage.removeItem(key);
  }
  Object.entries(pendingImportPayload.data).forEach(([key, value]) => localStorage.setItem(key, value));
  pendingImportPayload = null;
  document.getElementById('importConfirmBox').classList.add('hidden');
  setDataStatus(t('importDone'));
  // A full reload is simplest and safest here: language, theme, targets,
  // the day currently on screen, weight history, recently-used products —
  // every module already initializes correctly from localStorage on load,
  // so this picks up the restored data everywhere at once instead of having
  // to individually re-run each module's own render function by hand
  setTimeout(() => location.reload(), 400);
});
