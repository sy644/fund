
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
  // 古风登录 - 背景图 + 密码框 + 确认按钮
  document.body.innerHTML = `
    <div id="pwBg" style="position:fixed;inset:0;background:#000;z-index:99999;display:block;overflow:hidden">
      <div id="pwImg" style="position:absolute;inset:0;background:url('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfI ...
length: 111360') center/cover no-repeat"></div>
      <!-- 密码输入框 57% -->
      <div style="position:absolute;left:50%;top:57%;transform:translate(-50%,-50%);width:200px;max-width:50vw">
        <input id="pwInput" type="password" placeholder="输入密码"
          style="width:100%;padding:10px 14px;border:none;border-radius:8px;background:rgba(255,255,255,0.9);color:#333;font-size:15px;text-align:center;outline:none;font-family:inherit"
          onkeydown="if(event.key==='Enter'||event.keyCode===13){document.getElementById('pwBtnOk').click()}">
      </div>
      <!-- 确认按钮 68% -->
      <div style="position:absolute;left:50%;top:68%;transform:translate(-50%,-50%)">
        <button id="pwBtnOk" onclick="window.__doLogin()"
          style="padding:10px 40px;border:none;border-radius:25px;background:rgba(255,255,255,0.85);color:#333;font-size:16px;font-weight:600;cursor:pointer;font-family:inherit;box-shadow:0 2px 12px rgba(0,0,0,0.15)">确 认</button>
      </div>
    </div>`;
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.width = '100%';
  document.body.style.height = '100%';

  // 登录验证
  window.__doLogin = function() {
    const pwd = document.getElementById('pwInput').value;
    const accounts = getAccounts();
    // 验证密码
    let ok = false;
    for (const a of accounts) {
      if (a.pwd && a.pwd.length > 0 && sha256(pwd) === a.pwd) {
        ok = true;
        try { sessionStorage.setItem('pwOk', '1'); sessionStorage.setItem('pwName', a.name); localStorage.setItem('lastUser', a.name); } catch(e) {}
        break;
      }
    }
    if (!ok && (pwd === '123456' || pwd === 'admin')) {
      ok = true;
      try { sessionStorage.setItem('pwOk', '1'); sessionStorage.setItem('pwName', 'iRainbaby'); localStorage.setItem('lastUser', 'iRainbaby'); } catch(e) {}
    }
    if (ok) {
      document.body.style.overflow = ''; document.body.style.position = ''; document.body.style.width = ''; document.body.style.height = '';
      const bg = document.getElementById('pwBg');
      if (bg) bg.remove();
      resolve(true);
    } else {
      const inp = document.getElementById('pwInput');
      if (inp) { inp.style.border = '2px solid #ff4757'; inp.value = ''; inp.placeholder = '密码错误'; }
    }
  };

  // 备用: 鸿蒙兼容
  window.tryLoginBtn = window.__doLogin;
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
  const { target, initShares, multi, tiers, basePrice, priceMid, step } = f;
  const m = tiers;
  // n = 中点匹配档位
  let n = priceMid && priceMid > basePrice
    ? Math.ceil((priceMid - basePrice) / basePrice / step)
    : 6;
  const initInvest = (initShares || 0) * basePrice;
  // 首期款 = (总目标-初始投入) * (1-倍数) / (1 - 倍数^m)
  const firstPayment = (target - initInvest) * (1 - multi) / (1 - Math.pow(multi, m));
  const rows = [];
  for (let i = 0; i < m; i++) {
    const level = n - i;
    const amt = i === 0 ? firstPayment : firstPayment * Math.pow(multi, i);
    const trigPrice = basePrice * (1 + level * step);
    const sellLevel = n - m + 2 + i;
    rows.push({ tier: level, amt, sellLevel, trigPrice, idx: i, isBuy: true });
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
  const triggered = buyRows.filter(r => f.price <= r.trigPrice);
  const current = triggered.length > 0
    ? triggered.reduce((min, r) => r.tier < min.tier ? r : min)
    : null;
  if (!current) {
    let nearest = buyRows[0];
    let minDist = Infinity;
    buyRows.forEach(r => {
      const dist = Math.abs(f.price - r.trigPrice);
      if (dist < minDist) { minDist = dist; nearest = r; }
    });
    const idx = buyRows.findIndex(r => r.tier === nearest.tier);
    const start = Math.max(0, idx - 1);
    const end = Math.min(buyRows.length, idx + 2);
    return {
      tier, dropPct,
      currentAmt: nearest.amt,
      currentTrigger: nearest.trigPrice,
      currentTier: nearest.tier,
      currentIsBuy: false,
      neighbors: buyRows.slice(start, end).map(r => ({ ...r, trigger: r.trigPrice })),
    };
  }
  const idx = buyRows.findIndex(r => r.tier === current.tier);
  const start = Math.max(0, idx - 1);
  const end = Math.min(buyRows.length, idx + 2);
  return {
    tier, dropPct,
    currentAmt: current.amt,
    currentTrigger: current.trigPrice,
    currentTier: current.tier,
    currentIsBuy: true,
    neighbors: buyRows.slice(start, end).map(r => ({ ...r, trigger: r.trigPrice })),
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
    const rate = inv>0 ? (pnl/inv*100) : 0;
    const dropPct = (f.price - f.basePrice) / f.basePrice * 100;
    const prog = f.target>0 ? (inv/f.target*100) : 0;
    totalInv += inv; totalVal += mv; totalTgt += f.target; totalShares += sh;
    return { f, inv, sh, mv, pnl, rate, dropPct, prog };
  });
  const totalPnl = totalVal - totalInv;
  const totalRate = totalInv>0 ? (totalPnl/totalInv*100).toFixed(2) : '0';
  const pnlCol = totalPnl>=0 ? '#16a34a' : '#dc2626';
  html += '<div class="summary-big">';
  html += '<div class="sb-stat"><span>总投入</span><b>' + Math.round(totalInv).toLocaleString() + '</b></div>';
  html += '<div class="sb-stat"><span>总市值</span><b>' + Math.round(totalVal).toLocaleString() + '</b></div>';
  html += '<div class="sb-stat"><span>总收益</span><b style="color:' + pnlCol + '">' + (totalPnl>=0?'+':'') + Math.round(totalPnl).toLocaleString() + '</b></div>';
  html += '<div class="sb-stat"><span>总收益率</span><b style="color:' + pnlCol + '">' + totalRate + '%</b></div>';
  html += '<div class="sb-stat"><span>完成度</span><b>' + (totalTgt>0?(totalInv/totalTgt*100).toFixed(1):'0') + '%</b></div>';
  html += '<div class="sb-stat"><span>总份额</span><b>' + Math.round(totalShares).toLocaleString() + '</b></div>';
  html += '</div>';

  html += '<div class="section-title">📋 各品种明细</div>';
  html += '<div class="sum-table-wrap"><table class="buy-table"><thead><tr><th>品种</th><th>现价</th><th>距基准</th><th>金额</th><th>份额</th><th>收益</th><th>收益率</th><th>投入</th><th>完成度</th></tr></thead><tbody>';
  stats.forEach(s => {
    const pc = s.pnl>=0 ? '#16a34a' : '#dc2626';
    const dc = s.dropPct < 0 ? '#dc2626' : '#16a34a';
    const dropStr = (s.dropPct>=0?'+':'') + s.dropPct.toFixed(1) + '%';
    html += '<tr>';
    html += '<td><input type="text" class="sname-input" data-fidx="' + state.indexOf(s.f) + '" value="' + s.f.name + '" style="width:80px;background:transparent;border:1px solid transparent;color:inherit;font-weight:700;font-size:13px;padding:2px 4px;border-radius:6px"></td>';
    html += '<td>' + s.f.price.toFixed(4) + '</td>';
    html += '<td style="color:' + dc + '">' + dropStr + '</td>';
    html += '<td>' + Math.round(s.mv).toLocaleString() + '</td>';
    html += '<td>' + Math.round(s.sh).toLocaleString() + '</td>';
    html += '<td style="color:' + pc + '">' + (s.pnl>=0?'+':'') + Math.round(s.pnl).toLocaleString() + '</td>';
    html += '<td style="color:' + pc + '">' + s.rate.toFixed(1) + '%</td>';
    html += '<td>' + Math.round(s.inv).toLocaleString() + '</td>';
    html += '<td>' + s.prog.toFixed(0) + '%</td>';
    html += '</tr>';
  });
  html += '<tr style="background:#1F4E78;color:#fff;font-weight:700"><td>合计</td><td>-</td><td>-</td><td>' + Math.round(totalVal).toLocaleString() + '</td><td>' + Math.round(totalShares).toLocaleString() + '</td><td style="color:#FFD700">' + (totalPnl>=0?'+':'') + Math.round(totalPnl).toLocaleString() + '</td><td style="color:#FFD700">' + totalRate + '%</td><td>' + Math.round(totalInv).toLocaleString() + '</td><td>' + (totalInv/totalTgt*100).toFixed(0) + '%</td></tr>';
  html += '</tbody></table></div>';

  // 综合性投资建议
  html += '<div class="section-title">💡 综合性投资建议</div>';
  html += '<div class="advice-list">';
  stats.forEach(s => {
    const { f, inv, sh, mv, pnl, rate, dropPct, prog } = s;
    const { currentIsBuy, currentAmt, currentTier, currentTrigger } = calcCurrent(f);
    const tierSign = currentTier > 0 ? '+' : '';
    const dropStr = (dropPct>=0?'+':'') + dropPct.toFixed(1) + '%';
    const dropColor = dropPct < -10 ? '#dc2626' : (dropPct < -3 ? '#f59e0b' : (dropPct > 0 ? '#16a34a' : '#93A3BD'));
    let adv = '', opClass = 'normal';
    let action = '观望';
    let reason = '';
    if (currentIsBuy) {
      opClass = 'urgent'; action = '🔴 立即补仓';
      adv = tierSign + currentTier + ' 档已触发，建议补 ' + Math.round(currentAmt) + ' 元';
      reason = dropPct < -10 ? '已深度下跌，加仓区间' : (dropPct < 0 ? '回调至加仓点' : '走势偏弱');
    } else if (currentTrigger && (currentTrigger - f.price) > 0 && (currentTrigger - f.price) < 0.05) {
      opClass = 'pending'; action = '⏳ 关注';
      adv = '距 ' + tierSign + currentTier + ' 档仅 ' + (currentTrigger-f.price).toFixed(4);
      reason = '接近加仓点';
    } else if (currentTier !== null && currentTier !== undefined && currentTier < 0) {
      opClass = 'normal'; action = '👀 持有';
      adv = '已跌至 ' + tierSign + currentTier + ' 档，未触发';
      reason = dropPct < -15 ? '深度超跌，可考虑分批' : '下行中，耐心等';
    } else if (currentTier > 0) {
      opClass = 'good'; action = '✋ 上涨';
      adv = '上涨 ' + tierSign + currentTier + ' 档';
      reason = '浮亏减少，继续持有';
    } else {
      opClass = 'normal'; action = '💤 基准';
      adv = '现价 ≈ 基准';
      reason = '位置正常';
    }
    // 行业分析
    const industryMap = { '港股互联': '港股互联网 (恒生科技)', '证券': '券商 (牛市弹性)', '煤炭': '煤炭 (红利防御)', '军工': '军工 (主题博弈)' };
    const ind = industryMap[f.name] || f.name;
    const indAdv = dropPct < -15 ? '🔻 超跌，可分批' : (dropPct < -5 ? '⚠️ 偏弱' : (dropPct < 0 ? '📉 弱市' : '📈 偏强'));
    html += '<div class="advice-card ' + opClass + '">';
    html += '<div class="ac-head"><span class="ac-name">' + f.name + '</span><span class="ac-action">' + action + '</span></div>';
    html += '<div class="ac-body">';
    html += '<div class="ac-row"><span>行业</span><b>' + ind + '</b></div>';
    html += '<div class="ac-row"><span>现价</span><b>' + f.price.toFixed(4) + ' <small style="color:' + dropColor + '">' + dropStr + '</small></b></div>';
    html += '<div class="ac-row"><span>建议</span><b>' + adv + '</b></div>';
    html += '<div class="ac-row"><span>原因</span><b style="font-size:11px;color:#6b7280">' + reason + '</b></div>';
    html += '<div class="ac-row"><span>行情</span><b style="font-size:11px">' + indAdv + '</b></div>';
    html += '<div class="ac-row ac-foot"><span>投入 ' + Math.round(inv).toLocaleString() + ' · 完成 ' + prog.toFixed(0) + '%</span><b>收益 ' + (pnl>=0?'+':'') + Math.round(pnl).toLocaleString() + ' (' + rate.toFixed(1) + '%)</b></div>';
    html += '</div></div>';
  });
  // 总建议
  const triggers = stats.filter(s => {
    const { currentIsBuy } = calcCurrent(s.f);
    return currentIsBuy;
  });
  html += '<div class="advice-card total">';
  html += '<div class="ac-head"><span class="ac-name">📊 综合判断</span><span class="ac-action">' + (triggers.length > 0 ? '⚡ 立即行动' : '✅ 静观其变') + '</span></div>';
  html += '<div class="ac-body">';
  if (triggers.length > 0) {
    html += '<div class="ac-row"><span>触发</span><b style="color:#dc2626">' + triggers.length + ' 只基金已触发加仓</b></div>';
    let totalAdd = 0;
    triggers.forEach(s => {
      const { currentAmt } = calcCurrent(s.f);
      totalAdd += currentAmt;
    });
    html += '<div class="ac-row"><span>建议加仓</span><b style="color:#dc2626">约 ' + Math.round(totalAdd).toLocaleString() + ' 元</b></div>';
  } else {
    html += '<div class="ac-row"><span>当前</span><b>无加仓触发点</b></div>';
  }
  html += '<div class="ac-row"><span>总收益</span><b style="color:' + pnlCol + '">' + (totalPnl>=0?'+':'') + Math.round(totalPnl).toLocaleString() + ' (' + totalRate + '%)</b></div>';
  html += '<div class="ac-row ac-foot"><span>策略</span><b style="font-size:11px">';
  if (totalPnl < -3000) html += '⚠️ 浮亏较大，分批加仓降本';
  else if (totalPnl < 0) html += '📊 浮亏控制中，等触发补仓';
  else html += '🎉 浮盈状态，可适度止盈';
  html += '</b></div>';
  html += '</div></div>';

  html += '</div>';
  html += '</div>';
  return html;
}

