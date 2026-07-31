// === 账户+密码保护 ===

// 立即移除部署平台注入的水印浮窗
function removeWatermark() {
  const selectors = [
    '#minimax-floating-ball',
    '[id*="minimax"]',
    '[class*="minimax"]',
    'div[style*="Created by"]',
  ];
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach(el => el.remove());
  }
  // 包含 MiniMax Agent 文字的所有元素
  document.querySelectorAll('div, span, a').forEach(el => {
    if (el.children.length === 0 && /MiniMax Agent|豆包 AI/.test(el.textContent)) {
      el.closest('div, span')?.remove();
    }
  });
}
removeWatermark();
document.addEventListener('DOMContentLoaded', removeWatermark);
setTimeout(removeWatermark, 50);
setTimeout(removeWatermark, 200);
setTimeout(removeWatermark, 1000);
// 持续监控, 有新元素就制除
const _watermarkObserver = new MutationObserver(removeWatermark);
if (document.body) {
  _watermarkObserver.observe(document.body, { childList: true, subtree: true });
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
// 预设账户 (代码内嵌, 不可注册新账户)
// 值为 sha256('账户名:密码') 的哈希, 密码是 5862314
const PRESET_ACCOUNTS = {
  'iRainbaby': 'dccaacd65913dddd0bdca14a39d9949591dc5c157317bcd72bf870c0983dddff',
};
console.log('[FUND/OS v9] 已加载 - 预设账户:', Object.keys(PRESET_ACCOUNTS));
function getAccounts() {
  // 合并预设账户 + 本地已存账户, 预设账户优先且只读
  try {
    const stored = JSON.parse(localStorage.getItem('accounts') || '{}');
    const cleaned = {};
    for (const k in stored) {
      if (!PRESET_ACCOUNTS.hasOwnProperty(k)) cleaned[k] = stored[k];
    }
    return Object.assign({}, cleaned, PRESET_ACCOUNTS);
  } catch { return Object.assign({}, PRESET_ACCOUNTS); }
}
function saveAccounts(acc) {
  // 只保存非预设账户到 localStorage (此处其实不会有)
  const toSave = {};
  for (const k in acc) {
    if (!PRESET_ACCOUNTS.hasOwnProperty(k)) toSave[k] = acc[k];
  }
  localStorage.setItem('accounts', JSON.stringify(toSave));
}
async function checkAccess() {
  // 完全免登录, 直接返回 true
  try {
    sessionStorage.setItem('pwOk', '1');
    sessionStorage.setItem('pwName', 'iRainbaby');
  } catch(e) {}
  return true;
}
function showLoginOverlay(resolve) {
  const accounts = getAccounts();
  const lastName = localStorage.getItem('lastUser') || '';
  // 只显示背景图, 2 秒后自动进入
  document.body.innerHTML = `
    <div id="pwBg" style="position:fixed;inset:0;background:#000;z-index:99999;display:block;overflow:hidden">
      <div id="pwImg" style="position:absolute;inset:0;background:url('bg/bg.jpg') center/cover no-repeat;background-attachment:fixed"></div>
    </div>`;
  // 阻止背景滚动
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.width = '100%';
  document.body.style.height = '100%';

  // 2 秒后自动登录进入 - 鸿蒙专用, 完全不依赖任何事件
  setTimeout(() => {
    const name = 'iRainbaby';
    try {
      sessionStorage.setItem('pwOk', '1');
      sessionStorage.setItem('pwName', name);
      localStorage.setItem('lastUser', name);
    } catch(e) {}
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    const bg = document.getElementById('pwBg');
    if (bg) bg.remove();
    resolve(true);
  }, 2000);
  // 全局兑底函数 - 鸿蒙浏览器对 addEventListener 支持不全
  window.tryLoginBtn = function() { tryLogin(); };
  // 尽量同步赋值
  if (typeof tryLogin !== 'undefined') {
    window.__tryLogin = tryLogin;
  }

  const tryLogin = async () => {
    // 立即进入, 不验证
    const name = 'iRainbaby';
    try {
      sessionStorage.setItem('pwOk', '1');
      sessionStorage.setItem('pwName', name);
      localStorage.setItem('lastUser', name);
    } catch(e) {}
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    const bg = document.getElementById('pwBg');
    if (bg) bg.remove();
    resolve(true);
  };
  // 鸿蒙兑底: 全局函数 + 内联 onclick + 多重事件
  window.tryLoginBtn = function() { tryLogin(); };
  const form = document.getElementById('pwForm');
  if (form) {
    form.addEventListener('submit', (e) => { e.preventDefault(); tryLogin(); });
  }
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); tryLogin(); });
  btn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); tryLogin(); });
  // 鸿蒙 keydown 不可靠, 但试试 (私密键盘通常不触发, 仍保留)
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tryLogin(); } });
  inp.addEventListener('change', () => { /* ensure sync */ });

}
async function setPassword() {
  const oldPw = prompt('当前密码:');
  if (!oldPw) return;
  const oldH = await sha256(oldPw);
  const stored = localStorage.getItem('pwHash') || DEFAULT_PW_HASH;
  if (oldH !== stored) { alert('当前密码错误'); return; }
  const newPw = prompt('新密码 (至少 4 位):');
  if (!newPw || newPw.length < 4) { alert('密码太短'); return; }
  const newPw2 = prompt('再输入一次:');
  if (newPw !== newPw2) { alert('两次输入不一致'); return; }
  localStorage.setItem('pwHash', await sha256(newPw));
  alert('✓ 密码已修改');
}
window.setPassword = setPassword;

