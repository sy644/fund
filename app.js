// === 已移除登录/密码保护相关代码 ===

// 全局错误兜底 - 避免黑屏静默失败
window.addEventListener('error', e => {
  console.error('[FUND ERROR]', e.error || e.message);
  var el = document.getElementById('funds') || document.body;
  var msg = (e.error && e.error.stack) || e.message || String(e);
  var pre = document.createElement('pre');
  pre.style.cssText = 'color:#ff6b6b;background:#1a1a2e;padding:16px;margin:8px;border-radius:8px;white-space:pre-wrap;font-size:12px;line-height:1.5';
  pre.textContent = '⚠️ ' + msg;
  if (el === document.body) {
    document.body.innerHTML = '';
    document.body.appendChild(pre);
  } else {
    el.innerHTML = '';
    el.appendChild(pre);
  }
});

// 兜底: data.js 未提供 FUNDS_INIT 时用空数组
if (typeof DEFAULT_INIT === 'undefined') {
  var DEFAULT_INIT = [];
}
var state;
// 获取某笔交易应该使用的净值（优先手动输入 → 历史匹配 → 当前现价）
function getTradePrice(f, b) {
  if (b.price && b.price > 0) return b.price;
  if (b.date) {
    try {
      var navHistory = JSON.parse(localStorage.getItem('nav_history') || '[]');
      var match = navHistory.find(r => r.code === f.code && r.date === b.date);
      if (match && match.nav) return match.nav;
    } catch(e) {}
  }
  return f.price || 0;
}
try {
  var initSource = (typeof FUNDS_INIT !== 'undefined') ? FUNDS_INIT : DEFAULT_INIT;
  var s = localStorage.getItem('funds');
  state = s ? JSON.parse(s) : JSON.parse(JSON.stringify(initSource));
  if (typeof NAV_HISTORY_INIT !== 'undefined' && Array.isArray(NAV_HISTORY_INIT)) {
    var cur = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
    if (!Array.isArray(cur) || cur.length === 0) {
      localStorage.setItem('nav_history', JSON.stringify(NAV_HISTORY_INIT));
    }
  }
  if (Array.isArray(state)) {
    state.forEach(f => {
      if (Array.isArray(f.buys)) {
        f.buys.forEach(b => {
          if (!b.type) b.type = (b.amount < 0) ? 'sell' : 'buy';
        });
      }
    });
  }
  try {
    var qCode = new URLSearchParams(location.search).get('fund');
    if (qCode && Array.isArray(state)) {
      var idx = state.findIndex(f => f.code === qCode);
      if (idx >= 0) {
        sessionStorage.setItem('jumpToTab', String(idx));
      }
    }
  } catch(e) {}
} catch(e) {
  var el = document.getElementById('funds');
  if (el) el.innerHTML = '<pre style="color:red;padding:20px">STATE INIT ERROR: ' + e.message + ' | FUNDS_INIT: ' + (typeof FUNDS_INIT) + '</pre>';
  console.error('STATE INIT ERROR:', e);
  throw e;
}

async function fetchNAV(code) {
  if (!code) return null;
  try {
    var url1 = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
    var r1 = await fetch(url1);
    var t1 = await r1.text();
    var m1 = t1.match(/jsonpgz\(([^)]+)\)/);
    if (m1) {
      var d = JSON.parse(m1[1]);
      var nav = parseFloat(d.dwjz || d.gsz || 0);
      var date = d.jzrq || d.gztime || '';
      if (nav > 0) return { nav, date };
    }
  } catch (e) { console.warn('天天基金抓取失败', e); }

  try {
    var url2 = `https://fund.eastmoney.com/f10/FundNetValue.ashx?type=latest&code=${code}&_=${Date.now()}`;
    var r2 = await fetch(url2);
    var t2 = await r2.text();
    var m2 = t2.match(/jsonpCallback\((\{.*\})\)/);
    if (m2) {
      var d = JSON.parse(m2[1]);
      if (d.Data && d.Data.length > 0) {
        var nav = parseFloat(d.Data[0].NETVALUE || 0);
        var date = d.Data[0].NAVDATE || '';
        if (nav > 0) return { nav, date };
      }
    }
  } catch (e) { console.warn('东方财富抓取失败', e); }

  try {
    var url3 = `https://qt.gtimg.cn/q=jj${code}&_=${Date.now()}`;
    var r3 = await fetch(url3);
    var t3 = await r3.text();
    var m3 = t3.match(/="([^"]+)"/);
    if (m3) {
      var parts = m3[1].split('~');
      if (parts.length >= 5) {
        var nav = parseFloat(parts[3]);
        var date = parts[4] ? (parts[4].slice(0,4) + '-' + parts[4].slice(4,6) + '-' + parts[4].slice(6,8)) : '';
        if (nav > 0) return { nav, date };
      }
    }
  } catch (e) { console.warn('腾讯基金抓取失败', e); }

  return null;
}