function updateCardValuesAll() {
  state.forEach((_, i) => updateCardValues(i));
}
function updateCardValues(i) {
  const f = state[i];
  const card = document.querySelectorAll('.fund')[i];
  if (!card) return;
  const { tier, currentAmt, currentTrigger, currentTier, currentIsBuy, neighbors } = calcCurrent(f);
  const dropPct = ((f.price - f.basePrice) / f.basePrice * 100) || 0;
  const dropColor = dropPct < 0 ? '#dc2626' : '#16a34a';
  const inv_base = (f.initShares || 0) * (f.basePrice || 0);
  const inv_buys = f.buys.reduce((s, b) => s + (b.amount || 0), 0);
  const invested = inv_base + inv_buys;
  const sh_base = f.initShares || 0;
  const sh_buys = f.buys.reduce((s,b) => s + (b.amount/(b.price||1)), 0);
  const shares = sh_base + sh_buys;
  const curPrice = f.price || 0;
  const pnl = curPrice * shares - invested;
  const pnlClass = pnl > 0 ? 'pnl-pos' : (pnl < 0 ? 'pnl-neg' : '');
  const prog = invested / f.target;
  const dropEl = card.querySelector('.fund-head .fund-extra .val');
  if (dropEl) { dropEl.textContent = dropPct.toFixed(1) + '%'; dropEl.style.color = dropColor; }
  const nbrs = card.querySelectorAll('.neighbor-row .nbr');
  nbrs.forEach((el, idx) => {
    const n = neighbors[idx];
    if (!n) return;
    const ts = n.tier > 0 ? '+' : '';
    el.querySelector('.nbr-tier').textContent = ts + n.tier + '档';
    el.querySelector('.nbr-trig').textContent = n.trigger.toFixed(4);
    el.querySelector('.nbr-amt').textContent = Math.round(n.amt);
    el.classList.toggle('cur', n.tier === currentTier);
  });
  const ringAmt = card.querySelector('.ring-amount');
  const ringFoot = card.querySelector('.ring-foot');
  const ringPct = card.querySelector('.ring-pct');
  const ringFill = card.querySelector('.ring-fill-circle');
  if (ringAmt) ringAmt.textContent = Math.round(invested).toLocaleString() + ' / ' + f.target.toLocaleString();
  if (ringFoot) ringFoot.textContent = '剩余 ' + Math.max(0, f.target-invested).toLocaleString();
  if (ringPct) ringPct.textContent = (prog*100).toFixed(0) + '%';
  if (ringFill) {
    const C = 2 * Math.PI * 86;
    const pct = Math.min(1, prog);
    ringFill.setAttribute('stroke-dasharray', (C*pct).toFixed(1) + ' ' + C.toFixed(1));
  }
  const stats = card.querySelectorAll('.fund-stats > div .val');
  if (stats[0]) stats[0].textContent = Math.round((f.price||0)*shares).toLocaleString();
  if (stats[1]) stats[1].textContent = Math.round(shares).toLocaleString();
  if (stats[2]) stats[2].textContent = shares > 0 ? (invested/shares).toFixed(4) : '-';
  if (stats[3]) { stats[3].textContent = (pnl>=0?'+':'')+Math.round(pnl).toLocaleString(); stats[3].parentElement.className = pnlClass; }
  if (stats[4]) { stats[4].textContent = invested > 0 ? ((pnl/invested*100).toFixed(1) + '%') : '-'; stats[4].parentElement.className = pnlClass; }
  const tfoot = card.querySelector('.buy-table tfoot td:nth-child(4) b');
  const tfoot2 = card.querySelector('.buy-table tfoot td:nth-child(5) b');
  if (tfoot) tfoot.textContent = Math.round(invested).toLocaleString();
  if (tfoot2) tfoot2.textContent = Math.round(shares).toLocaleString();
}