let state;
try {
  const s = localStorage.getItem('funds');
  state = s ? JSON.parse(s) : JSON.parse(JSON.stringify(FUNDS_INIT));
  // 密码保护
  checkAccess().then(ok => {
    if (ok) { 
      render(); 
      startAutoRefresh();
    }
  });
} catch(e) {
  document.getElementById('funds').innerHTML = '<pre style="color:red;padding:20px">STATE INIT ERROR: ' + e.message + ' | FUNDS_INIT: ' + (typeof FUNDS_INIT) + '</pre>';
  throw e;
}

async function fetchNAV(code) {
  const url = `https://qt.gtimg.cn/q=jj${code}`;
  const proxies = [
    '',
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
  ];
  for (const proxy of proxies) {
    try {
      const target = proxy ? proxy + encodeURIComponent(url) : url;
      const resp = await fetch(target);
      const text = await resp.text();
      const m = text.match(/"([^~]+)~([^~]+)~[^~]+~[^~]+~~([^~]+)~([^~]+)~([^~]+)~([^~]+)~"/);
      if (m) return { nav: parseFloat(m.group(3)), date: m.group(6) };
    } catch (e) {}
  }
  return null;
}

async function refreshAll() {
  const btn = document.getElementById('refreshBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  let cache = {};
  try { cache = await fetch('nav_cache.json').then(r => r.ok ? r.json() : {}); } catch(e){}
  for (const f of state) {
    // 用户手动改过现价 → 跳过 API 覆盖
    if (f._manualPrice) continue;
    let r = null;
    try { r = await fetchNAV(f.code); } catch(e) {}
    if (r && r.nav) {
      f.price = r.nav;
      f.priceDate = r.date || new Date().toISOString().split('T')[0];
    } else if (cache[f.code]) {
      const c = cache[f.code];
      const last = Array.isArray(c) ? c[c.length-1] : c;
      if (last && last.nav) {
        f.price = last.nav;
        f.priceDate = last.date || last.fetched;
      }
    }
  }
  if (btn) { btn.disabled = false; btn.textContent = '🔄'; }
  localStorage.setItem('funds', JSON.stringify(state));
  render();
}

function save(prevSnap) {
  // prevSnap 可选, 显式传入的"操作前"快照用于撤销
  try {
    if (prevSnap) {
      undoStack.push(prevSnap);
      if (undoStack.length > 30) undoStack.shift();
    }
    localStorage.setItem('funds', JSON.stringify(state));
    updateSaveBadge();
  } catch(e) { console.error('save err', e); }
}
let saveTimer = null;
function saveDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 50);  // 50ms 批量保存
}
function updateSaveBadge() {
  const el = document.getElementById('saveStatus');
  if (!el) return;
  const ts = new Date().toLocaleTimeString('zh-CN', {hour12: false});
  el.textContent = '已存 ' + ts;
  el.classList.add('saved');
  setTimeout(() => el.classList.remove('saved'), 800);
}

const main = document.getElementById('funds');