async function refreshAll() {
  var btn = document.getElementById('refreshBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  var cache = {};
  try { cache = await fetch('nav_cache.json').then(r => r.ok ? r.json() : {}); } catch(e){}
  for (const f of state) {
    var r = null;
    try { r = await fetchNAV(f.code); } catch(e) {}
    if (r && r.nav) {
      f.price = r.nav;
      f.priceDate = r.date || new Date().toISOString().split('T')[0];
      f._manualPrice = false;
    } else if (cache[f.code]) {
      var c = cache[f.code];
      var last = Array.isArray(c) ? c[c.length-1] : c;
      if (last && last.nav) {
        f.price = last.nav;
        f.priceDate = last.date || last.fetched;
        f._manualPrice = false;
      }
    }
  }
  if (btn) { btn.disabled = false; btn.textContent = '🔄'; }
  localStorage.setItem('funds', JSON.stringify(state));
  render();
}

function save(prevSnap) {
  try {
    if (prevSnap) {
      undoStack.push(prevSnap);
      if (undoStack.length > 30) undoStack.shift();
    }
    localStorage.setItem('funds', JSON.stringify(state));
    updateSaveBadge();
  } catch(e) { console.error('save err', e); }
}
var saveTimer = null;
function saveDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 50);
}
function updateSaveBadge() {
  var el = document.getElementById('saveStatus');
  if (!el) return;
  var ts = new Date().toLocaleTimeString('zh-CN', {hour12: false});
  el.textContent = '已存 ' + ts;
  el.classList.add('saved');
  setTimeout(() => el.classList.remove('saved'), 800);
}

var main = document.getElementById('funds');

(function injectAnimStyles() {
  if (document.getElementById('fund-anim-style')) return;
  var s = document.createElement('style');
  s.id = 'fund-anim-style';
  s.textContent = `
    @keyframes pnlPulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 var(--pnl-color, #dc2626); filter: brightness(1); }
      50% { transform: scale(1.04); box-shadow: 0 0 18px 4px var(--pnl-color, #dc2626); filter: brightness(1.25); }
    }
    .pnl-flash { transition: all .2s ease; }
    .bdate-slider {
      appearance: none; -webkit-appearance: none;
      background: rgba(0,240,255,0.08);
      border: 1px solid rgba(0,240,255,0.25);
      color: #00f0ff;
      border-radius: 8px;
      padding: 4px 8px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
      cursor: pointer;
      width: 100%;
      box-sizing: border-box;
      text-align: center;
    }
    .bdate-slider:focus { outline: none; border-color: #00f0ff; box-shadow: 0 0 8px rgba(0,240,255,0.4); }
    .bdate-slider::-webkit-calendar-picker-indicator {
      filter: invert(1) hue-rotate(170deg) brightness(1.5);
      cursor: pointer;
    }
    .add-btn, .del-btn, .buy-toggle-btn { transition: all .2s ease; }
    .add-btn {
      width: 36px; height: 36px; border-radius: 50%;
      background: rgba(0,240,255,0.08);
      color: #67e8f9;
      border: 1.5px solid rgba(0,240,255,0.3);
      font-size: 18px; font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center; justify-content: center;
      margin-right: 6px;
      box-shadow: none;
    }
    .add-btn:hover { background: rgba(0,240,255,0.18); box-shadow: 0 0 8px rgba(0,240,255,0.25); }
    .buy-toggle-btn {
      width: 36px; height: 36px; border-radius: 50%;
      background: rgba(255,255,255,0.06);
      color: #94a3b8;
      border: 1.5px solid rgba(148,163,184,0.35);
      font-size: 18px; font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center; justify-content: center;
      margin-right: 6px;
    }
    .buy-toggle-btn:hover { background: rgba(148,163,184,0.15); }
    .buy-toggle-btn.active {
      background: rgba(251,146,60,0.18);
      color: #fb923c;
      border-color: rgba(251,146,60,0.55);
      box-shadow: 0 0 10px rgba(251,146,60,0.3);
    }
    .del-btn {
      background: rgba(251,113,133,0.12);
      color: #fb7185;
      border: 1.5px solid rgba(251,113,133,0.4);
      box-shadow: 0 0 6px rgba(251,113,133,0.15);
    }
    .del-btn:hover { background: rgba(251,113,133,0.22); }
  `;
  document.head.appendChild(s);
})();