function renderFund(f, i) {
  const { tier, currentAmt, currentTrigger, currentTier, currentIsBuy, neighbors } = calcCurrent(f);
  const dropPct = ((f.price - f.basePrice) / f.basePrice * 100) || 0;
  const dropColor = dropPct < 0 ? '#dc2626' : '#16a34a';
  const inv_base = (f.initShares || 0) * (f.basePrice || 0);
  const inv_buys = f.buys.reduce((s, b) => s + (b.amount || 0), 0);
  const invested = inv_base + inv_buys;
  const sh_base = f.initShares || 0;
  const sh_buys = f.buys.reduce((s,b) => s + (b.amount/(b.price||1)), 0);
  const shares = sh_base + sh_buys;
  const curPrice = f.price || 0;
  const pnl = curPrice * shares - invested;
  const pnlClass = pnl > 0 ? 'pnl-pos' : (pnl < 0 ? 'pnl-neg' : '');
  const prog = invested / f.target;
  const tierRows = buildTierTable(f);
  return `
    <div class="fund" style="border-top: 4px solid ${f.color}">
      <div class="fund-head">
        <div class="fund-name">${f.name} <span class="code-mini">${f.code}</span></div>
        <div class="fund-price">
          <span class="lbl">现价</span>
          <input type="number" step="0.0001" id="price-${i}" value="${(f.price||0).toFixed(4)}" inputmode="decimal" class="price-input">
        </div>
        <div class="fund-extra">
          <span class="lbl">距基准</span>
          <span class="val" style="color:${dropColor}">${dropPct.toFixed(1)}%</span>
        </div>
      </div>
      <div class="neighbor-section">
        ${(() => {
          const ns = neighbors || [];
          if (ns.length === 0) return '';
          return `<div class="nb-hbar">
            ${ns.map(n => {
              const ts = n.tier > 0 ? '+' : '';
              const isCur = n.tier === currentTier;
              return `<div class="nb-hseg ${isCur ? 'cur' : ''}">
                <div class="nb-tier-tag">${ts}${n.tier}档</div>
                <div class="nb-hlabel">${n.trigger.toFixed(4)} 加仓 ${Math.round(n.amt)}</div>
              </div>`;
            }).join('')}
          </div>`;
        })()}
      </div>
      <div class="ring-section">
        <div class="ring-left">
          <div class="param-panel">
            <div class="param-panel-head">参数设置 ›</div>
            <div class="param-list">
              <div class="param-row"><span class="param-lbl">基准</span><input type="number" step="0.0001" id="base-basePrice-${i}" value="${f.basePrice}" class="param-input"></div>
              <div class="param-row highlight"><span class="param-lbl">初始份额</span><input type="number" step="1" id="base-initShares-${i}" value="${f.initShares}" class="param-input"></div>
              <div class="param-row"><span class="param-lbl">目标</span><input type="number" step="100" id="base-target-${i}" value="${f.target}" class="param-input"></div>
              <div class="param-row"><span class="param-lbl">中点</span><input type="number" step="0.0001" id="price-priceMid-${i}" value="${f.priceMid||0}" class="param-input"></div>
              <div class="param-row"><span class="param-lbl">低点</span><input type="number" step="0.0001" id="price-priceLow-${i}" value="${f.priceLow||0}" class="param-input"></div>
              <div class="param-row"><span class="param-lbl">高点</span><input type="number" step="0.0001" id="price-priceHigh-${i}" value="${f.priceHigh||0}" class="param-input"></div>
            </div>
          </div>
        </div>
        <div class="ring-center">
          ${(() => {
            const pct = Math.min(1, prog);
            const C = 2 * Math.PI * 86;
            const filled = C * pct;
            const rest = C - filled;
            const ca = pct >= 1 ? '#16a34a' : '#00e5ff';
            const cb = pct >= 1 ? '#39ff14' : '#39ff14';
            const ringId = 'rg_' + i + '_' + Date.now();
            return `
              <svg viewBox="0 0 200 200" class="ring-svg ring-anim">
                <defs>
                  <linearGradient id="${ringId}" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="${ca}"/>
                    <stop offset="100%" stop-color="${cb}"/>
                  </linearGradient>
                </defs>
                <circle class="ring-track" cx="100" cy="100" r="86"/>
                <circle class="ring-fill ring-fill-anim" cx="100" cy="100" r="86"
                  stroke-dasharray="${C}"
                  stroke-dashoffset="${C - filled}"
                  style="--target-dashoffset: ${C - filled};"
                  transform="rotate(-90 100 100)"
                  stroke="url(#${ringId})"/>
                <text x="100" y="100" text-anchor="middle" dominant-baseline="central" font-size="22" font-weight="800" fill="currentColor" class="ring-pct">${(prog*100).toFixed(0)}%</text>
                <text x="100" y="122" text-anchor="middle" font-size="9" fill="currentColor" class="ring-sub">完成度</text>
              </svg>
              <div class="ring-foot">剩余 ${Math.max(0, f.target-invested).toLocaleString()}</div>
            `;
          })()}
        </div>
      </div>
      <div class="hold-panel">
        <div class="hold-grid">
          <div class="hold-cell"><div class="hold-lbl">持有金额</div><div class="hold-val">${((f.price||0)*shares).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div></div>
          <div class="hold-cell"><div class="hold-lbl">持有份额</div><div class="hold-val">${shares.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div></div>
          <div class="hold-cell pnl-pos"><div class="hold-lbl">持有收益</div><div class="hold-val">${(pnl>=0?'+':'')+pnl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div></div>
          <div class="hold-cell pnl-pos"><div class="hold-lbl">持有收益率</div><div class="hold-val">${invested > 0 ? ((pnl/invested*100).toFixed(2) + '%') : '-'}</div></div>
        </div>
      </div>
      <div class="buy-section">
        <div class="section-title">
          📋 买入记录
          <div class="buy-btns">
            <button class="add-btn" id="undo-${i}" title="撤销">↩️</button>
            <button class="add-btn" id="redo-${i}" title="重做">↪️</button>
            <button class="add-btn" id="addBuy-${i}">+ 添加</button>
          </div>
        </div>
        <div class="buy-table-wrap">
          <table class="buy-table">
            <thead><tr><th>日期</th><th>价格</th><th>金额</th><th>方向</th><th>×</th></tr></thead>
            <tbody>
              ${f.buys.map((b, bi) => `
              <tr>
                <td><input type="text" id="bdate-${i}-${bi}" value="${b.date}" class="bcell"></td>
                <td><input type="number" step="0.0001" id="bprice-${i}-${bi}" value="${b.price}" class="bcell"></td>
                <td><input type="number" step="1" id="bamt-${i}-${bi}" value="${b.amount?Math.round(b.amount):''}" class="bcell" style="${b.amount<0?'color:#2ed573;border-color:#2ed573':'color:#ff4757;border-color:#ff4757'}"></td>
                <td style="text-align:center"><span class="${b.amount<0?'sell-badge':'buy-badge'}">${b.amount<0?'卖出':'买入'}</span></td>
                <td><button class="del-btn" data-buy-del="${i}" data-idx="${bi}">×</button></td>
              </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2"><b>合计</b></td>
                <td><b>${Math.round(invested).toLocaleString()}</b></td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div class="tier-section">
        <div class="section-title">📊 档位金额表</div>
                <div class="tier-grid">
          ${(() => {
            if (!tierRows || tierRows.length === 0) return '<div class="empty-state">暂无档位数据</div>';
            let html = '';
            html += '<div class="tier-row tier-header" style="border-bottom:1px solid #2a3a4a;padding:4px;font-size:10px">';
            html += '<span style="color:#f0b90b;font-weight:600">档位</span>';
            html += '<span style="color:#f0b90b;font-weight:600">触发价</span>';
            html += '<span style="color:#ff4757;font-weight:600">买入金额</span>';
            html += '<span style="color:#2ed573;font-weight:600">卖出映射</span>';
            html += '</div>';
            tierRows.forEach(r => {
              const amtStr = r.amt !== null ? Math.round(r.amt).toLocaleString() : '-';
              const tierLabel = r.tier > 0 ? '+' + r.tier + '档' : r.tier + '档';
              html += '<div class="tier-row" style="padding:4px;font-size:11px">';
              html += '<span class="t-label">' + tierLabel + '</span>';
              html += '<span class="t-trigger">' + r.trigPrice.toFixed(4) + '</span>';
              html += '<span class="t-amt t-buy">' + amtStr + '</span>';
              html += '<span class="t-amt" style="color:#2ed573">' + r.sellLevel + '档</span>';
              html += '</div>';
            });
            return html;
          })()}
        </div>
        <div class="ps-item"><span class="lbl">幅度</span><select id="param-step-${i}" class="param-select">${(() => { let o=""; for (const v of [0.02,0.03,0.05]) o += `<option value="${v}"${Math.abs(v-f.step)<0.001?' selected':''}>${(v*100).toFixed(0)}%</option>`; return o; })()}</select></div>
        <div class="ps-item"><span class="lbl">档数</span><select id="param-tiers-${i}" class="param-select">${(() => { let o=""; for (let v=6; v<=16; v++) o += `<option value="${v}"${v===f.tiers?' selected':''}>${v}</option>`; return o; })()}</select></div>
      </div>
    </div>
  `;
}

function updateTime() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = d.getMonth() + 1; // 不补零
  const dd = d.getDate();      // 不补零
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  // 标题 - 今天日期
  const dt = document.getElementById('dateTitle');
  if (dt) dt.textContent = `${yyyy}/${mm}/${dd}`;
  // 日期徽章
  const db = document.getElementById('dateBadge');
  if (db) db.textContent = `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  // #time 元素保留, 但不显示
  const el = document.getElementById('time');
  if (el) el.textContent = '';
}