function buildTierTable(f) {
  const { target, initShares, multi, tiers, basePrice, priceLow, priceMid, priceHigh } = f;
  const initInvest = (initShares || 0) * basePrice;
  const remaining = target - initInvest;
  const m1 = remaining * (1 - multi) / (1 - Math.pow(multi, tiers));
  let buyStart = 0;
  if (priceMid && priceMid > basePrice) {
    buyStart = Math.ceil((priceMid - basePrice) / basePrice / f.step);
  }
  const buyEnd = buyStart - (tiers - 1);
  const rows = [];
  for (let t = 10; t >= -10; t--) {
    let amt, label, trigger, isMid = false, isLow = false, isHigh = false, isBuy = false;
    if (t === 0) {
      amt = initInvest;
      label = '基准';
      trigger = basePrice;
    } else {
      trigger = basePrice * (1 + t * f.step);
      label = `${t > 0 ? '+' : ''}${t}档`;
      const r = buyStart - t + 1;
      if (r >= 1 && r <= tiers) {
        amt = m1 * Math.pow(multi, r - 1);
        isBuy = true;
      } else {
        amt = null;
      }
    }
    if (priceLow && Math.abs(trigger - priceLow) <= 0.01) isLow = true;
    if (priceMid && Math.abs(trigger - priceMid) <= 0.01) isMid = true;
    if (priceHigh && Math.abs(trigger - priceHigh) <= 0.01) isHigh = true;
    rows.push({ tier: t, label, amt, trigger, isMid, isLow, isHigh, isBuy, buyStart, buyEnd });
  }
  return rows;
}

function calcTier(f) {
  const { price, basePrice, step } = f;
  if (!price) return { tier: 0, currentAmt: 0, dropPct: 0 };
  const raw = (price - basePrice) / basePrice / step;
  const rawFloor = Math.floor(raw);
  const rawCeil = Math.ceil(raw);
  const rawRound = Math.round(raw);
  const trigDown = basePrice * (1 + rawFloor * step);
  const trigUp = basePrice * (1 + rawCeil * step);
  let tier;
  if (Math.abs(price - trigDown) <= 0.01) tier = rawFloor;
  else if (Math.abs(price - trigUp) <= 0.01) tier = rawCeil;
  else tier = rawRound;
  return { tier, dropPct: (price - basePrice) / basePrice };
}

function calcCurrent(f) {
  const rows = buildTierTable(f);
  const { tier, dropPct } = calcTier(f);
  const buyRows = rows.filter(r => r.isBuy);
  if (buyRows.length === 0) {
    return { tier, dropPct, currentAmt: null, currentTrigger: null, currentTier: null, neighbors: [] };
  }
  const triggered = buyRows.filter(r => f.price <= r.trigger);
  const current = triggered.length > 0
    ? triggered.reduce((min, r) => r.tier < min.tier ? r : min)
    : null;
  if (!current) {
    const nearest = buyRows.reduce((min, r) =>
      Math.abs(f.price - r.trigger) < Math.abs(f.price - min.trigger) ? r : min);
    const idx = buyRows.findIndex(r => r.tier === nearest.tier);
    const start = Math.max(0, idx - 1);
    const end = Math.min(buyRows.length, idx + 2);
    return {
      tier, dropPct,
      currentAmt: nearest.amt,
      currentTrigger: nearest.trigger,
      currentTier: nearest.tier,
      currentIsBuy: false,
      neighbors: buyRows.slice(start, end),
    };
  }
  const idx = buyRows.findIndex(r => r.tier === current.tier);
  const start = Math.max(0, idx - 1);
  const end = Math.min(buyRows.length, idx + 2);
  return {
    tier, dropPct,
    currentAmt: current.amt,
    currentTrigger: current.trigger,
    currentTier: current.tier,
    currentIsBuy: true,
    neighbors: buyRows.slice(start, end),
  };
}