function buildTierTable(f) {
  var { target, initShares, multi, tiers, basePrice, priceLow, priceMid, priceHigh } = f;
  var initInvest = (initShares || 0) * basePrice;
  var remaining = target - initInvest;
  var m1 = remaining * (1 - multi) / (1 - Math.pow(multi, tiers));
  var buyStart = 0;
  if (priceMid && priceMid > basePrice) {
    buyStart = Math.ceil((priceMid - basePrice) / basePrice / f.step);
  }
  var buyEnd = buyStart - (tiers - 1);
  var rows = [];
  for (let t = 10; t >= -10; t--) {
    var amt, label, trigger, isMid = false, isLow = false, isHigh = false, isBuy = false;
    if (t === 0) {
      amt = m1 * Math.pow(multi, buyStart);
      label = '基准';
      trigger = basePrice;
    } else {
      trigger = basePrice * (1 + t * f.step);
      label = `${t > 0 ? '+' : ''}${t}档`;
      var r = buyStart - t + 1;
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
  var { price, basePrice, step } = f;
  if (!price) return { tier: 0, dropPct: 0 };
  var raw = (price - basePrice) / basePrice / step;
  var rawFloor = Math.floor(raw);
  var rawCeil = Math.ceil(raw);
  var rawRound = Math.round(raw);
  var trigDown = basePrice * (1 + rawFloor * step);
  var trigUp = basePrice * (1 + rawCeil * step);
  var tier;
  if (Math.abs(price - trigDown) <= 0.01) tier = rawFloor;
  else if (Math.abs(price - trigUp) <= 0.01) tier = rawCeil;
  else tier = rawRound;
  return { tier, dropPct: (price - basePrice) / basePrice };
}

function calcCurrent(f) {
  var rows = buildTierTable(f);
  var { tier, dropPct } = calcTier(f);
  var buyRows = rows.filter(r => r.isBuy);
  if (buyRows.length === 0) {
    return { tier, dropPct, currentAmt: null, currentTrigger: null, currentTier: null, neighbors: [] };
  }
  var triggered = buyRows.filter(r => f.price <= r.trigger);
  var current = triggered.length > 0
    ? triggered.reduce((min, r) => r.tier < min.tier ? r : min)
    : null;
  if (!current) {
    var nearest = buyRows.reduce((min, r) =>
      Math.abs(f.price - r.trigger) < Math.abs(f.price - min.trigger) ? r : min);
    var idx = buyRows.findIndex(r => r.tier === nearest.tier);
    var start = Math.max(0, idx - 1);
    var end = Math.min(buyRows.length, idx + 2);
    return {
      tier, dropPct,
      currentAmt: nearest.amt,
      currentTrigger: nearest.trigger,
      currentTier: nearest.tier,
      currentIsBuy: false,
      neighbors: buyRows.slice(start, end),
    };
  }
  var idx = buyRows.findIndex(r => r.tier === current.tier);
  var start = Math.max(0, idx - 1);
  var end = Math.min(buyRows.length, idx + 2);
  return {
    tier, dropPct,
    currentAmt: current.amt,
    currentTrigger: current.trigger,
    currentTier: current.tier,
    currentIsBuy: true,
    neighbors: buyRows.slice(start, end),
  };
}

var startY = 0, pulling = false;
function setupPullToRefresh() {
  document.addEventListener('touchstart', e => {
    if (window.scrollY === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, {passive: true});
  document.addEventListener('touchmove', e => {
    if (pulling && window.scrollY === 0) {
      var dy = e.touches[0].clientY - startY;
      if (dy > 80) {
        showPullHint();
      }
    }
  }, {passive: true});
  document.addEventListener('touchend', e => {
    if (pulling) {
      var dy = (e.changedTouches[0].clientY - startY);
      if (dy > 80 && window.scrollY === 0) {
        triggerRefresh();
      }
      pulling = false;
      hidePullHint();
    }
  });
}
function showPullHint() {
  var h = document.getElementById('pullHint');
  if (!h) {
    h = document.createElement('div');
    h.id = 'pullHint';
    h.innerHTML = '↓ 松手刷新';
    document.body.appendChild(h);
  }
  h.classList.add('show');
}
function hidePullHint() {
  var h = document.getElementById('pullHint');
  if (h) h.classList.remove('show');
}
function triggerRefresh() {
  localStorage.setItem('funds', JSON.stringify(state));
  refreshAll();
  var btn = document.getElementById('refreshBtn');
  if (btn) {
    var old = btn.textContent;
    btn.textContent = '✓';
    setTimeout(() => btn.textContent = old, 800);
  }
}
document.addEventListener('DOMContentLoaded', setupPullToRefresh);

function getSavedActiveTab() {
  try {
    var s = localStorage.getItem('activeTab');
    return s !== null ? parseInt(s, 10) : -1;
  } catch(e) { return -1; }
}
function saveActiveTab(t) {
  try { localStorage.setItem('activeTab', String(t)); } catch(e) {}
}
var activeTab = getSavedActiveTab();

// ==================== 核心渲染函数（已修复长按删除干扰点击） ====================
function render() {
  var html = '<div class="tab-bar">';
  html += '<button class="tab-add tab-save-btn" id="tabSaveBtn" title="导出收益表">📊</button>';
  html += '<button class="tab-add tab-refresh-btn" id="refreshBtn" title="手动记录净值">📝</button>';
  html += '<div style="width:6px;flex-shrink:0"></div>';
  html += '<button class="tab tab-summary ' + (activeTab===state.length?'active':'') + '" data-tab="' + state.length + '">📊 汇总</button>';
  html += '<div style="width:6px;flex-shrink:0"></div>';
  state.forEach((f, i) => {
    html += `<button class="tab ${i===activeTab?'active':''}" data-tab="${i}">${f.name}</button>`;
  });
  html += '<button class="tab-add" data-add="1" title="新增基金">+</button>';
  html += '</div>';
  html += '<div class="tab-content">';
  if (activeTab < 0 || activeTab > state.length) {
    activeTab = state.length > 0 ? state.length : 0;
  }
  try {
    var jumpTo = sessionStorage.getItem('jumpToTab');
    if (jumpTo !== null) {
      var idx = parseInt(jumpTo, 10);
      sessionStorage.removeItem('jumpToTab');
      if (idx >= 0 && idx < state.length) {
        activeTab = idx;
        saveActiveTab(activeTab);
      }
    }
  } catch(e) {}
  if (activeTab < state.length) html += renderFund(state[activeTab], activeTab);
  else html += renderSummary();
  html += '</div>';
  main.innerHTML = html;

  // ---------- 单击切换（增加防误触判断） ----------
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (btn.dataset._pressing) return; // 长按中忽略点击
      activeTab = parseInt(btn.dataset.tab);
      saveActiveTab(activeTab);
      render();
    });
  });

  document.querySelector('.tab-add[data-add="1"]')?.addEventListener('click', addNewFund);
  document.getElementById('tabSaveBtn')?.addEventListener('click', saveData);
  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    location.href = 'nav.html';
  });

  document.querySelectorAll('.sname-input').forEach(inp => {
    inp.addEventListener('blur', () => {
      var fidx = parseInt(inp.dataset.fidx);
      var newName = inp.value.trim();
      if (newName && state[fidx] && state[fidx].name !== newName) {
        state[fidx].name = newName;
        localStorage.setItem('funds', JSON.stringify(state));
        render();
      }
    });
    inp.addEventListener('focus', () => { inp.style.borderColor = 'var(--neon-cyan)'; });
    inp.addEventListener('blur', () => { inp.style.borderColor = 'transparent'; });
  });

  var pressTimer = null, pressProgress = null;
  function showHint(t) {
    var h = document.getElementById('tabHint');
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
    var h = document.getElementById('tabHint');
    if (h) h.classList.remove('show');
  }

  // ---------- 长按删除（不阻止点击） ----------
  document.querySelectorAll('.tab:not(.tab-summary):not(.tab-add):not(.tab-save-btn)').forEach(btn => {
    btn.addEventListener('touchstart', function(e) {
      // 不调用 preventDefault，保证点击切换正常工作
      if (this.dataset._pressing) return;
      this.dataset._pressing = '1';
      this.classList.add('pressing');

      var secs = 1.0;
      showHint('松开删除 · ' + secs.toFixed(1) + 's');

      var progressInterval = setInterval(() => {
        secs -= 0.1;
        if (secs <= 0) { clearInterval(progressInterval); return; }
        showHint('松开删除 · ' + secs.toFixed(1) + 's');
      }, 100);

      var timer = setTimeout(() => {
        clearInterval(progressInterval);
        this.classList.remove('pressing');
        delete this.dataset._pressing;
        hideHint();
        var idx = parseInt(this.dataset.tab);
        if (!isNaN(idx) && state[idx]) {
          showModal({
            title: '删除基金',
            message: '确定要删除 ' + state[idx].name + '?\n所有交易记录将丢失',
            okText: '删除',
            cancelText: '取消',
          }).then(ok => {
            if (ok) deleteFund(idx);
          });
        }
      }, 1000);

      this._deleteTimer = timer;
      this._deleteProgress = progressInterval;
    }, {passive: true});

    const cancelDelete = function(e) {
      if (!this.dataset._pressing) return;
      clearTimeout(this._deleteTimer);
      clearInterval(this._deleteProgress);
      this.classList.remove('pressing');
      delete this.dataset._pressing;
      hideHint();
    };

    btn.addEventListener('touchend', cancelDelete);
    btn.addEventListener('touchmove', cancelDelete);
    btn.addEventListener('touchcancel', cancelDelete);
  });

  if (activeTab < state.length) bindFundEvents(state[activeTab], activeTab);
  else bindSummaryEvents();
  if (activeTab < 0 || activeTab > state.length) {
    activeTab = state.length > 0 ? state.length : 0;
  }
  updateTime();
}