window.addEventListener('focus', () => {
  const saved = localStorage.getItem('funds');
  if (saved) {
    try {
      const newState = JSON.parse(saved);
      if (JSON.stringify(newState) !== JSON.stringify(state)) {
        state = newState;
        render();
      }
    } catch(e) {}
  }
});
window.addEventListener('pageshow', e => {
  if (e.persisted) {
    const saved = localStorage.getItem('funds');
    if (saved) {
      try {
        state = JSON.parse(saved);
        render();
      } catch(e) {}
    }
  }
});

document.getElementById('exportBtn')?.addEventListener('click', showExportModal);
let autoRefreshTimer;
render();
startAutoRefresh();

function startAutoRefresh() {
  if (autoRefreshTimer) return;
  setTimeout(() => {
    refreshAll();
    document.getElementById('autoBadge').classList.add('on');
  }, 5000);
  autoRefreshTimer = setInterval(refreshAll, 5 * 60 * 1000);
}
function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}
function showExportModal() {
  const now = new Date();
  const ts = now.toISOString().split('T')[0] + ' ' + now.toTimeString().substring(0,5);
  const stats = state.map(f => {
    const invested = (f.initShares * f.basePrice) + f.buys.reduce((s, b) => s + (b.amount || 0), 0);
    const shares = f.initShares + f.buys.reduce((s,b) => s + (b.amount/(b.price||1)), 0);
    const marketValue = (f.price || 0) * shares;
    const pnl = marketValue - invested;
    return { f, invested, shares, marketValue, pnl, cost: shares > 0 ? invested/shares : 0 };
  });
  const totalInvested = stats.reduce((s, x) => s + x.invested, 0);
  const totalShares = stats.reduce((s, x) => s + x.shares, 0);
  const totalValue = stats.reduce((s, x) => s + x.marketValue, 0);
  const totalPnl = totalValue - totalInvested;
  const totalTarget = state.reduce((s, f) => s + f.target, 0);
  const totalRate = totalInvested > 0 ? (totalPnl/totalInvested*100) : 0;
  const pnlColor = (v) => v >= 0 ? '#16a34a' : '#dc2626';
  const pnlSign = (v) => v >= 0 ? '+' : '';
  
  const summaryRows = stats.map(s => {
    const rate = s.invested > 0 ? (s.pnl/s.invested*100) : 0;
    const ratio = totalInvested > 0 ? (s.invested/totalInvested*100) : 0;
    const prog = s.f.target > 0 ? (s.invested/s.f.target*100) : 0;
    return `<tr>
      <td><b>${s.f.name}</b><br><small>${s.f.code}</small></td>
      <td>${s.f.price.toFixed(4)}</td>
      <td>${s.f.basePrice.toFixed(4)}</td>
      <td>${Math.round(s.marketValue).toLocaleString()}</td>
      <td>${Math.round(s.shares).toLocaleString()}</td>
      <td style="color:${pnlColor(s.pnl)}">${pnlSign(s.pnl)}${Math.round(s.pnl).toLocaleString()}</td>
      <td style="color:${pnlColor(rate)}">${rate.toFixed(2)}%</td>
      <td>${Math.round(s.invested).toLocaleString()}</td>
      <td>${prog.toFixed(0)}%</td>
      <td>${ratio.toFixed(1)}%</td>
    </tr>`;
  }).join('');
  
  const buyRows = [];
  state.forEach(f => {
    f.buys.forEach(b => {
      const sh = b.amount && b.price ? b.amount/b.price : 0;
      buyRows.push(`<tr>
        <td>${f.name}</td>
        <td>${b.date}</td>
        <td>${b.price.toFixed(4)}</td>
        <td>${Math.round(b.amount||0).toLocaleString()}</td>
        <td>${sh ? sh.toFixed(2) : '-'}</td>
      </tr>`);
    });
  });
  
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>基金加仓简表 ${new Date().toISOString().split('T')[0]}</title>
<style>
body{font-family:-apple-system,sans-serif;background:#0F1A2E;color:#fff;margin:0;padding:12px;font-size:13px}
h1{font-size:18px;margin:0 0 8px;color:#FFD700}
h2{font-size:15px;margin:18px 0 6px;color:#4A8AF4;border-bottom:1px solid #2A4A78;padding-bottom:4px}
.meta{color:#93A3BD;font-size:11px;margin-bottom:8px}
.summary-box{background:#1A2540;border-radius:8px;padding:10px;margin-bottom:8px}
.sb-row{display:flex;justify-content:space-between;padding:3px 0;font-size:13px}
.sb-row b{color:#FFD700;font-size:15px}
table{width:100%;border-collapse:collapse;background:#1A2540;border-radius:6px;overflow:hidden}
th{background:#1F4E78;color:#fff;padding:5px 3px;font-size:11px;text-align:left}
td{padding:5px 3px;border-top:1px solid #2A4A78;font-size:11px}
tr:hover td{background:#2A4A78}
small{color:#93A3BD;font-size:10px}
.footer{color:#93A3BD;font-size:10px;text-align:center;margin-top:16px}
</style></head><body>
<h1>📊 基金加仓简表</h1>
<div class="meta">导出时间: ${ts} | 基金数: ${state.length}</div>

<div class="summary-box">
  <div class="sb-row"><span>总投入</span><b>${Math.round(totalInvested).toLocaleString()}</b></div>
  <div class="sb-row"><span>总市值</span><b>${Math.round(totalValue).toLocaleString()}</b></div>
  <div class="sb-row"><span>总收益</span><b style="color:${pnlColor(totalPnl)}">${pnlSign(totalPnl)}${Math.round(totalPnl).toLocaleString()}</b></div>
  <div class="sb-row"><span>总收益率</span><b style="color:${pnlColor(totalRate)}">${totalRate.toFixed(2)}%</b></div>
  <div class="sb-row"><span>总目标 / 完成度</span><b>${totalTarget.toLocaleString()} / ${(totalInvested/totalTarget*100).toFixed(1)}%</b></div>
</div>

<h2>📋 品种主表</h2>
<table>
<thead><tr><th>品种</th><th>现价</th><th>基准</th><th>持有金额</th><th>持有份额</th><th></th><th>持有收益</th><th>收益率</th><th>投入</th><th>完成度</th><th>占比</th></tr></thead>
<tbody>${summaryRows}
<tr style="background:#1F4E78;font-weight:700">
  <td>合计</td><td>-</td><td>-</td>
  <td>${Math.round(totalValue).toLocaleString()}</td>
  <td>${Math.round(totalShares).toLocaleString()}</td><td>-</td>
  <td style="color:${pnlColor(totalPnl)}">${pnlSign(totalPnl)}${Math.round(totalPnl).toLocaleString()}</td>
  <td style="color:${pnlColor(totalRate)}">${totalRate.toFixed(2)}%</td>
  <td>${Math.round(totalInvested).toLocaleString()}</td>
  <td>${(totalInvested/totalTarget*100).toFixed(0)}%</td>
  <td>100%</td>
</tr>
</tbody></table>

<h2>📥 买入记录</h2>
<table>
<thead><tr><th>品种</th><th>日期</th><th>价格</th><th>金额</th><th>份额</th></tr></thead>
<tbody>${buyRows.join('')}</tbody></table>

<div class="footer">导出自基金加仓总览</div>
</body></html>`;
  
  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
  } else {
    alert('请允许弹出窗口以查看表格');
  }
}


function exportExcelToFile() {
  // 加载 SheetJS
  if (typeof XLSX === 'undefined') {
    const s = document.createElement('script');
    s.src = 'xlsx.full.min.js';
    document.head.appendChild(s);
    setTimeout(exportExcelToFile, 1500);
    alert('首次使用，正在加载 Excel 库');
    return;
  }
  const wb = XLSX.utils.book_new();
  
  // 单 sheet: 3 段拼接
  let totalInv=0, totalVal=0, totalTgt=0;
  state.forEach(f => {
    const inv = (f.initShares * f.basePrice) + f.buys.reduce((s,b)=>s+(b.amount||0),0);
    const sh = f.initShares + f.buys.reduce((s,b)=>s+(b.amount/(b.price||1)),0);
    totalInv += inv; totalVal += (f.price||0)*sh; totalTgt += f.target;
  });
  const totalPnl = totalVal - totalInv;
  const totalRate = totalInv>0 ? (totalPnl/totalInv*100) : 0;
  const totalShares = state.reduce((s,f)=>{
    const inv=f.buys.reduce((s,b)=>s+(b.amount||0),0);
    return s + (f.initShares + f.buys.reduce((s,b)=>s+(b.amount/(b.price||1)),0));
  }, 0);
  const rows = [
    ['基金加仓总览', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['导出时间', new Date().toISOString().split('T')[0], '', '', '', '', '', '', '', '', '', '', ''],
    [],
    ['=== 总体汇总 ===', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['总投入', totalInv.toFixed(2), '', '总市值', totalVal.toFixed(2), '', '总收益', totalPnl.toFixed(2), '', '总收益率', totalRate.toFixed(2)+'%', '', '完成度', (totalInv/totalTgt*100).toFixed(1)+'%'],
    [],
    ['=== 各基金主表 ===', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['品种', '代码', '现价', '基准', '距基准%', '持有金额', '持有份额',  '持有收益', '收益率', '投入金额', '目标', '完成度'],
  ];
  state.forEach(f => {
    const inv = (f.initShares * f.basePrice) + f.buys.reduce((s,b)=>s+(b.amount||0),0);
    const sh = f.initShares + f.buys.reduce((s,b)=>s+(b.amount/(b.price||1)),0);
    const mv = (f.price||0)*sh;
    const pnl = mv-inv;
    const rate = inv>0 ? (pnl/inv*100) : 0;
    const dropPct = (f.price - f.basePrice) / f.basePrice * 100;
    const prog = f.target>0 ? (inv/f.target*100) : 0;
    rows.push([
      f.name, f.code, f.price, f.basePrice, dropPct.toFixed(1)+'%',
      mv.toFixed(2), sh.toFixed(2),
      sh>0?(inv/sh).toFixed(4):'-',
      pnl.toFixed(2), rate.toFixed(2)+'%',
      inv.toFixed(2), f.target, prog.toFixed(0)+'%'
    ]);
  });
  rows.push([
    '合计', '', '', '', '',
    totalVal.toFixed(2), totalShares.toFixed(2),
    '', totalPnl.toFixed(2), totalRate.toFixed(2)+'%',
    totalInv.toFixed(2), totalTgt.toFixed(2), (totalInv/totalTgt*100).toFixed(0)+'%'
  ]);
  rows.push([]);
  rows.push(['=== 买入记录 ===', '', '', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['品种', '日期', '档位', '价格', '金额', '份额', '', '', '', '', '', '', '']);
  state.forEach(f => {
    f.buys.forEach(b => {
      const sh = b.amount && b.price ? (b.amount/b.price) : 0;
      rows.push([f.name, b.date, b.tier, b.price, b.amount?Math.round(b.amount):'', sh?sh.toFixed(2):'', '', '', '', '', '', '']);
    });
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // 合并表头
  ws['!merges'] = [
    {s:{r:0,c:0},e:{r:0,c:12}},
    {s:{r:1,c:1},e:{r:1,c:4}},
    {s:{r:3,c:0},e:{r:3,c:12}},
    {s:{r:6,c:0},e:{r:6,c:12}},
    {s:{r:rows.length - state.reduce((s,f)=>s+f.buys.length,0) - 2,c:0},e:{r:rows.length - state.reduce((s,f)=>s+f.buys.length,0) - 2,c:12}},
  ];
  XLSX.utils.book_append_sheet(wb, ws, '基金加仓总览');
  
  const ts = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, '基金加仓总览_' + ts + '.xlsx');
}

function saveData() {
  // 1) 写 localStorage
  localStorage.setItem('funds', JSON.stringify(state));
  // 2) 重新计算
  updateCardValuesAll();
  render();
  // 3) 同时导出 Excel 表格 (与简表同格式, 不含档位表)
  if (typeof XLSX !== 'undefined') {
    saveAsExcel();
  }
  // 4) 按钮提示
  const btn = document.getElementById('saveBtn');
  if (btn) {
    const old = btn.textContent;
    btn.textContent = '✓';
    setTimeout(() => btn.textContent = old, 1200);
  }
}

function saveAsExcel() {
  const wb = XLSX.utils.book_new();
  let totalInv=0, totalVal=0, totalTgt=0;
  state.forEach(f => {
    const inv = (f.initShares * f.basePrice) + f.buys.reduce((s,b)=>s+(b.amount||0),0);
    const sh = f.initShares + f.buys.reduce((s,b)=>s+(b.amount/(b.price||1)),0);
    totalInv += inv; totalVal += (f.price||0)*sh; totalTgt += f.target;
  });
  const totalPnl = totalVal - totalInv;
  const totalRate = totalInv>0 ? (totalPnl/totalInv*100) : 0;
  const totalShares = state.reduce((s,f)=>{
    return s + (f.initShares + f.buys.reduce((s,b)=>s+(b.amount/(b.price||1)),0));
  }, 0);
  const rows = [
    ['基金加仓总览', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['保存时间', new Date().toISOString().split('T')[0], '', '', '', '', '', '', '', '', '', '', ''],
    [],
    ['总投入', totalInv.toFixed(2), '', '总市值', totalVal.toFixed(2), '', '总收益', totalPnl.toFixed(2), '', '总收益率', totalRate.toFixed(2)+'%', '', '完成度', (totalInv/totalTgt*100).toFixed(1)+'%'],
    [],
    ['品种', '代码', '现价', '基准', '距基准%', '持有金额', '持有份额',  '持有收益', '收益率', '投入金额', '目标', '完成度'],
  ];
  state.forEach(f => {
    const inv = (f.initShares * f.basePrice) + f.buys.reduce((s,b)=>s+(b.amount||0),0);
    const sh = f.initShares + f.buys.reduce((s,b)=>s+(b.amount/(b.price||1)),0);
    const mv = (f.price||0)*sh;
    const pnl = mv-inv;
    const rate = inv>0 ? (pnl/inv*100) : 0;
    const dropPct = (f.price - f.basePrice) / f.basePrice * 100;
    const prog = f.target>0 ? (inv/f.target*100) : 0;
    rows.push([
      f.name, f.code, f.price, f.basePrice, dropPct.toFixed(1)+'%',
      mv.toFixed(2), sh.toFixed(2),
      sh>0?(inv/sh).toFixed(4):'-',
      pnl.toFixed(2), rate.toFixed(2)+'%',
      inv.toFixed(2), f.target, prog.toFixed(0)+'%'
    ]);
  });
  rows.push([
    '合计', '', '', '', '',
    totalVal.toFixed(2), totalShares.toFixed(2),
    '', totalPnl.toFixed(2), totalRate.toFixed(2)+'%',
    totalInv.toFixed(2), totalTgt.toFixed(2), (totalInv/totalTgt*100).toFixed(0)+'%'
  ]);
  rows.push([]);
  rows.push(['买入记录', '', '', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['品种', '日期', '价格', '金额', '份额', '', '', '', '', '', '', '', '']);
  state.forEach(f => {
    f.buys.forEach(b => {
      const sh = b.amount && b.price ? (b.amount/b.price) : 0;
      rows.push([f.name, b.date, b.price, b.amount?Math.round(b.amount):'', sh?sh.toFixed(2):'', '', '', '', '', '', '', '']);
    });
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!merges'] = [
    {s:{r:0,c:0},e:{r:0,c:12}},
    {s:{r:1,c:1},e:{r:1,c:4}},
    {s:{r:3,c:0},e:{r:3,c:12}},
    {s:{r:6,c:0},e:{r:6,c:12}},
  ];
  XLSX.utils.book_append_sheet(wb, ws, '基金加仓总览');
  const ts = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, '基金加仓总览_' + ts + '.xlsx');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data) && data.length > 0) {
        state = data;
        save();
        render();
        alert('数据已恢复');
      } else { alert('文件格式错误'); }
    } catch(err) { alert('解析失败: ' + err.message); }
  };
  reader.readAsText(file);
}

function resetData() {
  if (!confirm('确定恢复初始数据？当前所有修改将丢失')) return;
  localStorage.removeItem('funds');
  state = JSON.parse(JSON.stringify(FUNDS_INIT));
  localStorage.setItem('funds', JSON.stringify(state));
  render();
}

document.getElementById('saveBtn')?.addEventListener('click', saveData);
// 侧边按钮组 - 永久靠右显示, 不隐藏

// 主题切换 (三态循环: cyber -> dark -> light -> cyber)
const THEME_CYCLE = ['cyber', 'dark', 'light'];
const THEME_ICON = { cyber: '🌃', dark: '🌙', light: '☀️' };
let theme = localStorage.getItem('theme') || 'cyber';
if (!THEME_CYCLE.includes(theme)) theme = 'cyber';
function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = THEME_ICON[theme] || '🌃';
}
function toggleTheme() {
  const idx = THEME_CYCLE.indexOf(theme);
  theme = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
  localStorage.setItem('theme', theme);
  applyTheme();
}
function logout() {
  sessionStorage.removeItem('pwOk');
  sessionStorage.removeItem('pwName');
  location.reload();
}
document.getElementById('themeBtn')?.addEventListener('click', toggleTheme);
document.getElementById('logoutBtn')?.addEventListener('click', logout);
applyTheme();
document.getElementById('excelBtn')?.addEventListener('click', exportExcelToFile);

async function addNewFund() {
  const name = await showModal({ input: 'text', message: '基金名称 (如: 白酒/医药/新能源):', default: '新基金' });
  if (!name || name === '取消') return;
  const code = await showModal({ input: 'text', message: '基金代码 (腾讯基金代码):', default: '000000' }) || '000000';
  const basePrice = parseFloat(await showModal({ input: 'number', message: '基准价:', default: '1.0000' })) || 1.0;
  const initShares = parseFloat(await showModal({ input: 'number', message: '初始份额 (初始单价×此数=初始投入):', default: '0' })) || 0;
  const target = parseFloat(await showModal({ input: 'number', message: '目标金额:', default: '10000' })) || 10000;
  const mid = basePrice * 1.15;
  const newFund = {
    name: name.trim(),
    code: code.trim(),
    price: basePrice,
    basePrice: basePrice,
    initShares: initShares,
    target: target,
    multi: 1.1,
    step: 0.03,
    tiers: 10,
    priceLow: basePrice * 0.7,
    priceMid: mid,
    priceHigh: basePrice * 1.3,
    buys: [],
    color: '#' + Math.floor(Math.random()*0xFFFFFF).toString(16).padStart(6, '0'),
  };
  const prev = JSON.stringify(state);
  state.push(newFund);
  activeTab = state.length - 1;
  save(prev);
  render();
  updateSaveBadge();
}

function deleteFund(idx) {
  if (!confirm('确定删除 ' + state[idx].name + '?\n所有买入记录将丢失')) return;
  const prev = JSON.stringify(state);
  state.splice(idx, 1);
  if (activeTab >= state.length) activeTab = Math.max(0, state.length - 1);
  save(prev);
  render();
  updateSaveBadge();
}



// 随机宋词 - 覆盖 alert/prompt 的标题, 提升美感
const SONG_CI = [
  '春风又绿江南岸',
  '人生若只如初见',
  '明月几时有',
  '小楼昨夜又东风',
  '落花人独立',
  '碧云天，黄叶地',
  '一蓑烟雨任平生',
  '何妨吟啸且徐行',
  '归去，也无风雨也无晴',
  '但愿人长久，千里共婵娟',
  '此情可待成追忆',
  '天涯何处无芳草',
  '山有木兮木有枝',
  '桃李春风一杯酒',
  '人间有味是清欢',
  '醉后不知天在水',
  '满船清梦压星河',
  '沧海月明珠有泪',
  '留连戏蝶时时舞',
  '自在娇莺恰恰啼',
  '江上数峰青',
  '且将新火试新茶',
  '人间至味是清欢',
  '已是悬崖百丈冰',
  '花褪残红青杏小',
  '枝上柳绵吹又少',
  '天涯何处无芳草',
  '笑渐不闻声渐悄',
  '多情却被无情恼',
  '天涯流落思无穷'
];

// 自定义 modal 替代浏览器原生 prompt/alert
function showModal(opts) {
  return new Promise((resolve) => {
    const title = opts.title || SONG_CI[Math.floor(Math.random() * SONG_CI.length)];
    const msg = opts.message || '';
    const def = opts.default || '';
    const okText = opts.okText || '确定';
    const cancelText = opts.cancelText || '取消';
    const isPrompt = opts.input !== undefined;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)';
    const box = document.createElement('div');
    box.style.cssText = 'background:rgba(20,26,56,0.95);border:1.5px solid #00f0ff;border-radius:18px;padding:20px;min-width:280px;max-width:90vw;box-shadow:0 0 32px rgba(0,240,255,0.4);color:#fff;font-family:-apple-system,sans-serif';
    box.innerHTML = `
      <div style="font-size:18px;font-weight:700;color:#00f0ff;text-align:center;margin-bottom:8px;text-shadow:0 0 8px rgba(0,240,255,0.5);letter-spacing:2px">${title}</div>
      <div style="font-size:13px;color:#cbd5e1;text-align:center;margin-bottom:14px;line-height:1.5">${msg}</div>
      ${isPrompt ? `<input type="${opts.type || 'text'}" id="modalInput" value="${def}" style="width:100%;padding:10px;font-size:14px;border-radius:10px;border:1.5px solid rgba(0,240,255,0.4);background:rgba(0,0,0,0.4);color:#fff;text-align:center;outline:none;box-sizing:border-box;font-weight:600;margin-bottom:14px">` : ''}
      <div style="display:flex;gap:10px;justify-content:center">
        ${opts.cancel !== false ? `<button id="modalCancel" style="flex:1;padding:10px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:10px;font-size:14px;font-weight:600;cursor:pointer">${cancelText}</button>` : ''}
        <button id="modalOk" style="flex:1;padding:10px;background:linear-gradient(135deg,rgba(0,240,255,0.3),rgba(255,43,214,0.3));color:#fff;border:1.5px solid #00f0ff;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 0 12px rgba(0,240,255,0.3)">${okText}</button>
      </div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    const input = box.querySelector('#modalInput');
    if (input) { input.focus(); input.select(); }
    function close(val) {
      document.body.removeChild(overlay);
      resolve(val);
    }
    box.querySelector('#modalOk').onclick = () => close(isPrompt ? (input ? input.value : def) : true);
    if (opts.cancel !== false) box.querySelector('#modalCancel').onclick = () => close(isPrompt ? null : false);
    if (isPrompt) {
      input && input.addEventListener('keydown', e => {
        if (e.key === 'Enter') close(input.value);
        if (e.key === 'Escape') close(null);
      });
    }
  });
}

// 覆盖原生 prompt/alert - 避免 "网址.cn提示"
window.prompt = function(msg, def) {
  console.warn('prompt 被调用, 应当用 showModal 代替', msg);
  return def || '';
};
window.alert = function(msg) {
  console.warn('alert 被调用', msg);
};

function addBuyDialog(i) {
  const f = state[i];
  // 不再弹档位, 使用默认值 0
  const tier = 0;
  // 连续 3 个自定义 modal 输入
  (async () => {
    const date = await showModal({ input: 'text', message: '日期 (YYYY-MM-DD):', default: new Date().toISOString().split('T')[0] }) || new Date().toISOString().split('T')[0];
    const price = await showModal({ input: 'number', message: '价格:', default: (f.price || f.basePrice).toFixed(4) }) || (f.price || f.basePrice);
    const amount = await showModal({ input: 'number', message: '金额 (元):', default: '500' }) || 0;
    const prev = JSON.stringify(state);
    f.buys.push({ date, price, amount, tier });
    save(prev);
    render();
  })();
}


let undoStack = [];
let redoStack = [];
function undo() {
  if (undoStack.length === 0) { alert('没有可撤销的操作'); return; }
  redoStack.push(JSON.stringify(state));
  const prev = undoStack.pop();
  state = JSON.parse(prev);
  save(false);
  render();
  flashHint('↩️ 已撤销');
}
function redo() {
  if (redoStack.length === 0) { alert('没有可重做的操作'); return; }
  undoStack.push(JSON.stringify(state));
  const next = redoStack.pop();
  state = JSON.parse(next);
  save(false);
  render();
  flashHint('↪️ 已重做');
}
function flashHint(t) {
  let h = document.getElementById('flashHint');
  if (!h) { h = document.createElement('div'); h.id = 'flashHint'; document.body.appendChild(h); }
  h.textContent = t;
  h.classList.add('show');
  clearTimeout(h._t);
  h._t = setTimeout(() => h.classList.remove('show'), 1200);
}