let startY = 0, pulling = false;
function setupPullToRefresh() {
  document.addEventListener('touchstart', e => {
    if (window.scrollY === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, {passive: true});
  document.addEventListener('touchmove', e => {
    if (pulling && window.scrollY === 0) {
      const dy = e.touches[0].clientY - startY;
      if (dy > 80) {
        showPullHint();
      }
    }
  }, {passive: true});
  document.addEventListener('touchend', e => {
    if (pulling) {
      const dy = (e.changedTouches[0].clientY - startY);
      if (dy > 80 && window.scrollY === 0) {
        triggerRefresh();
      }
      pulling = false;
      hidePullHint();
    }
  });
}
function showPullHint() {
  let h = document.getElementById('pullHint');
  if (!h) {
    h = document.createElement('div');
    h.id = 'pullHint';
    h.innerHTML = '↓ 松手刷新';
    document.body.appendChild(h);
  }
  h.classList.add('show');
}
function hidePullHint() {
  const h = document.getElementById('pullHint');
  if (h) h.classList.remove('show');
}
function triggerRefresh() {
  localStorage.setItem('funds', JSON.stringify(state));
  refreshAll();
  const btn = document.getElementById('refreshBtn');
  if (btn) {
    const old = btn.textContent;
    btn.textContent = '✓';
    setTimeout(() => btn.textContent = old, 800);
  }
}
document.addEventListener('DOMContentLoaded', setupPullToRefresh);
let activeTab = 0;

function render() {
  let html = '<div class="tab-bar">';
  // 汇总 tab 放最左
  html += '<button class="tab tab-summary ' + (activeTab===state.length?'active':'') + '" data-tab="' + state.length + '">📊 汇总</button>';
  // 状态间用间隔
  html += '<div style="width:8px;flex-shrink:0"></div>';
  state.forEach((f, i) => {
    html += `<button class="tab ${i===activeTab?'active':''}" data-tab="${i}">${f.name}</button>`;
  });
  // + 按钮放最右
  html += '<button class="tab-add" data-add="1" title="新增基金">+</button>';
  html += '</div>';
  html += '<div class="tab-content">';
  if (activeTab < state.length) html += renderFund(state[activeTab], activeTab);
  else html += renderSummary();
  html += '</div>';
  main.innerHTML = html;
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = parseInt(btn.dataset.tab);
      render();
    });
  });
  document.querySelector('.tab-add')?.addEventListener('click', addNewFund);
  // 汇总表品种名改名同步到 state
  document.querySelectorAll('.sname-input').forEach(inp => {
    inp.addEventListener('blur', () => {
      const fidx = parseInt(inp.dataset.fidx);
      const newName = inp.value.trim();
      if (newName && state[fidx] && state[fidx].name !== newName) {
        state[fidx].name = newName;
        localStorage.setItem('funds', JSON.stringify(state));
        render(); // 重新渲染同步 tab
      }
    });
    inp.addEventListener('focus', () => { inp.style.borderColor = 'var(--neon-cyan)'; });
    inp.addEventListener('blur', () => { inp.style.borderColor = 'transparent'; });
  });
  let pressTimer = null, pressProgress = null;
  function showHint(t) {
    let h = document.getElementById('tabHint');
    if (!h) {
      h = document.createElement('div');
      h.id = 'tabHint';
      h.className = 'tab-hint';
      document.body.appendChild(h);
    }
    h.textContent = t;
    h.classList.add('show');
  }
  function hideHint() {
    const h = document.getElementById('tabHint');
    if (h) h.classList.remove('show');
  }
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('touchstart', e => {
      btn.classList.add('pressing');
      let secs = 1.0;
      showHint('松开删除 · ' + secs.toFixed(1) + 's');
      pressProgress = setInterval(() => {
        secs -= 0.1;
        if (secs <= 0) { clearInterval(pressProgress); return; }
        showHint('松开删除 · ' + secs.toFixed(1) + 's');
      }, 100);
      pressTimer = setTimeout(() => {
        clearInterval(pressProgress);
        btn.classList.remove('pressing');
        hideHint();
        const idx = parseInt(btn.dataset.tab);
        if (!isNaN(idx) && state[idx]) {
          if (confirm('确定删除 ' + state[idx].name + '?\n所有买入记录将丢失')) deleteFund(idx);
        }
      }, 1000);
    }, {passive: true});
    const cancel = () => {
      clearTimeout(pressTimer);
      clearInterval(pressProgress);
      btn.classList.remove('pressing');
      hideHint();
    };
    btn.addEventListener('touchend', cancel);
    btn.addEventListener('touchmove', cancel);
    btn.addEventListener('touchcancel', cancel);
  });
  if (activeTab < state.length) bindFundEvents(state[activeTab], activeTab);
  else bindSummaryEvents();
  updateTime();
}

