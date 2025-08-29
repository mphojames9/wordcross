const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const format = num => String(num);

function toast(message, time = 2800){
  const tcont = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  tcont.appendChild(el);
  setTimeout(()=> el.style.opacity = '0', time - 300);
  setTimeout(()=> el.remove(), time);
}

/* ---------- Persistent State ---------- */
function save(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
function load(key, def){ const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }

/* ---------- App Logic ---------- */
const DEFAULTS = {
  coins: 0,
  achievements: { gamesPlayed:0, wins:0, highScore:0 },
  soundEnabled: true,
  lastReward: null
};

function ensureDefaults(){
  if(localStorage.getItem('coins') === null) save('coins', DEFAULTS.coins);
  if(localStorage.getItem('achievements') === null) save('achievements', DEFAULTS.achievements);
  if(localStorage.getItem('soundEnabled') === null) save('soundEnabled', DEFAULTS.soundEnabled);
  if(localStorage.getItem('lastReward') === null) save('lastReward', DEFAULTS.lastReward);
}

/* Animated counter - smooth increment */
function animateCounter(el, from, to, duration = 600){
  from = Number(from);
  to = Number(to);
  if(isNaN(from) || isNaN(to)){ el.textContent = to; return; }
  const start = performance.now();
  function step(now){
    const t = Math.min(1, (now - start)/duration);
    const eased = t<.5 ? 2*t*t : -1 + (4 - 2*t)*t; // approximate easeInOutQuad
    const val = Math.round(from + (to - from) * eased);
    el.textContent = format(val);
    if(t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* Global UI update */
function updateUI(){
  const coins = load('coins',0);
  const coinDisplay = $('#coinDisplay');
  animateCounter(coinDisplay, Number(coinDisplay.textContent || 0), coins);
  // update achievements/highscore displays
  const ach = load('achievements', DEFAULTS.achievements);
  $('#highScore').textContent = 'High score: ' + (ach.highScore || 0);
  // reward status text
  const last = load('lastReward', null);
  const today = new Date().toDateString();
  $('#dailyStatus').textContent = (last === today) ? 'Daily reward: already claimed' : 'Daily reward: available';
}

/* Add / set coins */
function getCoins(){ return load('coins',0); }
function setCoins(n){ save('coins', Math.max(0, Math.floor(n))); updateUI(); }
function addCoins(n){ setCoins(getCoins() + Number(n)); animateCoinPulse(); }

/* visual pulse when coins added */
function animateCoinPulse(){
  const el = $('#coinDisplay');
  el.animate([{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}], {duration:420, easing:'ease-out'});
}

/* claim daily reward */
function canClaimReward(){
  const last = load('lastReward', null);
  return last !== new Date().toDateString();
}
function claimReward(){
  if(!canClaimReward()){
    toast('Daily reward already claimed today.');
    return;
  }
  save('lastReward', new Date().toDateString());
  addCoins(50);
  toast('✅ You claimed 50 coins!');
  updateUI();
}

/* achievements */
function getAchievements(){ return load('achievements', DEFAULTS.achievements); }
function saveAchievements(obj){ const current = getAchievements(); save('achievements', {...current, ...obj}); }

/* Modal utility */
function openModal(id){
  const m = document.getElementById(id);
  if(!m) return;
  m.classList.add('open');
  m.setAttribute('aria-hidden', 'false');

}
function closeModal(id){
  const m = document.getElementById(id);
  if(!m) return;
  m.classList.remove('open');
  m.setAttribute('aria-hidden', 'true');
}

/* close all modals */
function closeAllModals(){
  $$('.modalHome.open').forEach(m => closeModal(m.id));
}

/* ESC to close modals */
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape') closeAllModals();
});

/* click backdrop to close */
$$('.modalHome').forEach(mod => {
  mod.addEventListener('click', (ev) => {
    if(ev.target === mod) closeModal(mod.id);
  });
});

/* ---------- Shop & Ad logic ---------- */
const SHOP_PACKAGES = [
  { id:'p1', coins:100, priceLabel:'$0.99' },
  { id:'p2', coins:550, priceLabel:'$4.99' },
  { id:'p3', coins:1200, priceLabel:'$9.99' },
];

function renderShop(){
  const grid = $('#shopGrid');
  grid.innerHTML = '';
  SHOP_PACKAGES.forEach(p => {
    const card = document.createElement('div');
    card.className = 'pkg';
    card.innerHTML = `
      <div class="amount">${p.coins} 🪙</div>
      <div class="price">${p.priceLabel}</div>
      <div style="margin-top:8px">
        <button class="btn" data-buy="${p.id}">Buy</button>
      </div>`;
    grid.appendChild(card);
  });

  // buy handlers btnWatchAd"
  grid.querySelectorAll('[data-buy]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pkg = SHOP_PACKAGES.find(x => x.id === e.target.getAttribute('data-buy'));
      if(!pkg) return;
      // Mock purchase confirmation
      const confirmed = confirm(`Mock purchase: ${pkg.coins} coins for ${pkg.priceLabel}? (demo)`);
      if(confirmed){
        addCoins(pkg.coins);
        toast(`Thanks! Added ${pkg.coins} coins.`);
        closeModal('modalShop');
      } else {
        toast('Purchase canceled.');
      }
    });
  });
}