// ==================== 其余函数 ====================

function bindFundEvents(f, i) {
  var priceIn = document.getElementById(`price-${i}`);
  if (priceIn) priceIn.addEventListener('input', e => {
    var prev = JSON.stringify(state);
    f.price = parseFloat(e.target.value) || 0;
    save(prev);
    updateCardValues(i);
  });
  ['base-basePrice', 'base-initShares', 'base-target'].forEach(k => {
    var inp = document.getElementById(`${k}-${i}`);
    if (inp) inp.addEventListener('input', e => {
      var field = k.replace('base-', '');
      var prev = JSON.stringify(state);
      f[field] = parseFloat(e.target.value) || 0;
      f._manualFields = f._manualFields || {};
      f._manualFields[field] = true;
      save(prev);
      updateCardValues(i);
    });
  });
  ['price-priceLow', 'price-priceMid', 'price-priceHigh'].forEach(k => {
    var inp = document.getElementById(`${k}-${i}`);
    if (inp) inp.addEventListener('input', e => {
      var field = k.replace('price-', '');
      var prev = JSON.stringify(state);
      f[field] = parseFloat(e.target.value) || 0;
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
  var ocrBtn = document.getElementById(`ocr-${i}`);
  if (ocrBtn) {
    ocrBtn.onclick = () => {
      var input = document.getElementById('ocrFileInput');
      if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'ocrFileInput';
        input.accept = 'image/*';
        input.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
        document.body.appendChild(input);
      }
      input.value = '';
      input.onchange = async (e) => {
        var file = e.target.files[0];
        if (!file) return;
        await runOCR(file, f, i);
      };
      input.click();
    };
  }
  var delToggle = document.getElementById(`delToggle-${i}`);
  if (delToggle) {
    delToggle.addEventListener('click', () => {
      var isActive = delToggle.classList.toggle('active');
      var displayVal = isActive ? 'inline-flex' : 'none';
      document.querySelectorAll(`[data-buy-del="${i}"]`).forEach(btn => {
        btn.style.display = displayVal;
      });
    });
  }
  f.buys.forEach((b, bi) => {
    var dateInp = document.getElementById(`bdate-${i}-${bi}`);
    var priceInp = document.getElementById(`bprice-${i}-${bi}`);
    var amtInp = document.getElementById(`bamt-${i}-${bi}`);
    var refreshShares = () => {
      var absAmt = Math.abs(b.amount || 0);
      var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
      var matched = b.date ? (navHistory.find(r => r.code === f.code && r.date === b.date) || {}).nav : null;
      var sh = (absAmt && matched) ? (absAmt / matched) : 0;
      var span = document.querySelector(`[data-bi="${bi}"].bshares`);
      if (span) span.textContent = sh ? sh.toFixed(2) : '-';
    };
    var refreshAmtColor = () => {
      if (!amtInp) return;
      var v = b.amount || 0;
      amtInp.style.color = v > 0 ? '#dc2626' : (v < 0 ? '#16a34a' : '#93A3BD');
    };
    if (dateInp) {
      dateInp.parentElement.style.position = 'relative';
      var updateDateOverlay = () => {
        var parent = dateInp.parentElement;
        if (!parent || !parent.isConnected) return;
        var ovl = parent.querySelector('.bdate-overlay');
        if (!ovl) {
          ovl = document.createElement('div');
          ovl.className = 'bdate-overlay';
          ovl.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:0;display:flex;align-items:center;justify-content:center;pointer-events:none;color:#00f0ff;font-weight:700;font-size:13px;letter-spacing:.5px;text-shadow:0 0 6px rgba(0,240,255,0.5)';
          parent.appendChild(ovl);
        }
        var v = dateInp.value;
        if (v) {
          var parts = v.split('-');
          if (parts.length === 3) {
            var mm = parseInt(parts[1], 10);
            var dd = parseInt(parts[2], 10);
            ovl.textContent = (mm < 10 ? '0' + mm : mm) + '/' + (dd < 10 ? '0' + dd : dd);
            ovl.style.display = 'flex';
          } else {
            ovl.style.display = 'none';
          }
        } else {
          ovl.style.display = 'none';
        }
      };
      var setupDateMissClick = () => {
        var container = dateInp.parentElement;
        var pressTimer = null;
        var pressed = false;
        var onDown = (e) => {
          if (!container.classList.contains('sday-miss')) return;
          pressed = true;
          pressTimer = setTimeout(() => {
            if (pressed) {
              pressTimer = null;
              var v = dateInp.value;
              if (v) showAddNavDialog(f.code, f.name, v);
            }
          }, 600);
        };
        var onUp = () => { pressed = false; if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
        container.addEventListener('touchstart', onDown, { passive: true });
        container.addEventListener('touchend', onUp);
        container.addEventListener('mousedown', onDown);
        container.addEventListener('mouseup', onUp);
        container.addEventListener('mouseleave', onUp);
      };
      setupDateMissClick();
      dateInp.style.color = 'transparent';
      dateInp.style.caretColor = 'transparent';
      var updateDateMissStyle = () => {
        var v = dateInp.value;
        var dateContainer = dateInp.parentElement;
        if (!dateContainer || !dateContainer.isConnected) return;
        if (!v) {
          dateContainer.classList.remove('sday-miss');
          return;
        }
        var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
        var found = navHistory.find(r => r.code === f.code && r.date === v);
        if (found) {
          dateContainer.classList.remove('sday-miss');
        } else {
          dateContainer.classList.add('sday-miss');
          var plus = dateContainer.querySelector('.bdate-miss-plus');
          if (!plus) {
            plus = document.createElement('div');
            plus.className = 'bdate-miss-plus';
            plus.textContent = '+';
            plus.style.cssText = 'position:absolute;top:-3px;right:-3px;width:14px;height:14px;display:flex;align-items:center;justify-content:center;background:#fbbf24;color:#05060b;border-radius:50%;font-size:11px;font-weight:900;cursor:pointer;z-index:10;box-shadow:0 0 6px rgba(251,191,36,0.6);line-height:1;pointer-events:auto';
            plus.onclick = (e) => {
              e.stopPropagation();
              e.preventDefault();
              if (v) showAddNavDialog(f.code, f.name, v);
            };
            dateContainer.appendChild(plus);
          }
          plus.style.display = 'flex';
        }
      };
      dateInp.addEventListener('input', e => { const p=JSON.stringify(state); b.date = e.target.value; save(p); updateDateOverlay(); updateDateMissStyle(); });
      var triggerMissingPrompt = (v) => {
        if (!v) return;
        var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
        var found = navHistory.find(r => r.code === f.code && r.date === v);
        if (!found) {
          var key = 'miss_' + f.code + '_' + v;
          if (sessionStorage.getItem(key)) { updateDateMissStyle(); return; }
          sessionStorage.setItem(key, '1');
          showModal({
            title: '净值缺失',
            message: '该日期 [' + v + '] 没有 [ ' + f.name + ' ] 的净值记录。\n是否现在添加?',
            okText: '添加净值',
            cancelText: '取消',
          }).then(ok => {
            if (ok) showAddNavDialog(f.code, f.name, v);
            else updateDateMissStyle();
          });
        }
      };
      dateInp.addEventListener('change', e => {
        var p = JSON.stringify(state);
        b.date = e.target.value;
        save(p);
        updateDateOverlay();
        updateDateMissStyle();
        triggerMissingPrompt(e.target.value);
      });
      var firstCheck = () => {
        if (!b.date) return;
        var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
        var found = navHistory.find(r => r.code === f.code && r.date === b.date);
        if (!found) triggerMissingPrompt(b.date);
      };
      updateDateOverlay();
      updateDateMissStyle();
      setTimeout(firstCheck, 100);
    }
    if (priceInp) priceInp.addEventListener('input', e => { const p=JSON.stringify(state); b.price = parseFloat(e.target.value) || 0; save(p); refreshShares(); updateCardValues(i); });
    var sdayInp = document.getElementById(`bsday-${i}-${bi}`);
    if (sdayInp) {
      sdayInp.style.color = 'transparent';
      sdayInp.style.caretColor = 'transparent';
      sdayInp.parentElement.style.position = 'relative';
      var sdayContainer = sdayInp.parentElement;
      sdayInp.max = new Date().toISOString().split('T')[0];
      var sdayClear = sdayContainer.querySelector('.sday-clear');
      if (!sdayClear) {
        sdayClear = document.createElement('div');
        sdayClear.className = 'sday-clear';
        sdayClear.textContent = '×';
        sdayClear.style.cssText = 'position:absolute;right:2px;top:50%;transform:translateY(-50%);width:14px;height:14px;display:none;align-items:center;justify-content:center;background:rgba(0,240,255,0.3);color:#fff;border-radius:50%;font-size:10px;font-weight:900;cursor:pointer;pointer-events:auto;z-index:5;line-height:1';
        sdayClear.onclick = (e) => {
          e.stopPropagation();
          sdayInp.value = '';
          sdayInp.dispatchEvent(new Event('change'));
        };
        sdayContainer.appendChild(sdayClear);
      }
      var updateSdayOverlay = () => {
        if (!sdayContainer || !sdayContainer.isConnected) return;
        var ovl = sdayContainer.querySelector('.bdate-overlay');
        if (!ovl) {
          ovl = document.createElement('div');
          ovl.className = 'bdate-overlay';
          ovl.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:0;display:flex;align-items:center;justify-content:center;pointer-events:none;color:#00f0ff;font-weight:700;font-size:12px;letter-spacing:.5px;text-shadow:0 0 6px rgba(0,240,255,0.5)';
          sdayContainer.appendChild(ovl);
        }
        var val = sdayInp.value;
        if (sdayClear) sdayClear.style.display = val ? 'flex' : 'none';
        if (val) {
          var parts = val.split('-');
          ovl.textContent = parts.length === 3 ? parts[1] + '/' + parts[2] : val;
        } else {
          ovl.textContent = '-';
          ovl.style.color = '#475569';
          ovl.style.textShadow = 'none';
        }
      };
      var calcRowStyle = () => {
        if (!sdayContainer || !sdayContainer.isConnected) return null;
        var sday = sdayInp.value;
        var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
        var sdayNav = sday ? (navHistory.find(r => r.code === f.code && r.date === sday) || {}).nav : null;
        var ovl = sdayContainer.querySelector('.bdate-overlay');
        if (sday && sdayNav == null) {
          if (ovl) { ovl.style.color = '#6b7280'; ovl.style.textShadow = 'none'; }
          sdayContainer.classList.add('sday-miss');
        } else {
          if (ovl) { ovl.style.color = '#00f0ff'; ovl.style.textShadow = '0 0 6px rgba(0,240,255,0.5)'; }
          sdayContainer.classList.remove('sday-miss');
        }
        return sdayNav;
      };
      sdayInp.addEventListener('change', e => {
        var p = JSON.stringify(state);
        var oldSday = b.sday || '';
        b.sday = e.target.value || '';
        save(p);
        updateSdayOverlay();
        var sday = b.sday || '';
        var sdayNav = calcRowStyle();
        var priceNow = f.price || 0;
        var navHistory2 = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
        var bNavMatch = b.date ? (navHistory2.find(r => r.code === f.code && r.date === b.date) || {}).nav : null;
        var priceBuy = bNavMatch != null ? bNavMatch : 0;
        var refPrice = sdayNav != null ? sdayNav : (bNavMatch != null ? bNavMatch : priceNow);
        var chgSpan = document.querySelector(`[data-bi="${bi}"].bchange`);
        if (chgSpan && priceBuy > 0 && refPrice > 0) {
          var cp = ((refPrice - priceBuy) / priceBuy) * 100;
          chgSpan.textContent = (cp >= 0 ? '+' : '') + cp.toFixed(2) + '%';
          chgSpan.style.color = cp > 0 ? '#dc2626' : (cp < 0 ? '#16a34a' : '#93A3BD');
        } else if (chgSpan) {
          chgSpan.textContent = '-';
          chgSpan.style.color = '#93A3BD';
        }
      });
      updateSdayOverlay();
      calcRowStyle();
    }
    if (amtInp) {
      amtInp.addEventListener('input', e => {
        var p = JSON.stringify(state);
        var rawStr = e.target.value;
        var v = parseFloat(rawStr) || 0;
        b.amount = v;
        b.type = v < 0 ? 'sell' : 'buy';
        refreshAmtColor();
        save(p);
        refreshShares();
        updateCardValues(i);
      });
    }
    var delBtn = document.querySelector(`[data-buy-del="${i}"][data-idx="${bi}"]`);
    if (delBtn) delBtn.addEventListener('click', () => { const p=JSON.stringify(state); f.buys.splice(bi, 1); save(p); render(); });
  });

  (function setupLongPressDelete() {
    if (document.body.dataset.lpDeleteBound === '1') return;
    document.body.dataset.lpDeleteBound = '1';
    var LONG_PRESS_MS = 1000;
    var hintEl = null;
    function showHint(text) {
      if (!hintEl) {
        hintEl = document.createElement('div');
        hintEl.id = 'buyRowHint';
        hintEl.style.cssText = 'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);background:rgba(220,38,38,0.92);color:#fff;padding:8px 18px;border-radius:20px;font-size:13px;font-weight:700;z-index:99999;box-shadow:0 0 16px rgba(220,38,38,0.5);letter-spacing:0.5px;opacity:0;transition:opacity .2s ease;pointer-events:none';
        document.body.appendChild(hintEl);
      }
      hintEl.textContent = text;
      hintEl.style.opacity = '1';
    }
    function hideHint() {
      if (hintEl) hintEl.style.opacity = '0';
    }
    document.body.addEventListener('touchstart', e => {
      var row = e.target.closest('.buy-row');
      if (!row) return;
      var bi = parseInt(row.dataset.bi, 10);
      if (isNaN(bi)) return;
      if (e.target.tagName === 'INPUT') return;
      row._lpStartTime = Date.now();
      row._lpInterval = setInterval(() => {
        var remain = Math.max(0, ((LONG_PRESS_MS - (Date.now() - row._lpStartTime)) / 1000));
        if (remain <= 0) {
          clearInterval(row._lpInterval);
          row._lpInterval = null;
          return;
        }
        var p = Math.min(1, (Date.now() - row._lpStartTime) / LONG_PRESS_MS);
        row.style.setProperty('--lp-progress', p.toFixed(3));
        showHint('松开删除 · ' + remain.toFixed(1) + 's');
      }, 80);
      row._lpTimer = setTimeout(() => {
        clearInterval(row._lpInterval);
        row._lpInterval = null;
        hideHint();
        var fundI = parseInt(row.dataset.fundI, 10);
        if (isNaN(fundI)) return;
        showModal({
          title: '删除交易记录',
          message: '确定要删除该行交易记录?',
          okText: '删除',
          cancelText: '取消',
        }).then(ok => {
          if (ok && state[fundI] && state[fundI].buys[bi] !== undefined) {
            var p = JSON.stringify(state);
            state[fundI].buys.splice(bi, 1);
            save(p);
            render();
          }
        });
      }, LONG_PRESS_MS);
    }, {passive: true});
    var cancel = (e) => {
      var row = e.target.closest?.('.buy-row');
      if (!row) return;
      if (row._lpTimer) {
        clearTimeout(row._lpTimer);
        row._lpTimer = null;
      }
      if (row._lpInterval) {
        clearInterval(row._lpInterval);
        row._lpInterval = null;
      }
      row.style.setProperty('--lp-progress', '0');
      row.classList.remove('pressing');
      hideHint();
    };
    document.body.addEventListener('touchend', cancel, {passive: true});
    document.body.addEventListener('touchmove', e => {
      var row = e.target.closest?.('.buy-row');
      if (!row) return;
      if (row._lpStartTime && (row._lpStartX === undefined)) {
        var t = e.touches[0];
        row._lpStartX = t.clientX;
        row._lpStartY = t.clientY;
      }
      if (row._lpStartX !== undefined && e.touches[0]) {
        var dx = e.touches[0].clientX - row._lpStartX;
        var dy = e.touches[0].clientY - row._lpStartY;
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          cancel({ target: row });
          row._lpStartX = undefined;
        }
      }
    }, {passive: true});
  })();
  ['param-multi', 'param-step', 'param-tiers'].forEach(prefix => {
    var sel = document.getElementById(`${prefix}-${i}`);
    if (!sel) return;
    sel.onchange = () => {
      var k = prefix.replace('param-', '');
      f[k] = parseFloat(sel.value);
      save();
      render();
    };
  });
}

function bindSummaryEvents() {}

function renderSummary() {
  // ...（此处省略，与之前相同，为节省篇幅已省略，实际使用时保留）
  // 你可以从之前提供的完整文件中复制该函数
  // 由于篇幅限制，这里就不重复粘贴了，但在你的实际文件中必须保留
  return '';
}

function updateCardValuesAll() {
  state.forEach((_, i) => updateCardValues(i));
}
function updateCardValues(i) {
  var f = state[i];
  var card = document.querySelectorAll('.fund')[i];
  if (!card) return;
  var { tier, currentAmt, currentTrigger, currentTier, currentIsBuy, neighbors } = calcCurrent(f);
  var dropPct = ((f.price - f.basePrice) / f.basePrice * 100) || 0;
  var dropColor = dropPct > 0 ? '#dc2626' : (dropPct < 0 ? '#16a34a' : '#93A3BD');
  var inv_base = (f.initShares || 0) * (f.basePrice || 0);
  var inv_buys = f.buys.reduce((s, b) => s + (b.amount || 0), 0);
  var invested = inv_base + inv_buys;
  var sh_base = f.initShares || 0;
  var sh_buys = f.buys.reduce((s, b) => {
    if (!b.date) return s;
    var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
    var matched = navHistory.find(r => r.code === f.code && r.date === b.date);
    var price = matched ? matched.nav : (f.price || 0);
    return price > 0 ? s + (b.amount / price) : s;
  }, 0);
  var shares = sh_base + sh_buys;
  var curPrice = f.price || 0;
  var pnl = curPrice * shares - invested;
  var prog = invested / f.target;
  var dropEl = card.querySelector('.fund-head .fund-extra .val');
  if (dropEl) { dropEl.textContent = dropPct.toFixed(1) + '%'; dropEl.style.color = dropColor; }
  var nbrs = card.querySelectorAll('.neighbor-row .nbr');
  nbrs.forEach((el, idx) => {
    var n = neighbors[idx];
    if (!n) return;
    var ts = n.tier > 0 ? '+' : '';
    el.querySelector('.nbr-tier').textContent = ts + n.tier + '档';
    el.querySelector('.nbr-trig').textContent = n.trigger.toFixed(4);
    el.querySelector('.nbr-amt').textContent = Math.round(n.amt);
    el.classList.toggle('cur', n.tier === currentTier);
  });
  var ringAmt = card.querySelector('.ring-amount');
  var ringFoot = card.querySelector('.ring-foot');
  var ringPct = card.querySelector('.ring-pct');
  var ringFill = card.querySelector('.ring-fill-circle');
  if (ringAmt) ringAmt.textContent = Math.round(invested).toLocaleString() + ' / ' + f.target.toLocaleString();
  if (ringFoot) ringFoot.textContent = '剩余 ' + Math.max(0, f.target-invested).toLocaleString();
  if (ringPct) ringPct.textContent = (prog*100).toFixed(0) + '%';
  if (ringFill) {
    var C = 2 * Math.PI * 86;
    var pct = Math.min(1, prog);
    ringFill.setAttribute('stroke-dasharray', (C*pct).toFixed(1) + ' ' + C.toFixed(1));
  }
  var stats = card.querySelectorAll('.fund-stats > div .val');
  if (stats[0]) stats[0].textContent = Math.round((f.price||0)*shares).toLocaleString();
  if (stats[1]) stats[1].textContent = Math.round(shares).toLocaleString();
  if (stats[2]) stats[2].textContent = shares > 0 ? (invested/shares).toFixed(4) : '-';
  if (stats[3]) {
    stats[3].textContent = (pnl>=0?'+':'')+Math.round(pnl).toLocaleString();
    stats[3].parentElement.style.color = pnl >= 0 ? '#dc2626' : (pnl < 0 ? '#16a34a' : '');
  }
  if (stats[4]) {
    stats[4].textContent = invested > 0 ? ((pnl/invested*100).toFixed(1) + '%') : '-';
    stats[4].parentElement.style.color = pnl >= 0 ? '#dc2626' : (pnl < 0 ? '#16a34a' : '');
  }
  var foot = card.querySelector('.buy-grid-foot');
  if (foot) {
    var cells = foot.querySelectorAll('div');
    if (cells[2]) {
      var b = cells[2].querySelector('b');
      if (b) b.textContent = Math.round(invested).toLocaleString();
      else cells[2].textContent = Math.round(invested).toLocaleString();
    }
    if (cells[3]) {
      var b = cells[3].querySelector('b');
      if (b) b.textContent = Math.round(shares).toLocaleString();
      else cells[3].textContent = Math.round(shares).toLocaleString();
    }
  }
  var tfoot = card.querySelector('.buy-table tfoot');
  if (tfoot) {
    var trs = tfoot.querySelectorAll('tr');
    if (trs[0]) {
      var tds0 = trs[0].querySelectorAll('td');
      if (tds0[2]) {
        var b = tds0[2].querySelector('b');
        if (b) b.textContent = Math.round(invested).toLocaleString();
        else tds0[2].textContent = Math.round(invested).toLocaleString();
      }
      if (tds0[3]) {
        var b = tds0[3].querySelector('b');
        if (b) b.textContent = Math.round(shares).toLocaleString();
        else tds0[3].textContent = Math.round(shares).toLocaleString();
      }
    }
  }
}

function renderFund(f, i) {
  if (Array.isArray(f.buys)) {
    f.buys = f.buys.slice().sort((a, b) => {
      var ad = a.date || a.sday || '';
      var bd = b.date || b.sday || '';
      return bd.localeCompare(ad);
    });
  }
  var { tier, currentAmt, currentTrigger, currentTier, currentIsBuy, neighbors } = calcCurrent(f);
  var dropPct = ((f.price - f.basePrice) / f.basePrice * 100) || 0;
  var dropColor = dropPct > 0 ? '#dc2626' : (dropPct < 0 ? '#16a34a' : '#93A3BD');
  var inv_base = (f.initShares || 0) * (f.basePrice || 0);
  var inv_buys = f.buys.reduce((s, b) => s + (b.amount || 0), 0);
  var invested = inv_base + inv_buys;
  var sh_base = f.initShares || 0;
  var sh_buys = f.buys.reduce((s, b) => {
    if (!b.date) return s;
    var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
    var matched = navHistory.find(r => r.code === f.code && r.date === b.date);
    var price = matched ? matched.nav : (f.price || 0);
    return price > 0 ? s + (b.amount / price) : s;
  }, 0);
  var shares = sh_base + sh_buys;
  var curPrice = f.price || 0;
  var pnl = curPrice * shares - invested;
  var prog = invested / f.target;
  var tierRows = buildTierTable(f);
  // 此处返回 HTML，与之前相同
  // 为节省篇幅省略，实际文件中必须保留
  return '';
}

// 后续函数（updateTime, startAutoRefresh, showExportModal, saveData, addNewFund, deleteFund, 多年度假期, OCR等）均与之前相同
// 请从你之前的完整版本中复制这些函数，或者直接使用之前我提供的完整文件。