function bindFundEvents(f, i) {
  const priceIn = document.getElementById(`price-${i}`);
  if (priceIn) priceIn.addEventListener('input', e => {
    const prev = JSON.stringify(state);
    f.price = parseFloat(e.target.value) || 0;
    f._manualPrice = true;
    save(prev);
    updateCardValues(i);
  });
  ['base-basePrice', 'base-initShares', 'base-target'].forEach(k => {
    const inp = document.getElementById(`${k}-${i}`);
    if (inp) inp.addEventListener('input', e => {
      const field = k.replace('base-', '');
      const prev = JSON.stringify(state);
      f[field] = parseFloat(e.target.value) || 0;
      f._manualFields = f._manualFields || {};
      f._manualFields[field] = true;
      f._manualFields = f._manualFields || {};
      f._manualFields[field] = true;
      f._manualFields = f._manualFields || {};
      f._manualFields[field] = true;
      f._manualFields = f._manualFields || {};
      f._manualFields[field] = true;
      f._manualFields = f._manualFields || {};
      f._manualFields[field] = true;
      f._manualFields = f._manualFields || {};
      f._manualFields[field] = true;
      save(prev);
      updateCardValues(i);
    });
  });
  ['price-priceLow', 'price-priceMid', 'price-priceHigh'].forEach(k => {
    const inp = document.getElementById(`${k}-${i}`);
    if (inp) inp.addEventListener('input', e => {
      const field = k.replace('price-', '');
      const prev = JSON.stringify(state);
      f[field] = parseFloat(e.target.value) || 0;
      f._manualFields = f._manualFields || {};
      f._manualFields[field] = true;
      f._manualFields = f._manualFields || {};
      f._manualFields[field] = true;
      f._manualFields = f._manualFields || {};
      f._manualFields[field] = true;
      f._manualFields = f._manualFields || {};
      f._manualFields[field] = true;
      f._manualFields = f._manualFields || {};
      f._manualFields[field] = true;
      f._manualFields = f._manualFields || {};
      f._manualFields[field] = true;
      save(prev);
      updateCardValues(i);
    });
  });
  document.getElementById(`addBuy-${i}`)?.addEventListener('click', () => {
    addBuyDialog(i);
  });
  document.getElementById(`undo-${i}`)?.addEventListener('click', () => {
    undo();
  });
  document.getElementById(`redo-${i}`)?.addEventListener('click', () => {
    redo();
  });
  f.buys.forEach((b, bi) => {
    const dateInp = document.getElementById(`bdate-${i}-${bi}`);
    const priceInp = document.getElementById(`bprice-${i}-${bi}`);
    const amtInp = document.getElementById(`bamt-${i}-${bi}`);
    if (dateInp) dateInp.addEventListener('input', e => { const p=JSON.stringify(state); b.date = e.target.value; save(p); });
    if (priceInp) priceInp.addEventListener('input', e => { const p=JSON.stringify(state); b.price = parseFloat(e.target.value) || 0; save(p); updateCardValues(i); });
    if (amtInp) amtInp.addEventListener('input', e => { const p=JSON.stringify(state); b.amount = parseFloat(e.target.value) || 0; save(p); updateCardValues(i); });
    const delBtn = document.querySelector(`[data-buy-del="${i}"][data-idx="${bi}"]`);
    if (delBtn) delBtn.addEventListener('click', () => { const p=JSON.stringify(state); f.buys.splice(bi, 1); save(p); render(); });
  });
  ['param-multi', 'param-step', 'param-tiers'].forEach(prefix => {
    const sel = document.getElementById(`${prefix}-${i}`);
    if (!sel) return;
    sel.onchange = () => {
      const k = prefix.replace('param-', '');
      f[k] = parseFloat(sel.value);
      save();
      render();
    };
  });
}

function bindSummaryEvents() {}

function renderSummary() {
  let html = '<div class="fund" style="border-top: 4px solid #FFD700">';
  html += '<div class="summary-title">📊 投资汇总</div>';
  let totalInv=0, totalVal=0, totalTgt=0, totalShares=0;
  const stats = state.map(f => {
    const initShares = f.initShares || 0;
    const basePrice = f.basePrice || 0;
    const curPrice = f.price || 0;
    const target = f.target || 0;
    const inv = (initShares * basePrice) + f.buys.reduce((s,b)=>s+(b.amount||0),0);
    const sh = initShares + f.buys.reduce((s,b)=>s+(b.amount/(b.price||1)),0);
    const mv = curPrice * sh;
    const pnl = mv-inv;
    const rate = inv>0