/* Simulated rewarded ad */
let adTimerHandle = null;
function startAdSimulation(durationSec = 5, reward = 25){
  // open ad modal
  openModal('modalAd');
  const progress = $('#adProgress');
  const adTimer = $('#adTimer');
  let elapsed = 0;
  progress.style.width = '0%';
  adTimer.textContent = durationSec.toString();

  adTimerHandle && clearInterval(adTimerHandle);
  adTimerHandle = setInterval(()=>{
    elapsed++;
    const pct = Math.min(100, (elapsed / durationSec) * 100);
    progress.style.width = pct + '%';
    const left = Math.max(0, durationSec - elapsed);
    adTimer.textContent = String(left);
    if(elapsed >= durationSec){
      clearInterval(adTimerHandle);
      // award reward
      addCoins(reward);
      toast(`🎉 Rewarded ad complete — +${reward} coins`);
      closeModal('modalAd');
    }
  }, 1000);
}

/* ---------- initiate & Event wiring ---------- */
function initiate(){
  ensureDefaults();
  updateUI();

  // render shop
  renderShop();

  // UI element references
  $('#start').addEventListener('click', () => {
    const ach = getAchievements();
    saveAchievements({ gamesPlayed: (ach.gamesPlayed||0) + 1 });
    addCoins(10);
  });

  // Achievements modal
  $('#btnAchievements').addEventListener('click', () => {
    const a = getAchievements();
    $('#achievementsList').innerHTML = `
      <div style="margin-bottom:8px">🎮 Games Played: <strong>${a.gamesPlayed}</strong></div>
      <div style="margin-bottom:8px">🏆 Wins: <strong>${a.wins}</strong></div>
      <div style="margin-bottom:8px">⭐ High Score: <strong>${a.highScore}</strong></div>
      <div style="margin-top:6px" class="muted">Coins: ${getCoins()}</div>
    `;
    openModal('modalAchievements');
  });

  // sound modal
  $('#btnSound').addEventListener('click', () => {
    $('#soundToggle').checked = !!load('soundEnabled', true);
    openModal('modalSound');
  });
  $('#soundToggle').addEventListener('change', (e) => {
    save('soundEnabled', !!e.target.checked);
    toast(`Sound ${e.target.checked ? 'enabled' : 'disabled'}`);
  });



  // rewards
  $('#btnRewards').addEventListener('click', () => {
    const claimBtn = $('#claimReward');
    claimBtn.disabled = !canClaimReward();
    $('#rewardStatus').textContent = canClaimReward() ? '🎁 Reward available' : '✅ Already claimed today';
    openModal('modalRewards');
  });
  $('#claimReward').addEventListener('click', () => {
    if(!canClaimReward()){ toast('Already claimed today.'); return; }
    claimReward();
    $('#claimReward').disabled = true;
    $('#rewardStatus').textContent = '✅ Already claimed today';
  });

  // shop open
  $('#settings').addEventListener('click', () => openModal('menu-settings-section-wrapper'));
  $('#btnShop').addEventListener('click', () => openModal('modalShop'));
  $('#btnShopIcon').addEventListener('click', () => openModal('modalShop'));
  $('#btnShopIcon').addEventListener('click', () => openModal('modalShop'));
  $('#btnLeaderboard').addEventListener('click', () => openModal('modalLeaderboard'));
  $('#btnHelp').addEventListener('click', ()=> openModal('modalHelp'));

  // challenge button
  $('#btnChallenge').addEventListener('click', () => {
    openModal('modalAchievements'); // For demo, reuse achievements
  });

  // watch ad
  $('#btnWatchAd').addEventListener('click', () => {
    // start simulated ad (5 sec reward)
    startAdSimulation(5, 25);
  });

  // ad skip
  $('#skipAd').addEventListener('click', () => {
    clearInterval(adTimerHandle);
    closeModal('modalAd');
    toast('Ad skipped — no reward');
  });

  // shop close & other modal close
  $$('[data-close]').forEach(btn => btn.addEventListener('click', (e)=> {
    const modal = e.target.closest('.modalHome');
    if(modal) closeModal(modal.id);
  }));

  // close modal on Escape is wired globally

  // update UI interval to keep time-based displays current (e.g., daily status)
  setInterval(updateUI, 1000*30);

  // accessibility: focus main container when load
  $('#main').focus();
}

/* prepare defaults, then initiate */
initiate();
