// Settings modal: language/theme switches, editable daily targets, and the
// BMR-based target calculator.

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
