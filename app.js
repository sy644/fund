// === 完整 app.js（含增强净值图表） ===

// 全局错误兜底
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

// 兜底
if (typeof DEFAULT_INIT === 'undefined') { var DEFAULT_INIT = []; }
var state;
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
        f.buys.forEach(b => { if (!b.type) b.type = (b.amount < 0) ? 'sell' : 'buy'; });
      }
    });
  }
  try {
    var qCode = new URLSearchParams(location.search).get('fund');
    if (qCode && Array.isArray(state)) {
      var idx = state.findIndex(f => f.code === qCode);
      if (idx >= 0) sessionStorage.setItem('jumpToTab', String(idx));
    }
  } catch(e) {}
} catch(e) {
  var el = document.getElementById('funds');
  if (el) el.innerHTML = '<pre style="color:red;padding:20px">STATE INIT ERROR: ' + e.message + '</pre>';
  console.error('STATE INIT ERROR:', e);
  throw e;
}

// 辅助：短日期格式
function getShortDate() {
  var d = new Date();
  var y = String(d.getFullYear()).slice(2);
  var m = String(d.getMonth() + 1);
  var day = String(d.getDate());
  return y + '-' + m + '-' + day;
}

// 净值抓取
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
  if (btn) { btn.disabled = false; btn.textContent = '✍'; }
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
function updateSaveBadge() {
  var el = document.getElementById('saveStatus');
  if (!el) return;
  var ts = new Date().toLocaleTimeString('zh-CN', {hour12: false});
  el.textContent = '已存 ' + ts;
  el.classList.add('saved');
  setTimeout(() => el.classList.remove('saved'), 800);
}

var main = document.getElementById('funds');

// 注入样式
(function injectAnimStyles() {
  if (document.getElementById('fund-anim-style')) return;
  var s = document.createElement('style');
  s.id = 'fund-anim-style';
  s.textContent = `
    @keyframes pnlPulse { 0%,100% { transform:scale(1); box-shadow:0 0 0 0 var(--pnl-color,#dc2626); filter:brightness(1); } 50% { transform:scale(1.04); box-shadow:0 0 18px 4px var(--pnl-color,#dc2626); filter:brightness(1.25); } }
    .pnl-flash { transition: all .2s ease; }
    .bdate-slider { appearance:none; -webkit-appearance:none; background:rgba(0,240,255,0.08); border:1px solid rgba(0,240,255,0.25); color:#00f0ff; border-radius:8px; padding:4px 8px; font-size:13px; font-weight:700; letter-spacing:0.5px; cursor:pointer; width:100%; box-sizing:border-box; text-align:center; }
    .bdate-slider:focus { outline:none; border-color:#00f0ff; box-shadow:0 0 8px rgba(0,240,255,0.4); }
    .bdate-slider::-webkit-calendar-picker-indicator { filter:invert(1) hue-rotate(170deg) brightness(1.5); cursor:pointer; }
    .add-btn { width:36px; height:36px; border-radius:50%; background:rgba(0,240,255,0.08); color:#67e8f9; border:1.5px solid rgba(0,240,255,0.3); font-size:18px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; margin-right:6px; box-shadow:none; transition: all .2s ease; }
    .add-btn:hover { background:rgba(0,240,255,0.18); box-shadow:0 0 8px rgba(0,240,255,0.25); }
    .buy-row { position:relative; }
    .bc[data-mark="red"] { color:#fb7185; }
    .bc[data-mark="red"] .bcell,
    .bc[data-mark="red"] .bnav-readonly,
    .bc[data-mark="red"] .bshares { color:#fb7185; }
    .bc[data-mark="red"] .bdate-overlay { color:#fb7185; text-shadow:0 0 6px rgba(251,113,133,0.5); }
    .bc[data-mark="green"] { color:#22c55e; }
    .bc[data-mark="green"] .bcell,
    .bc[data-mark="green"] .bnav-readonly,
    .bc[data-mark="green"] .bshares { color:#22c55e; }
    .bc[data-mark="green"] .bdate-overlay { color:#22c55e; text-shadow:0 0 6px rgba(34,197,94,0.5); }
  `;
  document.head.appendChild(s);
})();

// 档位表构建
function buildTierTable(f) {
  var { target, initShares, multi, tiers, basePrice, priceLow, priceMid, priceHigh } = f;
  var initInvest = (initShares || 0) * basePrice;
  var remaining = target - initInvest;
  var m1 = remaining * (1 - multi) / (1 - Math.pow(multi, tiers));
  var buyStart = 0;
  if (priceMid && priceMid > basePrice) {
    buyStart = Math.ceil((priceMid - basePrice) / basePrice / f.step);
  }
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
    rows.push({ tier: t, label, amt, trigger, isMid, isLow, isHigh, isBuy, buyStart });
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

// 下拉刷新
var startY = 0, pulling = false;
function setupPullToRefresh() {
  document.addEventListener('touchstart', e => { if (window.scrollY === 0) { startY = e.touches[0].clientY; pulling = true; } }, {passive: true});
  document.addEventListener('touchmove', e => { if (pulling && window.scrollY === 0) { var dy = e.touches[0].clientY - startY; if (dy > 80) showPullHint(); } }, {passive: true});
  document.addEventListener('touchend', e => { if (pulling) { var dy = e.changedTouches[0].clientY - startY; if (dy > 80 && window.scrollY === 0) triggerRefresh(); pulling = false; hidePullHint(); } });
}
function showPullHint() { var h = document.getElementById('pullHint') || (function(){ var el=document.createElement('div'); el.id='pullHint'; el.innerHTML='↓ 松手刷新'; document.body.appendChild(el); return el; })(); h.classList.add('show'); }
function hidePullHint() { var h = document.getElementById('pullHint'); if (h) h.classList.remove('show'); }
function triggerRefresh() { localStorage.setItem('funds', JSON.stringify(state)); refreshAll(); var btn = document.getElementById('refreshBtn'); if (btn) { var old = btn.textContent; btn.textContent='✓'; setTimeout(()=>btn.textContent='✍', 800); } }
document.addEventListener('DOMContentLoaded', setupPullToRefresh);

function getSavedActiveTab() { try { var s = localStorage.getItem('activeTab'); return s !== null ? parseInt(s,10) : -1; } catch(e){ return -1; } }
function saveActiveTab(t) { try { localStorage.setItem('activeTab', String(t)); } catch(e){} }
var activeTab = getSavedActiveTab();

// ==================== 主渲染函数 ====================
function render() {
  var html = '<div class="tab-content">';
  if (activeTab < 0 || activeTab > state.length) {
    activeTab = state.length > 0 ? state.length : 0;
  }
  try {
    var jumpTo = sessionStorage.getItem('jumpToTab');
    if (jumpTo !== null) {
      var idx = parseInt(jumpTo, 10);
      sessionStorage.removeItem('jumpToTab');
      if (idx >= 0 && idx < state.length) { activeTab = idx; saveActiveTab(activeTab); }
    }
  } catch(e) {}
  if (activeTab < state.length) html += renderFund(state[activeTab], activeTab);
  else html += renderSummary();
  html += '</div>';
  // 底部 dock
  html += '<div class="dock-bar">';
  html += '<button class="dock-icon-only" id="refreshBtn" title="单击刷新·双击记录">✍</button>';
  html += '<span class="dock-sep"></span>';
  html += '<button class="tab tab-summary ' + (activeTab===state.length?'active':'') + '" data-tab="' + state.length + '">汇总</button>';
  state.forEach((f, i) => {
    html += `<button class="tab ${i===activeTab?'active':''}" data-tab="${i}">${f.name}</button>`;
  });
  html += '<button class="tab-add" data-add="1" title="新增基金">+</button>';
  html += '</div>';
  // 滚轮选择器
  html += '<div class="wheel-mask" id="wheelMask">';
  html += '  <div class="wheel-sheet">';
  html += '    <div class="wheel-header">';
  html += '      <div class="wheel-title" id="wheelTitle">选择数值</div>';
  html += '      <button class="wheel-close" id="wheelClose">关闭</button>';
  html += '    </div>';
  html += '    <div class="wheel-body" id="wheelBody"></div>';
  html += '    <div class="wheel-footer">';
  html += '      <button class="wheel-btn cancel" id="wheelCancel">取消</button>';
  html += '      <button class="wheel-btn ok" id="wheelOk">确定</button>';
  html += '    </div>';
  html += '  </div>';
  html += '</div>';
  main.innerHTML = html;

  // 单击切换
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (btn.dataset._pressing) return;
      activeTab = parseInt(btn.dataset.tab);
      saveActiveTab(activeTab);
      render();
    });
  });

  document.querySelector('.tab-add[data-add="1"]')?.addEventListener('click', addNewFund);

  let refreshClickTimer = null;
  document.getElementById('refreshBtn')?.addEventListener('click', function(e) {
    if (refreshClickTimer) {
      clearTimeout(refreshClickTimer);
      refreshClickTimer = null;
      location.href = 'nav.html';
      return;
    }
    refreshClickTimer = setTimeout(() => {
      refreshAll();
      refreshClickTimer = null;
    }, 300);
  });

  document.getElementById('summaryExportBtn')?.addEventListener('click', showExportMenu);
  document.getElementById('summaryImportBtn')?.addEventListener('click', function() {
    var input = document.getElementById('importFileInput');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'importFileInput';
      input.accept = '.json,application/json';
      input.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
      document.body.appendChild(input);
    }
    input.value = '';
    input.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      importData(file);
    };
    input.click();
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

  function showHint(t) {
    var h = document.getElementById('tabHint');
    if (!h) { h = document.createElement('div'); h.id='tabHint'; h.className='tab-hint'; document.body.appendChild(h); }
    h.textContent = t;
    h.classList.add('show');
  }
  function hideHint() {
    var h = document.getElementById('tabHint');
    if (h) h.classList.remove('show');
  }

  // 长按删除
  document.querySelectorAll('.tab:not(.tab-summary):not(.tab-add):not(.tab-save-btn)').forEach(btn => {
    btn.addEventListener('touchstart', function(e) {
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
          }).then(ok => { if (ok) deleteFund(idx); });
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

  // 绘制净值图（传入 buys）
  if (activeTab < state.length) {
    var f = state[activeTab];
    setTimeout(function() {
      drawNavChart(f.code, 'navChart-' + activeTab, '1M', f.buys);
    }, 100);
  }

  document.querySelectorAll(".range-track").forEach(updateRangeTrack);
}

// ==================== 跑道 ====================
function updateRangeTrack(track) {
  var low = parseFloat(track.dataset.low) || 0;
  var mid = parseFloat(track.dataset.mid) || 0;
  var high = parseFloat(track.dataset.high) || 0;
  var now = parseFloat(track.dataset.now) || 0;
  if (low >= high) return;
  var midVal = (low + high) / 2;
  var midPct = (mid - low) / (high - low) * 100;
  var midValPct = (midVal - low) / (high - low) * 100;
  var nowPct = (now - low) / (high - low) * 100;
  track.style.setProperty("--mid-pct", midPct.toFixed(2) + "%");
  track.style.setProperty("--midval-pct", midValPct.toFixed(2) + "%");
  track.style.setProperty("--now-pct", nowPct.toFixed(2) + "%");
  var midLine = track.querySelector(".range-mid-line");
  var midvalLine = track.querySelector(".range-midval-line");
  if (midLine) midLine.style.left = midPct + "%";
  if (midvalLine) midvalLine.style.left = midValPct + "%";
  var fcode = track.dataset.code;
  var f = null;
  if (fcode && typeof state !== "undefined") {
    f = state.find(function(x) { return x.code === fcode; });
  }
  var rate = 0;
  if (f) {
    var invested = (f.initShares || 0) * (f.basePrice || 0) + (f.buys || []).reduce(function(s, b) { return s + (b.amount || 0); }, 0);
    var shares = (f.initShares || 0) + (f.buys || []).reduce(function(s, b) {
      if (!b.date) return s;
      try {
        var navHistory = JSON.parse(localStorage.getItem("nav_history") || "[]");
        var matched = navHistory.find(function(r) { return r.code === f.code && r.date === b.date; });
        var pnav = matched ? matched.nav : (f.price || 0);
        return pnav > 0 ? s + (b.amount / pnav) : s;
      } catch(e) { return s; }
    }, 0);
    if (invested > 0) rate = (now * shares - invested) / invested * 100;
  }
  var ratePct = Math.max(0, Math.min(100, Math.abs(rate)));
  track.style.setProperty("--rate-pct", ratePct.toFixed(2) + "%");
  var runner = track.querySelector(".runner");
  if (runner) {
    if (rate < 0) runner.classList.add("negative");
    else runner.classList.remove("negative");
    runner.classList.remove("running-fast", "running-slow", "walking-back", "running-flee");
    var emoji = runner.querySelector(".runner-emoji");
    var dust = runner.querySelector(".runner-dust");
    if (rate >= 20) {
      runner.classList.add("running-fast");
      if (emoji) emoji.textContent = "🤑";
      if (dust) dust.textContent = "💎";
    } else if (rate >= 10) {
      runner.classList.add("running-fast");
      if (emoji) emoji.textContent = "🥳";
      if (dust) dust.textContent = "✨";
    } else if (rate >= 5) {
      runner.classList.add("running-slow");
      if (emoji) emoji.textContent = "😎";
      if (dust) dust.textContent = "💪";
    } else if (rate >= 0) {
      runner.classList.add("running-slow");
      if (emoji) emoji.textContent = "😐";
      if (dust) dust.textContent = "";
    } else if (rate >= -5) {
      runner.classList.add("walking-back");
      if (emoji) emoji.textContent = "😟";
      if (dust) dust.textContent = "";
    } else if (rate >= -10) {
      runner.classList.add("walking-back");
      if (emoji) emoji.textContent = "😱";
      if (dust) dust.textContent = "💧";
    } else {
      runner.classList.add("running-flee");
      if (emoji) emoji.textContent = "💀";
      if (dust) dust.textContent = "☠️";
    }
    track.querySelectorAll(".range-tree").forEach(function(tree) {
      var leftPct = parseFloat(tree.style.left) || 0;
      if (Math.abs(rate) >= leftPct) tree.classList.add("reached");
      else tree.classList.remove("reached");
    });
  }
}

// ==================== 滚轮选择器 ====================
var WHEEL_ITEM_H = 44;
var wheelState = { target: null, cols: [] };

function openWheel(input) {
  if (!input) return;
  wheelState.target = input;
  var kind = input.dataset.wheelKind || 'price';
  var init = parseFloat(input.value) || 0;
  if (init < 0) init = 0;
  var cols;
  if (kind === 'price') {
    cols = [
      { label: '元', base: 1,     max: 5 },
      { label: '.',  base: 0.1,   max: 9 },
      { label: '',   base: 0.01,  max: 9 },
      { label: '',   base: 0.001, max: 9 },
      { label: '',   base: 0.0001, max: 9 }
    ];
    var intPart = Math.floor(init);
    var fracPart = Math.round((init - intPart) * 10000);
    cols[0].curVal = Math.min(5, intPart);
    cols[1].curVal = Math.floor(fracPart / 1000) % 10;
    cols[2].curVal = Math.floor(fracPart / 100) % 10;
    cols[3].curVal = Math.floor(fracPart / 10) % 10;
    cols[4].curVal = fracPart % 10;
  } else {
    cols = [
      { label: '万', base: 10000, max: 9 },
      { label: '千', base: 1000,  max: 9 },
      { label: '百', base: 100,   max: 9 },
      { label: '十', base: 10,    max: 9 },
      { label: '个', base: 1,     max: 9 }
    ];
    var iv = Math.floor(init);
    cols[0].curVal = Math.floor(iv / 10000) % 10;
    cols[1].curVal = Math.floor(iv / 1000) % 10;
    cols[2].curVal = Math.floor(iv / 100) % 10;
    cols[3].curVal = Math.floor(iv / 10) % 10;
    cols[4].curVal = iv % 10;
  }
  var title = '选择数值';
  var prev = input.previousElementSibling;
  if (prev && prev.classList && prev.classList.contains('lbl')) {
    title = prev.textContent || title;
  } else if (input.parentElement) {
    var lbl = input.parentElement.querySelector('.lbl');
    if (lbl) title = lbl.textContent;
  }
  var titleEl = document.getElementById('wheelTitle');
  if (titleEl) titleEl.textContent = title;
  renderWheelCols(cols);
  var mask = document.getElementById('wheelMask');
  if (mask) mask.classList.add('show');
}

function renderWheelCols(cols) {
  var body = document.getElementById('wheelBody');
  if (!body) return;
  body.innerHTML = '';
  wheelState.cols = cols.map(function(c) {
    var col = document.createElement('div');
    col.className = 'wheel-col';
    var fTop = document.createElement('div'); fTop.className = 'wheel-fade top';
    var fBot = document.createElement('div'); fBot.className = 'wheel-fade bot';
    var hl = document.createElement('div'); hl.className = 'wheel-highlight';
    col.appendChild(fTop); col.appendChild(fBot); col.appendChild(hl);
    var track = document.createElement('div');
    track.className = 'wheel-track';
    for (var i = 0; i <= c.max; i++) {
      var it = document.createElement('div');
      it.className = 'wheel-item';
      it.textContent = i + (c.label || '');
      it.dataset.val = i;
      track.appendChild(it);
    }
    col.appendChild(track);
    body.appendChild(col);
    var cObj = { col: col, track: track, curVal: c.curVal, base: c.base, max: c.max };
    track.style.transform = 'translateY(' + (-c.curVal * WHEEL_ITEM_H) + 'px)';
    updateWheelCurStyle(track, c.curVal);
    bindWheelCol(cObj);
    return cObj;
  });
}

function updateWheelCurStyle(track, curVal) {
  var items = track.querySelectorAll('.wheel-item');
  items.forEach(function(it, i) {
    it.classList.toggle('cur', i === curVal);
  });
}

function bindWheelCol(cObj) {
  var c = cObj.col;
  var track = cObj.track;
  var dragging = false, startY = 0, startOff = 0, lastY = 0, lastT = 0, vel = 0;
  function getOff() {
    var m = (track.style.transform || '').match(/-?[\d.]+/);
    return m ? parseFloat(m[0]) : 0;
  }
  function snap() {
    track.style.transition = 'transform 0.25s cubic-bezier(0.25, 1, 0.35, 1)';
    var off = getOff();
    var idx = Math.round(-off / WHEEL_ITEM_H);
    idx = Math.max(0, Math.min(cObj.max, idx));
    cObj.curVal = idx;
    track.style.transform = 'translateY(' + (-idx * WHEEL_ITEM_H) + 'px)';
    updateWheelCurStyle(track, idx);
  }
  function start(y) {
    dragging = true;
    startY = y; startOff = getOff();
    lastY = y; lastT = Date.now(); vel = 0;
    track.style.transition = 'none';
  }
  function move(y) {
    if (!dragging) return;
    var dy = y - startY;
    var off = startOff + dy;
    var minOff = -(cObj.max * WHEEL_ITEM_H);
    var maxOff = 0;
    if (off > maxOff + 50) off = maxOff + 50 + (off - maxOff - 50) * 0.3;
    if (off < minOff - 50) off = minOff - 50 + (off - minOff + 50) * 0.3;
    track.style.transform = 'translateY(' + off + 'px)';
    var now = Date.now();
    var dt = now - lastT;
    if (dt > 0) vel = (y - lastY) / dt;
    lastY = y; lastT = now;
  }
  function end() {
    if (!dragging) return;
    dragging = false;
    var off = getOff();
    off += vel * 150;
    track.style.transition = 'transform 0.26s cubic-bezier(0.25, 1, 0.35, 1)';
    track.style.transform = 'translateY(' + off + 'px)';
    setTimeout(snap, 270);
  }
  c.addEventListener('touchstart', function(e) { var t = e.touches[0]; start(t.clientY); e.preventDefault(); }, { passive: false });
  c.addEventListener('touchmove', function(e) { var t = e.touches[0]; move(t.clientY); e.preventDefault(); }, { passive: false });
  c.addEventListener('touchend', end);
  c.addEventListener('touchcancel', end);
  var md = false;
  c.addEventListener('mousedown', function(e) { md = true; start(e.clientY); e.preventDefault(); });
  window.addEventListener('mousemove', function(e) { if (md) move(e.clientY); });
  window.addEventListener('mouseup', function() { if (md) { md = false; end(); } });
}

function getWheelValue() {
  var total = 0;
  wheelState.cols.forEach(function(c) { total += c.curVal * c.base; });
  return total;
}

function closeWheel(ok) {
  var mask = document.getElementById('wheelMask');
  if (mask) mask.classList.remove('show');
  if (!ok || !wheelState.target) return;
  var v = getWheelValue();
  var inp = wheelState.target;
  var kind = inp.dataset.wheelKind || 'price';
  inp.value = (kind === 'price') ? v.toFixed(4) : String(Math.round(v));
  inp.dispatchEvent(new Event('input', { bubbles: true }));
}

function bindWheelGlobalEvents() {
  if (window._wheelBound) return;
  window._wheelBound = true;
  document.addEventListener('click', function(e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains('click-wheel')) {
      openWheel(t);
    }
  });
  var okBtn = document.getElementById('wheelOk');
  var cancelBtn = document.getElementById('wheelCancel');
  var closeBtn = document.getElementById('wheelClose');
  var mask = document.getElementById('wheelMask');
  if (okBtn) okBtn.addEventListener('click', function() { closeWheel(true); });
  if (cancelBtn) cancelBtn.addEventListener('click', function() { closeWheel(false); });
  if (closeBtn) closeBtn.addEventListener('click', function() { closeWheel(false); });
  if (mask) mask.addEventListener('click', function(e) { if (e.target === mask) closeWheel(false); });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindWheelGlobalEvents);
} else {
  bindWheelGlobalEvents();
}

// =====================================================================
//  OCR 解析 - 交易记录 & 净值
// =====================================================================
function parseBuyRecords(text) {
  var lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  var rows = [];
  var reDate = /(20\d{2})[\-\/年.](\d{1,2})[\-\/月.](\d{1,2})/;
  var reTime = /(\d{1,2}):(\d{2})(?::(\d{2}))?/;
  var reAmount = /(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/;

  for (let i = 0; i < lines.length; i++) {
    var line = lines[i];
    var prev1 = lines[i-1] || '', prev2 = lines[i-2] || '';
    var next1 = lines[i+1] || '', next2 = lines[i+2] || '';

    var dm = line.match(reDate);
    if (!dm) continue;
    var date = `${dm[1]}-${dm[2].padStart(2,'0')}-${dm[3].padStart(2,'0')}`;

    var time = null;
    var tm = line.match(reTime);
    if (tm) time = `${tm[1].padStart(2,'0')}:${tm[2]}:${tm[3] || '00'}`;
    else {
      var tm2 = next1.match(reTime);
      if (tm2) time = `${tm2[1].padStart(2,'0')}:${tm2[2]}:${tm2[3] || '00'}`;
    }
    if (!time) continue;

    var amount = null;
    for (const src of [prev1, line, next1, next2]) {
      var am = src.match(reAmount);
      if (am) {
        var v = parseFloat(am[1].replace(/,/g, ''));
        if (v >= 0.01 && v < 10000000) {
          amount = v;
          break;
        }
      }
    }
    if (amount == null) continue;

    var ctx = [prev2, prev1, line, next1, next2].join(' ');
    var isSell = /卖出|赎回|售出|卖入|卖购|redeem|sell/i.test(ctx);
    var type = isSell ? 'sell' : 'buy';

    rows.push({ date, time, amount, type });
  }
  return rows;
}

function parseNavRecords(text) {
  var lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  var records = [];
  var re = /(20\d{2})[\-\/.](\d{1,2})[\-\/.](\d{1,2})\s+([\d.]+)/;
  for (var line of lines) {
    var m = line.match(re);
    if (m) {
      var date = m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
      var nav = parseFloat(m[4]);
      if (!isNaN(nav) && nav > 0) {
        records.push({ date, nav });
      }
    }
  }
  return records;
}

// =====================================================================
//  交易绑定
// =====================================================================
function bindFundEvents(f, i) {
  var priceIn = document.getElementById(`price-${i}`);
  if (priceIn) {
    priceIn.addEventListener('input', e => {
      var prev = JSON.stringify(state);
      f.price = parseFloat(e.target.value) || 0;
      save(prev);
      updateCardValues(i);
    });
  }
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
    addBuyByAmountDialog(i);
  });
  document.getElementById(`subBuy-${i}`)?.addEventListener('click', () => {
    subBuyBySharesDialog(i);
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
    var shareInp = document.getElementById(`bshare-${i}-${bi}`);

    var refreshShares = () => {
      if (b._shares != null) {
        var span = document.querySelector(`[data-bi="${bi}"].bshares`);
        if (span) span.textContent = Math.abs(b._shares).toFixed(2);
        return;
      }
      var absAmt = Math.abs(b.amount || 0);
      var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
      var matched = b.date ? (navHistory.find(r => r.code === f.code && r.date === b.date) || {}).nav : null;
      var sh = (absAmt && matched) ? (absAmt / matched) : 0;
      var span = document.querySelector(`[data-bi="${bi}"].bshares`);
      if (span) span.textContent = sh ? sh.toFixed(2) : '-';
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
          ovl.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:0;display:flex;align-items:center;justify-content:center;pointer-events:none;color:inherit;font-weight:700;font-size:13px;letter-spacing:.5px;text-shadow:0 0 6px rgba(0,240,255,0.5)';
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
      dateInp.addEventListener('change', e => {
        var p = JSON.stringify(state);
        b.date = e.target.value;
        save(p);
        updateDateOverlay();
        updateDateMissStyle();
        if (b.type === 'buy' && amtInp) {
          amtInp.dispatchEvent(new Event('input'));
        } else if (b.type === 'sell' && shareInp) {
          shareInp.dispatchEvent(new Event('input'));
        }
      });
      var firstCheck = () => {
        if (!b.date) return;
        var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
        var found = navHistory.find(r => r.code === f.code && r.date === b.date);
        if (!found) {
          var key = 'miss_' + f.code + '_' + b.date;
          if (sessionStorage.getItem(key)) { updateDateMissStyle(); return; }
          sessionStorage.setItem(key, '1');
          showModal({
            title: '净值缺失',
            message: '该日期 [' + b.date + '] 没有 [ ' + f.name + ' ] 的净值记录。\n是否现在添加?',
            okText: '添加净值',
            cancelText: '取消',
          }).then(ok => {
            if (ok) showAddNavDialog(f.code, f.name, b.date);
            else updateDateMissStyle();
          });
        }
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
        b.sday = e.target.value || '';
        save(p);
        updateSdayOverlay();
        calcRowStyle();
        var chgSpan = document.querySelector(`[data-bi="${bi}"].bchange`);
        if (chgSpan) {
          var navHistory2 = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
          var sdayNav2 = b.sday ? (navHistory2.find(r => r.code === f.code && r.date === b.sday) || {}).nav : null;
          var buyNav = b.price || (b.date ? (navHistory2.find(r => r.code === f.code && r.date === b.date) || {}).nav : 0);
          if (buyNav > 0 && sdayNav2 > 0) {
            var cp = ((sdayNav2 - buyNav) / buyNav) * 100;
            chgSpan.textContent = (cp >= 0 ? '+' : '') + cp.toFixed(2) + '%';
            chgSpan.style.color = cp > 0 ? '#dc2626' : (cp < 0 ? '#16a34a' : '#93A3BD');
          } else {
            chgSpan.textContent = '-';
            chgSpan.style.color = '#93A3BD';
          }
        }
      });
      updateSdayOverlay();
      calcRowStyle();
    }

    // 买入金额 input
    if (amtInp) {
      amtInp.addEventListener('input', function(e) {
        var v = parseFloat(e.target.value) || 0;
        if (v < 0) { v = Math.abs(v); e.target.value = v; }
        if (v === 0) return;
        var prev = JSON.stringify(state);
        b.amount = v;
        b.type = 'buy';
        var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
        var matched = b.date ? navHistory.find(r => r.code === f.code && r.date === b.date) : null;
        var nav = matched ? matched.nav : 0;
        if (nav > 0) {
          b._shares = v / nav;
        } else {
          b._shares = 0;
        }
        save(prev);
        updateCardValues(i);
        var sharesSpan = document.querySelector(`[data-bi="${bi}"].bshares`);
        if (sharesSpan) {
          sharesSpan.textContent = (b._shares && b._shares > 0) ? b._shares.toFixed(2) : '-';
        }
        e.target.style.color = '#dc2626';
      });
    }

    // 卖出份额 input
    if (shareInp) {
      shareInp.addEventListener('input', function(e) {
        var sh = parseFloat(e.target.value) || 0;
        if (sh < 0) { sh = Math.abs(sh); e.target.value = sh; }
        if (sh === 0) return;
        var prev = JSON.stringify(state);
        b._shares = -sh;
        b.type = 'sell';
        var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
        var matched = b.date ? navHistory.find(r => r.code === f.code && r.date === b.date) : null;
        var nav = matched ? matched.nav : 0;
        if (nav > 0) {
          b.amount = -sh * nav;
        } else {
          b.amount = 0;
        }
        save(prev);
        updateCardValues(i);
        var amtDisplay = e.target.closest('.buy-row').querySelector('.amt-readonly');
        if (amtDisplay) {
          amtDisplay.textContent = (b.amount && b.amount !== 0) ? Math.round(Math.abs(b.amount)).toLocaleString() : '-';
        }
        e.target.style.color = '#22c55e';
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
        hintEl.style.cssText = 'position:fixed;left:50%;bottom:120px;background:rgba(220,38,38,0.92);color:#fff;padding:8px 18px;border-radius:20px;font-size:13px;font-weight:700;z-index:99999;box-shadow:0 0 16px rgba(220,38,38,0.5);letter-spacing:0.5px;opacity:0;transition:opacity .2s ease;pointer-events:none';
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

// ==================== 汇总页 ====================
function renderSummary() {
  var html = '<div class="fund" style="border-top: 4px solid #FFD700">';
  html += '<div class="summary-title" style="display:flex;justify-content:space-between;align-items:center;">';
  html += '<span>📊 投资汇总</span>';
  html += '<div style="display:flex;gap:8px;">';
  html += '<button class="dock-icon-only" id="summaryExportBtn" title="导出数据">📤</button>';
  html += '<button class="dock-icon-only" id="summaryImportBtn" title="导入数据">📁</button>';
  html += '</div></div>';
  var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
  var totalInv=0, totalVal=0, totalTgt=0, totalShares=0;
  var stats = state.map(f => {
    var initShares = f.initShares || 0;
    var basePrice = f.basePrice || 0;
    var curPrice = f.price || 0;
    var target = f.target || 0;
    var inv = (initShares * basePrice) + f.buys.reduce((s,b)=>s+(b.amount||0),0);
    var sh_buys = f.buys.reduce((s, b) => {
      if (!b.date) return s;
      var matched = navHistory.find(r => r.code === f.code && r.date === b.date);
      var price = matched ? matched.nav : (f.price || 0);
      return price > 0 ? s + (b.amount / price) : s;
    }, 0);
    var sh = initShares + sh_buys;
    var mv = curPrice * sh;
    var pnl = mv-inv;
    var rate = inv>0 ? (pnl/inv*100) : 0;
    var pHigh = parseFloat(f.priceHigh) || 0;
    var drawdown = (pHigh > 0 && curPrice > 0) ? ((curPrice - pHigh) / pHigh * 100) : 0;
    var dropPct = drawdown;
    var prog = f.target>0 ? (inv/f.target*100) : 0;
    totalInv += inv; totalVal += mv; totalTgt += f.target; totalShares += sh;
    return { f, inv, sh, mv, pnl, rate, dropPct, drawdown, prog };
  });
  var totalPnl = totalVal - totalInv;
  var totalRate = totalInv>0 ? (totalPnl/totalInv*100).toFixed(2) : '0';
  var pnlCol = totalPnl >= 0 ? '#dc2626' : '#16a34a';
  html += '<div class="summary-big">';
  html += '<div class="sb-stat"><span>总投入</span><b>' + Math.round(totalInv).toLocaleString() + '</b></div>';
  html += '<div class="sb-stat"><span>总市值</span><b>' + Math.round(totalVal).toLocaleString() + '</b></div>';
  html += '<div class="sb-stat"><span>总收益</span><b style="color:' + pnlCol + '">' + (totalPnl>=0?'+':'') + Math.round(totalPnl).toLocaleString() + '</b></div>';
  html += '<div class="sb-stat"><span>总收益率</span><b style="color:' + pnlCol + '">' + totalRate + '%</b></div>';
  html += '<div class="sb-stat"><span>完成度</span><b>' + (totalTgt>0?(totalInv/totalTgt*100).toFixed(1):'0') + '%</b></div>';
  html += '<div class="sb-stat"><span>总份额</span><b>' + Math.round(totalShares).toLocaleString() + '</b></div>';
  html += '</div>';

  html += '<div class="section-title">📋 各品种明细</div>';
  html += '<div class="sum-table-wrap"><table class="buy-table"><thead><tr><th>品种</th><th>现价</th><th>回撤</th><th>金额</th><th>份额</th><th>收益</th><th>收益率</th><th>投入</th><th>完成度</th></tr></thead><tbody>';
  stats.forEach(s => {
    var pc = s.pnl >= 0 ? '#dc2626' : '#16a34a';
    var dc = s.drawdown < -10 ? '#16a34a' : (s.drawdown < 0 ? '#4ade80' : '#93A3BD');
    var dropStr = s.drawdown.toFixed(1) + '%';
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

  html += '<div class="section-title">💡 投资建议 (' + stats.length + ')</div>';
  html += '<div class="advice-list">';
  stats.forEach(s => {
    var { f, inv, sh, mv, pnl, rate, drawdown, prog } = s;
    var { currentIsBuy, currentAmt, currentTier, currentTrigger } = calcCurrent(f);
    var tierSign = currentTier > 0 ? '+' : '';
    var dropStr = drawdown.toFixed(1) + '%';
    var dropColor = drawdown < -10 ? '#16a34a' : (drawdown < 0 ? '#4ade80' : '#93A3BD');
    var pnlSign = pnl >= 0 ? '+' : '';
    var pnlColor = pnl > 0 ? '#dc2626' : (pnl < 0 ? '#16a34a' : '#93A3BD');
    var adv = '', opClass = 'normal', actionIcon = '💤', actionLabel = '观望';
    if (currentIsBuy) {
      opClass = 'urgent'; actionIcon = '🔴'; actionLabel = '补仓';
      adv = tierSign + currentTier + ' 档已触发, 补 ' + Math.round(currentAmt) + ' 元';
    } else if (currentTrigger && (currentTrigger - f.price) > 0 && (currentTrigger - f.price) < 0.05) {
      opClass = 'pending'; actionIcon = '⏳'; actionLabel = '关注';
      adv = '距 ' + tierSign + currentTier + ' 档仅 ' + (currentTrigger-f.price).toFixed(4);
    } else if (currentTier !== null && currentTier !== undefined && currentTier < 0) {
      opClass = 'normal'; actionIcon = '👀'; actionLabel = '持有';
      adv = '已跌 ' + tierSign + currentTier + ' 档, 待触发';
    } else if (currentTier > 0) {
      opClass = 'good'; actionIcon = '✋'; actionLabel = '上涨';
      adv = '上涨 ' + tierSign + currentTier + ' 档';
    } else {
      opClass = 'normal'; actionIcon = '💤'; actionLabel = '基准';
      adv = '现价 ≈ 基准';
    }
    html += '<div class="advice-card ' + opClass + '">';
    html += '<div class="ac-head">';
    html += '<span class="ac-name">' + f.name + '</span>';
    html += '<span class="ac-action"><span class="ac-icon">' + actionIcon + '</span><span class="ac-label">' + actionLabel + '</span></span>';
    html += '</div>';
    html += '<div class="ac-body">';
    html += '<div class="ac-left">';
    html += '<div class="ac-price">' + f.price.toFixed(4) + '</div>';
    html += '<div class="ac-pct" style="color:' + pnlColor + '">' + pnlSign + Math.round(pnl).toLocaleString() + ' (' + rate.toFixed(1) + '%)</div>';
    html += '<div class="ac-drop" style="color:' + dropColor + '">回撤 ' + dropStr + '</div>';
    html += '</div>';
    html += '<div class="ac-right">';
    html += '<div class="ac-advice">' + adv + '</div>';
    html += '<div class="ac-meta">';
    html += '<span>投入 ' + Math.round(inv).toLocaleString() + '</span>';
    html += '<span>份额 ' + Math.round(sh).toLocaleString() + '</span>';
    html += '</div></div>';
    html += '</div>';
    html += '<div class="ac-progress"><div class="ac-prog-fill" style="width:' + Math.min(100, prog) + '%"></div><span class="ac-prog-text">完成 ' + prog.toFixed(0) + '%</span></div>';
    html += '</div>';
  });
  var triggers = stats.filter(s => {
    var { currentIsBuy } = calcCurrent(s.f);
    return currentIsBuy;
  });
  html += '<div class="advice-card total">';
  html += '<div class="ac-head"><span class="ac-name">📊 综合判断</span><span class="ac-action">' + (triggers.length > 0 ? '⚡ 立即行动' : '✅ 静观其变') + '</span></div>';
  html += '<div class="ac-body">';
  if (triggers.length > 0) {
    html += '<div class="ac-row"><span>触发</span><b style="color:#dc2626">' + triggers.length + ' 只基金已触发加仓</b></div>';
    var totalAdd = 0;
    triggers.forEach(s => {
      var { currentAmt } = calcCurrent(s.f);
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

function updateCardValues(i) {
  var f = state[i];
  var card = document.querySelectorAll('.fund')[i];
  if (!card) return;
  var { tier, currentAmt, currentTrigger, currentTier, currentIsBuy, neighbors } = calcCurrent(f);
  var pHighU = parseFloat(f.priceHigh) || 0;
  var curU = parseFloat(f.price) || 0;
  var dropPct = (pHighU > 0 && curU > 0) ? ((curU - pHighU) / pHighU * 100) : (((f.price - f.basePrice) / f.basePrice * 100) || 0);
  var dropColor = dropPct < -10 ? '#16a34a' : (dropPct < 0 ? '#4ade80' : '#93A3BD');
  var inv_base = 0;
  var inv_buys = f.buys.reduce((s, b) => s + (b.amount || 0), 0);
  var invested = inv_base + inv_buys;
  var sh_base = 0;
  var sh_buys = f.buys.reduce((s, b) => {
    if (b._shares != null) return s + b._shares;
    if (!b.date) return s;
    var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
    var matched = navHistory.find(r => r.code === f.code && r.date === b.date);
    var price = matched ? matched.nav : (b.price || f.price || 0);
    return price > 0 ? s + (b.amount / price) : s;
  }, 0);
  var shares = sh_base + sh_buys;
  var navHistory = (() => { try { return JSON.parse(localStorage.getItem("nav_history") || "[]"); } catch(e) { return []; }})();
  var totalPnl = (f.buys || []).reduce(function(s, b) {
    if (!b.sday || b.sday === "") return s;
    var sdayRecord = navHistory.find(function(r) { return r.code === f.code && r.date === b.sday; });
    if (!sdayRecord || sdayRecord.nav == null) return s;
    var buyNav = b.price;
    if (buyNav == null || buyNav <= 0) {
      var bdayRecord = navHistory.find(function(r) { return r.code === f.code && r.date === b.date; });
      buyNav = bdayRecord ? bdayRecord.nav : 0;
    }
    if (buyNav <= 0) return s;
    return s + (b.amount || 0) * (sdayRecord.nav - buyNav) / buyNav;
  }, 0);
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
      if (b) b.textContent = Math.round(inv_buys).toLocaleString();
      else cells[2].textContent = Math.round(inv_buys).toLocaleString();
    }
    if (cells[3]) {
      var b = cells[3].querySelector('b');
      if (b) b.textContent = Math.round(sh_buys).toLocaleString();
      else cells[3].textContent = Math.round(sh_buys).toLocaleString();
    }
  }
  var tfoot = card.querySelector('.buy-table tfoot');
  if (tfoot) {
    var trs = tfoot.querySelectorAll('tr');
    if (trs[0]) {
      var tds0 = trs[0].querySelectorAll('td');
      if (tds0[2]) {
        var b = tds0[2].querySelector('b');
        if (b) b.textContent = Math.round(inv_buys).toLocaleString();
        else tds0[2].textContent = Math.round(inv_buys).toLocaleString();
      }
      if (tds0[3]) {
        var b = tds0[3].querySelector('b');
        if (b) b.textContent = Math.round(sh_buys).toLocaleString();
        else tds0[3].textContent = Math.round(sh_buys).toLocaleString();
      }
    }
  }
}

// =====================================================================
//  renderFund（包含净值走势图及周期选择）
// =====================================================================
function renderFund(f, i) {
  if (Array.isArray(f.buys)) {
    f.buys = f.buys.slice().sort((a, b) => {
      var ad = a.date || a.sday || '';
      var bd = b.date || b.sday || '';
      return bd.localeCompare(ad);
    });
  }
  var { tier, currentAmt, currentTrigger, currentTier, currentIsBuy, neighbors } = calcCurrent(f);
  var pHigh = parseFloat(f.priceHigh) || 0;
  var curPrice0 = parseFloat(f.price) || 0;
  var dropPct;
  if (pHigh > 0 && curPrice0 > 0) {
    dropPct = (curPrice0 - pHigh) / pHigh * 100;
  } else {
    dropPct = ((f.price - f.basePrice) / f.basePrice * 100) || 0;
  }
  var dropColor = dropPct < -10 ? '#16a34a' : (dropPct < 0 ? '#4ade80' : '#93A3BD');
  var inv_base = (f.initShares || 0) * (f.basePrice || 0);
  var inv_buys = f.buys.reduce((s, b) => s + (b.amount || 0), 0);
  var invested = inv_base + inv_buys;
  var sh_base = f.initShares || 0;
  var sh_buys = f.buys.reduce((s, b) => {
    if (b._shares != null) return s + b._shares;
    if (!b.date) return s;
    var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
    var matched = navHistory.find(r => r.code === f.code && r.date === b.date);
    var price = matched ? matched.nav : (f.price || 0);
    return price > 0 ? s + (b.amount / price) : s;
  }, 0);
  var shares = sh_base + sh_buys;
  var navHistory = (() => { try { return JSON.parse(localStorage.getItem("nav_history") || "[]"); } catch(e) { return []; }})();
  var totalPnl = (f.buys || []).reduce(function(s, b) {
    if (!b.sday || b.sday === "") return s;
    var sdayRecord = navHistory.find(function(r) { return r.code === f.code && r.date === b.sday; });
    if (!sdayRecord || sdayRecord.nav == null) return s;
    var buyNav = b.price;
    if (buyNav == null || buyNav <= 0) {
      var bdayRecord = navHistory.find(function(r) { return r.code === f.code && r.date === b.date; });
      buyNav = bdayRecord ? bdayRecord.nav : 0;
    }
    if (buyNav <= 0) return s;
    return s + (b.amount || 0) * (sdayRecord.nav - buyNav) / buyNav;
  }, 0);
  var curPrice = f.price || 0;
  var pnl = curPrice * shares - invested;
  var prog = invested / f.target;
  var tierRows = buildTierTable(f);

  var buyRowsHtml = f.buys.map((b, bi) => {
    var realAmt = b.amount || 0;
    var isSell = (b.amount < 0) || (b.type === 'sell');
    var displayAmt = Math.abs(realAmt);
    var navHistoryLocal = (() => {
      try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); }
      catch(e) { return []; }
    })();
    var sday = b.sday || '';
    var sdayNav = sday ? (navHistoryLocal.find(r => r.code === f.code && r.date === sday) || {}).nav : null;
    var bNavMatch = b.date ? (navHistoryLocal.find(r => r.code === f.code && r.date === b.date) || {}).nav : null;
    var priceBuy = bNavMatch != null ? bNavMatch : 0;
    var hasSdayMatch = !!(sday && sdayNav != null);
    var refPrice = hasSdayMatch ? sdayNav : curPrice;
    var changePct = null;
    var changeColor = '#93A3BD';
    if (priceBuy > 0 && refPrice > 0) {
      changePct = ((refPrice - priceBuy) / priceBuy) * 100;
      changeColor = changePct > 0 ? '#dc2626' : (changePct < 0 ? '#16a34a' : '#93A3BD');
    }
    var sdayMiss = !!(sday && sdayNav == null);
    var dateShort = '';
    if (b.date) {
      var parts = b.date.split('-');
      if (parts.length === 3) {
        var mm = parseInt(parts[1], 10);
        var dd = parseInt(parts[2], 10);
        dateShort = (mm < 10 ? '0' + mm : mm) + '/' + (dd < 10 ? '0' + dd : dd);
      } else {
        dateShort = b.date;
      }
    }
    var sdayShort = '';
    if (sday) {
      var parts2 = sday.split('-');
      if (parts2.length === 3) sdayShort = parts2[1] + '/' + parts2[2];
      else sdayShort = sday;
    }

    var amtHtml, shareHtml;
    if (isSell) {
      var shareVal = (b._shares != null) ? Math.abs(b._shares) : 0;
      amtHtml = `<span class="amt-readonly" style="color:inherit;font-weight:700">${displayAmt ? Math.round(displayAmt).toLocaleString() : '-'}</span>`;
      shareHtml = `<input type="number" step="0.01" id="bshare-${i}-${bi}" value="${shareVal ? shareVal.toFixed(2) : ''}" class="bcell" style="width:100%;font-weight:700;color:#22c55e">`;
    } else {
      var shareVal = (b._shares != null) ? b._shares : 0;
      amtHtml = `<input type="number" step="1" id="bamt-${i}-${bi}" value="${displayAmt ? Math.round(displayAmt) : ''}" class="bcell amt-pos" style="width:100%;color:#dc2626">`;
      shareHtml = `<span class="bshares" data-bi="${bi}" style="color:inherit;font-size:13px;font-weight:700">${shareVal ? shareVal.toFixed(2) : '-'}</span>`;
    }

    return `
      <div class="buy-row" data-bi="${bi}" data-fund-i="${i}">
        <div class="buy-row-inner">
          <div class="bc bc-pill bc-date ${b.date && !navHistoryLocal.find(r => r.code === f.code && r.date === b.date) ? 'sday-miss' : ''}" data-mark="${b._mark || ''}">
            <input type="date" id="bdate-${i}-${bi}" value="${b.date||''}" data-short="${dateShort}" class="bcell bdate-slider">
          </div>
          <div class="bc bc-pill bc-nav ${!bNavMatch ? 'sday-miss' : ''}" id="bnavwrap-${i}-${bi}" data-mark="${b._mark || ''}">
            ${bNavMatch != null ? `<span class="bnav-readonly" data-bi="${bi}" style="color:inherit;font-size:12px;font-weight:700;font-family:monospace">${bNavMatch.toFixed(4)}</span>` : '<span class="bnav-readonly" style="color:inherit;font-size:11px;font-weight:600">无匹配</span>'}
          </div>
          <div class="bc bc-pill" data-mark="${b._mark || ''}">
            ${amtHtml}
          </div>
          <div class="bc bc-pill" data-mark="${b._mark || ''}">
            ${shareHtml}
          </div>
          <div class="bc bc-pill"><span class="bchange" data-bi="${bi}" style="color:${changeColor};font-size:12px;font-weight:700">${changePct === null ? '-' : (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%'}</span></div>
          <div class="bc bc-pill bc-sday ${sday && sdayNav == null ? 'sday-miss' : ''}">
            <input type="date" id="bsday-${i}-${bi}" value="${sday}" max="${new Date().toISOString().split('T')[0]}" data-short="${sdayShort}" class="bcell bdate-slider" data-bi="${bi}" data-fund-i="${i}">
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="fund" style="border-top: 4px solid ${f.color}">
      <div class="fund-head">
        <div class="fund-name-pill">
          <div class="pill-name">${f.name}</div>
          <div class="pill-code">${f.code}</div>
        </div>
        <div class="fund-price-pill">
          <div class="pill-lbl">现价</div>
          <input type="number" step="0.0001" id="price-${i}" value="${(f.price||0).toFixed(4)}" class="price-input" data-fidx="${i}">
        </div>
        <div class="fund-extra-pill">
          <div class="pill-lbl">回撤</div>
          <div class="pill-val" style="color:${dropColor}">${dropPct.toFixed(1)}%</div>
        </div>
      </div>
      <div class="neighbor-section">
        ${(() => {
          var ns = neighbors || [];
          if (ns.length === 0) return '';
          return `<div class="nb-hbar">
            ${ns.map(n => {
              var ts = n.tier > 0 ? '+' : '';
              var isCur = n.tier === currentTier;
              return `<div class="nb-hseg ${isCur ? 'cur' : ''}">
                <div class="nb-tier-tag">${ts}${n.tier}档</div>
                <div class="nb-hlabel">${n.trigger.toFixed(4)} 加仓 ${Math.round(n.amt)}</div>
              </div>`;
            }).join('')}
          </div>`;
        })()}
      </div>
      ${(() => {
        var pLow = parseFloat(f.priceLow) || 0;
        var pMid = parseFloat(f.priceMid) || 0;
        var pHigh = parseFloat(f.priceHigh) || 0;
        var pNow = parseFloat(f.price) || 0;
        if (pLow > 0 && pHigh > pLow && pMid > 0 && pMid < pHigh) {
          var total = Math.max(20, (f.tiers || 10) * 2);
          var lowFrac = (pLow - pLow) / (pHigh - pLow);
          var midFrac = (pMid - pLow) / (pHigh - pLow);
          var nowFrac = (pNow - pLow) / (pHigh - pLow);
          lowFrac = Math.max(0, Math.min(1, lowFrac));
          midFrac = Math.max(0, Math.min(1, midFrac));
          nowFrac = Math.max(0, Math.min(1, nowFrac));
          var nowCell = Math.round(nowFrac * (total - 1));
          var midCell = Math.round(midFrac * (total - 1));
          var chars = [];
          for (var k = 0; k < total; k++) {
            if (k === total - 1) chars.push('☀');
            else if (k === nowCell && k === midCell) chars.push('●');
            else if (k === nowCell) chars.push('●');
            else {
              if (k < nowCell) chars.push('♥');
              else chars.push('♡');
            }
          }
          var bar = chars.join('');
          var nowPct = (nowFrac * 100).toFixed(1);
          var nowColor = pNow <= pMid ? 'var(--neon-green)' : 'var(--neon-orange)';
          var distLow = ((pNow - pLow) / pLow * 100).toFixed(1);
          var distMid = ((pNow - pMid) / pMid * 100).toFixed(1);
          var distHigh = ((pNow - pHigh) / pHigh * 100).toFixed(1);
          return `
            <div class="range-bar-section">
              <div class="section-title" style="display:flex;align-items:center;justify-content:space-between">
                <span>🏃 收益率跑道</span>
                <span style="font-size:10px;color:var(--text-dim);font-weight:500;letter-spacing:0.5px">
                  低 ${pLow.toFixed(4)} · 中 ${pMid.toFixed(4)} · 高 ${pHigh.toFixed(4)}
                </span>
              </div>
              <div class="range-track"
                   data-low="${pLow}" data-mid="${pMid}" data-high="${pHigh}" data-now="${pNow}"
                   data-init-shares="${f.initShares}" data-base-price="${f.basePrice}" data-code="${f.code}">
                <div class="range-clouds">
                  <span class="cloud cloud-1">☁️</span>
                  <span class="cloud cloud-2">⛅</span>
                  <span class="cloud cloud-3">☁️</span>
                  <span class="cloud cloud-4">🌥️</span>
                  <span class="cloud cloud-5">☁️</span>
                  <span class="cloud cloud-6">⛅</span>
                </div>
                <div class="range-lane"></div>
                <div class="range-mid-line"></div>
                <div class="range-midval-line"></div>
                <div class="range-ticks">
                  <span class="range-tree" style="left:10%"><span class="tree-emoji">🌱</span></span>
                  <span class="range-tree" style="left:20%"><span class="tree-emoji">🌿</span></span>
                  <span class="range-tree" style="left:30%"><span class="tree-emoji">🌳</span></span>
                  <span class="range-tree" style="left:50%"><span class="tree-emoji">🌲</span></span>
                </div>
                <div class="price-star">
                  <span class="star-arrow">△</span>
                  <span class="star-label">${pNow.toFixed(4)}</span>
                </div>
                <div class="runner">
                  <span class="runner-emoji">🏃</span>
                  <span class="runner-dust">💨</span>
                </div>
                <span class="range-end range-end-start">低</span>
                <span class="range-end range-end-end">高</span>
              </div>
            </div>
          `;
        }
        return '';
      })()}
      <div class="ring-section">
        <div class="ring-center">
          ${(() => {
            var pct = Math.min(1, prog);
            var C = 2 * Math.PI * 86;
            var filled = C * pct;
            var ca = pct >= 1 ? '#16a34a' : '#00e5ff';
            var cb = pct >= 1 ? '#39ff14' : '#39ff14';
            var ringId = 'rg_' + i + '_' + Date.now();
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
        <div class="hold-side">
          <div class="ps-item"><span class="lbl">持有金额</span><span class="hold-side-val">${((f.price||0)*shares).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></div>
          <div class="ps-item"><span class="lbl">持有份额</span><span class="hold-side-val">${shares.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></div>
          <div class="ps-item"><span class="lbl">持仓成本</span><span class="hold-side-val">${shares > 0 ? (invested/shares).toFixed(4) : '-'}</span></div>
          <div class="ps-item pnl-flash" style="background:${pnl>=0?'rgba(220,38,38,0.18)':(pnl<0?'rgba(22,163,74,0.18)':'transparent')}"><span class="lbl" style="color:#93A3BD">持有收益</span><span class="hold-side-val" style="color:${pnl>=0?'#dc2626':'#16a34a'};font-weight:900">${(pnl>=0?'+':'')+Math.round(pnl).toLocaleString()}</span></div>
          <div class="ps-item pnl-flash" style="background:${pnl>=0?'rgba(220,38,38,0.18)':(pnl<0?'rgba(22,163,74,0.18)':'transparent')}"><span class="lbl" style="color:#93A3BD">持有收益率</span><span class="hold-side-val" style="color:${pnl>=0?'#dc2626':'#16a34a'};font-weight:900">${invested > 0 ? ((pnl/invested*100).toFixed(2) + '%') : '-'}</span></div>
        </div>
      </div>
      <div class="buy-section">
        <div class="section-title">
          交易记录
          <div class="buy-btns">
            <button class="add-btn" id="subBuy-${i}" title="录入份额(卖出)">−</button>
            <button class="add-btn" id="undo-${i}" title="撤销">‹‹</button>
            <button class="add-btn" id="redo-${i}" title="重做">››</button>
            <button class="add-btn" id="ocr-${i}" title="识图录入">📷</button>
            <button class="add-btn" id="addBuy-${i}" title="录入金额(买入)">+</button>
          </div>
        </div>
        <div class="buy-table-wrap">
          <div class="buy-grid-head"><div>Bday</div><div>净值</div><div>金额</div><div>份额</div><div>涨幅</div><div>Sday</div></div>
          <div class="buy-grid-body">
            ${buyRowsHtml}
          </div>
          <div class="buy-grid-foot">
            <div class="bf-label"><b>合计</b></div>
            <div></div>
            <div><b>${Math.round(inv_buys).toLocaleString()}</b></div>
            <div><b>${Math.round(sh_buys).toLocaleString()}</b></div>
            <div class="bf-pnl" style="color:${totalPnl >= 0 ? '#39ff14' : '#fb7185'};font-weight:900">${totalPnl >= 0 ? '+' : ''}${Math.round(totalPnl).toLocaleString()}</div>
            <div></div>
          </div>
        </div>
      </div>

      <div class="tier-section">
        <div class="section-title">档位金额表</div>
        <div class="tier-grid">
          ${(() => {
            var left = tierRows.filter(r => r.tier >= 0).sort((a, b) => b.tier - a.tier);
            var right = tierRows.filter(r => r.tier < 0).sort((a, b) => b.tier - a.tier);
            var maxLen = Math.max(left.length, right.length);
            var renderRow = (r) => {
              if (!r) return '<div class="tier-row empty"></div>';
              var cls = '';
              if (r.tier === tier) cls = 'current-tier';
              else if (r.tier === 0) cls = 'base-tier';
              else if (r.isBuy) cls = 'buy-tier';
              if (r.isMid) cls += ' mid-tier';
              return `<div class="tier-row ${cls}">
                <span class="t-label">${r.label}${r.isMid ? ' ⭐' : ''}</span>
                <span class="t-trigger">${r.trigger ? r.trigger.toFixed(4) : '-'}</span>
                <span class="t-amt">${r.amt === null ? '-' : Math.round(r.amt).toLocaleString()}</span>
              </div>`;
            };
            var html = '';
            for (let i = 0; i < maxLen; i++) {
              html += renderRow(left[i]);
              html += renderRow(right[i]);
            }
            return html;
          })()}
        </div>
      </div>

      <!-- 净值走势图（带周期选择） -->
      <div class="chart-section" style="margin: 12px 0; height: 180px; max-height: 200px; overflow: hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span class="section-title" style="font-size:14px;">📈 净值走势</span>
          <div style="display:flex; gap:6px; font-size:11px;">
            <button class="chart-period" data-period="1M" style="background:rgba(0,240,255,0.2); border:1px solid #00f0ff; border-radius:4px; padding:2px 8px; color:#fff; cursor:pointer;">1月</button>
            <button class="chart-period" data-period="3M" style="background:transparent; border:1px solid rgba(255,255,255,0.2); border-radius:4px; padding:2px 8px; color:#93A3BD; cursor:pointer;">3月</button>
            <button class="chart-period" data-period="1Y" style="background:transparent; border:1px solid rgba(255,255,255,0.2); border-radius:4px; padding:2px 8px; color:#93A3BD; cursor:pointer;">1年</button>
          </div>
        </div>
        <canvas id="navChart-${i}" style="width:100%; height:100%;"></canvas>
      </div>

      <div class="param-section">
        <div class="section-title">参数设置</div>
        <div class="param-grid-table">
          <div class="param-grid-row">
            <div class="ps-item"><span class="lbl">基准</span><input type="number" step="0.0001" id="base-basePrice-${i}" value="${parseFloat(f.basePrice||0).toFixed(4)}" class="param-input" data-fidx="${i}" style="width:100%;min-width:0;max-width:100%;font-size:13px;box-sizing:border-box;overflow:hidden;text-align:right"></div>
            <div class="ps-item"><span class="lbl">初始份额</span><input type="number" step="1" id="base-initShares-${i}" value="${Math.round(f.initShares||0)}" class="param-input" data-fidx="${i}" style="width:100%;min-width:0;max-width:100%;font-size:13px;box-sizing:border-box;overflow:hidden;text-align:right"></div>
            <div class="ps-item"><span class="lbl">目标</span><input type="number" step="100" id="base-target-${i}" value="${Math.round(f.target||0)}" class="param-input" data-fidx="${i}" style="width:100%;min-width:0;max-width:100%;font-size:13px;box-sizing:border-box;overflow:hidden;text-align:right"></div>
          </div>
          <div class="param-grid-row">
            <div class="ps-item"><span class="lbl">高点</span><input type="number" step="0.0001" id="price-priceHigh-${i}" value="${parseFloat(f.priceHigh||0).toFixed(4)}" class="param-input" data-fidx="${i}" style="width:100%;min-width:0;max-width:100%;font-size:13px;box-sizing:border-box;overflow:hidden;text-align:right"></div>
            <div class="ps-item"><span class="lbl">中点</span><input type="number" step="0.0001" id="price-priceMid-${i}" value="${parseFloat(f.priceMid||0).toFixed(4)}" class="param-input" data-fidx="${i}" style="width:100%;min-width:0;max-width:100%;font-size:13px;box-sizing:border-box;overflow:hidden;text-align:right"></div>
            <div class="ps-item"><span class="lbl">低点</span><input type="number" step="0.0001" id="price-priceLow-${i}" value="${parseFloat(f.priceLow||0).toFixed(4)}" class="param-input" data-fidx="${i}" style="width:100%;min-width:0;max-width:100%;font-size:13px;box-sizing:border-box;overflow:hidden;text-align:right"></div>
          </div>
        </div>
        <div class="param-strip">
          <div class="ps-item"><span class="lbl">倍数</span><select id="param-multi-${i}" class="param-select">${(() => { let o=""; for (const v of [1.0,1.05,1.10,1.15,1.20,1.25,1.30]) o += `<option value="${v}"${Math.abs(v-f.multi)<0.001?' selected':''}>${v.toFixed(2)}</option>`; return o; })()}</select></div>
          <div class="ps-item"><span class="lbl">幅度</span><select id="param-step-${i}" class="param-select">${(() => { let o=""; for (const v of [0.02,0.03,0.05]) o += `<option value="${v}"${Math.abs(v-f.step)<0.001?' selected':''}>${(v*100).toFixed(0)}%</option>`; return o; })()}</select></div>
          <div class="ps-item"><span class="lbl">档数</span><select id="param-tiers-${i}" class="param-select">${(() => { let o=""; for (let v=6; v<=16; v++) o += `<option value="${v}"${v===f.tiers?' selected':''}>${v}</option>`; return o; })()}</select></div>
        </div>
      </div>
    </div>
  `;
}

function updateTime() {
  var d = new Date();
  var yyyy = d.getFullYear();
  var mm = d.getMonth() + 1;
  var dd = d.getDate();
  var hh = String(d.getHours()).padStart(2,'0');
  var mi = String(d.getMinutes()).padStart(2,'0');
  var dt = document.getElementById('dateTitle');
  if (dt) dt.textContent = `${yyyy}/${mm}/${dd}`;
  var db = document.getElementById('dateBadge');
  if (db) db.textContent = `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  var el = document.getElementById('time');
  if (el) el.textContent = '';
}

// ==================== 增强净值绘图（含买卖标记、高低点标记、悬停提示、统计摘要） ====================
function drawNavChart(fundCode, canvasId, period, buys) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (typeof Chart === 'undefined') {
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    script.onload = function() { setTimeout(function() { drawNavChart(fundCode, canvasId, period || '1M', buys); }, 100); };
    document.head.appendChild(script);
    return;
  }

  var navHistory = (function() {
    try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); }
    catch(e) { return []; }
  })();

  var records = navHistory
    .filter(r => r.code === fundCode)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (records.length < 2) {
    canvas.parentElement.innerHTML = '<div style="text-align:center;color:#93A3BD;padding:12px;font-size:12px;">数据不足，无法绘图</div>';
    return;
  }

  var now = new Date();
  var cutoff = new Date();
  if (period === '1M') cutoff.setMonth(now.getMonth() - 1);
  else if (period === '3M') cutoff.setMonth(now.getMonth() - 3);
  else if (period === '1Y') cutoff.setFullYear(now.getFullYear() - 1);
  else cutoff.setMonth(now.getMonth() - 1);

  var filtered = records.filter(r => {
    var d = new Date(r.date);
    return d >= cutoff;
  });

  if (filtered.length < 2) filtered = records;

  var labels = filtered.map(r => r.date.slice(5)); // MM-DD
  var data = filtered.map(r => r.nav);

  // ---- 构建买卖点数据集 ----
  var buyPoints = [];
  var sellPoints = [];
  if (buys && buys.length) {
    buys.forEach(b => {
      var date = b.date;
      var match = filtered.find(r => r.date === date);
      if (!match) return;
      var idx = filtered.indexOf(match);
      var point = { x: labels[idx], y: match.nav, amount: b.amount, shares: b._shares || 0, type: b.type };
      if (b.type === 'buy' || b.amount > 0) {
        buyPoints.push(point);
      } else {
        sellPoints.push(point);
      }
    });
  }

  // ---- 高低点 ----
  var maxNav = Math.max(...data);
  var minNav = Math.min(...data);
  var maxIdx = data.indexOf(maxNav);
  var minIdx = data.indexOf(minNav);
  var highPoint = { x: labels[maxIdx], y: maxNav };
  var lowPoint = { x: labels[minIdx], y: minNav };

  // ---- 构建 datasets ----
  var datasets = [
    {
      label: '净值',
      data: data,
      borderColor: '#00f0ff',
      backgroundColor: 'rgba(0, 240, 255, 0.1)',
      pointRadius: 2,
      fill: true,
      tension: 0.3,
    }
  ];

  if (buyPoints.length) {
    datasets.push({
      label: '买入',
      data: buyPoints.map(p => ({ x: p.x, y: p.y })),
      borderColor: '#22c55e',
      backgroundColor: '#22c55e',
      pointRadius: 6,
      pointStyle: 'triangle',
      showLine: false,
    });
  }
  if (sellPoints.length) {
    datasets.push({
      label: '卖出',
      data: sellPoints.map(p => ({ x: p.x, y: p.y })),
      borderColor: '#ef4444',
      backgroundColor: '#ef4444',
      pointRadius: 6,
      pointStyle: 'triangle',
      rotation: 180,
      showLine: false,
    });
  }
  datasets.push({
    label: '高点',
    data: [{ x: highPoint.x, y: highPoint.y }],
    borderColor: '#fbbf24',
    backgroundColor: '#fbbf24',
    pointRadius: 8,
    pointStyle: 'star',
    showLine: false,
  });
  datasets.push({
    label: '低点',
    data: [{ x: lowPoint.x, y: lowPoint.y }],
    borderColor: '#3b82f6',
    backgroundColor: '#3b82f6',
    pointRadius: 8,
    pointStyle: 'star',
    showLine: false,
  });

  // 如果已存在 Chart 实例，销毁它
  if (canvas._chart) canvas._chart.destroy();
  canvas.style.height = '100%';
  canvas.style.width = '100%';

  var ctx = canvas.getContext('2d');
  var chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              var label = context.dataset.label || '';
              var value = context.parsed.y;
              if (context.datasetIndex === 0) {
                return '净值: ' + value.toFixed(4);
              } else if (context.datasetIndex === 1) {
                var buyInfo = buyPoints[context.dataIndex];
                if (buyInfo) return '买入: ' + Math.round(buyInfo.amount) + '元 份额: ' + buyInfo.shares.toFixed(2);
                return '买入';
              } else if (context.datasetIndex === 2) {
                var sellInfo = sellPoints[context.dataIndex];
                if (sellInfo) return '卖出: ' + Math.round(Math.abs(sellInfo.amount)) + '元 份额: ' + Math.abs(sellInfo.shares).toFixed(2);
                return '卖出';
              } else if (context.datasetIndex === 3) {
                return '高点: ' + value.toFixed(4);
              } else if (context.datasetIndex === 4) {
                return '低点: ' + value.toFixed(4);
              }
              return label + ': ' + value.toFixed(4);
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#93A3BD', maxTicksLimit: 10 },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          ticks: { color: '#93A3BD' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });

  canvas._chart = chart;

  // ---- 图表上方统计摘要 ----
  // ---- 图表上方统计摘要 ----
var container = canvas.parentElement;
var summaryDiv = container.querySelector('.chart-summary');
if (!summaryDiv) {
  summaryDiv = document.createElement('div');
  summaryDiv.className = 'chart-summary';
  summaryDiv.style.cssText = `
    display: flex;
    justify-content: space-around;
    padding: 4px 0;
    font-size: 10px;
    color: #93A3BD;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    flex-wrap: nowrap;
    gap: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `;
  container.insertBefore(summaryDiv, canvas);
}
var latest = data[data.length-1];
var high = maxNav;
var low = minNav;
var highLowPct = (high - low) / low * 100;
var drawdown = (latest - high) / high * 100;
summaryDiv.innerHTML = `
  <span>最高 ${high.toFixed(4)}</span>
  <span>最低 ${low.toFixed(4)}</span>
  <span>振幅 ${highLowPct.toFixed(2)}%</span>
  <span>距高点 ${drawdown.toFixed(2)}%</span>
`;
}

// ==================== 事件、导出、导入等 ====================
window.addEventListener('focus', () => {
  var saved = localStorage.getItem('funds');
  if (saved) {
    try {
      var newState = JSON.parse(saved);
      if (JSON.stringify(newState) !== JSON.stringify(state)) {
        state = newState;
        render();
      }
    } catch(e) {}
  }
});
window.addEventListener('pageshow', e => {
  if (e.persisted) {
    var saved = localStorage.getItem('funds');
    if (saved) {
      try {
        state = JSON.parse(saved);
        render();
      } catch(e) {}
    }
  }
});

var autoRefreshTimer;
render();
startAutoRefresh();

function startAutoRefresh() {
  if (autoRefreshTimer) return;
  setTimeout(() => {
    refreshAll();
    var badge = document.getElementById('autoBadge');
    if (badge) badge.classList.add('on');
  }, 5000);
  autoRefreshTimer = setInterval(refreshAll, 5 * 60 * 1000);
}

// ==================== 导出收益表 ====================
function saveData() {
  var totalInv = 0, totalVal = 0, totalPnl = 0, totalShares = 0, totalTarget = 0;
  var rows = state.map(f => {
    var inv = (f.initShares * f.basePrice) + f.buys.reduce((s, b) => s + (b.amount || 0), 0);
    var sh = f.initShares + f.buys.reduce((s, b) => s + (b.amount / (b.price || 1)), 0);
    var mv = (f.price || 0) * sh;
    var pnl = mv - inv;
    var rate = inv > 0 ? (pnl / inv * 100) : 0;
    totalInv += inv; totalVal += mv; totalShares += sh; totalTarget += f.target;
    return { name: f.name, code: f.code, price: f.price, basePrice: f.basePrice, inv, sh, mv, pnl, rate, target: f.target, buys: f.buys };
  });
  totalPnl = totalVal - totalInv;
  var totalRate = totalInv > 0 ? (totalPnl / totalInv * 100) : 0;
  var totalProg = totalTarget > 0 ? (totalInv / totalTarget * 100) : 0;
  var pnlColor = (v) => v >= 0 ? '#dc2626' : '#16a34a';
  var pnlSign = (v) => v >= 0 ? '+' : '';

  var summaryHtml = `
    <div style="background:rgba(0,0,0,0.3);border-radius:8px;padding:10px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px"><span>总投入</span><b style="color:#FFD700">${Math.round(totalInv).toLocaleString()}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px"><span>总市值</span><b style="color:#FFD700">${Math.round(totalVal).toLocaleString()}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px"><span>总收益</span><b style="color:${pnlColor(totalPnl)}">${pnlSign(totalPnl)}${Math.round(totalPnl).toLocaleString()}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px"><span>总收益率</span><b style="color:${pnlColor(totalRate)}">${totalRate.toFixed(2)}%</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px"><span>总目标/完成度</span><b>${totalTarget.toLocaleString()} / ${totalProg.toFixed(1)}%</b></div>
    </div>
    <div style="max-height:200px;overflow-y:auto;font-size:11px;border:1px solid rgba(0,240,255,0.2);border-radius:6px">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:rgba(0,240,255,0.1);position:sticky;top:0">
          <th style="padding:4px;text-align:left">品种</th>
          <th style="padding:4px;text-align:right">收益</th>
          <th style="padding:4px;text-align:right">收益率</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `<tr style="border-top:1px solid rgba(0,240,255,0.1)">
            <td style="padding:4px">${r.name}</td>
            <td style="padding:4px;text-align:right;color:${pnlColor(r.pnl)};font-weight:700">${pnlSign(r.pnl)}${Math.round(r.pnl).toLocaleString()}</td>
            <td style="padding:4px;text-align:right;color:${pnlColor(r.rate)};font-weight:700">${r.rate.toFixed(2)}%</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:8px;font-size:11px;color:#93A3BD;text-align:center">将导出 Excel 表格 + 交易记录</div>
  `;

  showModal({
    title: '导出收益表',
    message: summaryHtml,
    okText: '导出',
    cancelText: '取消',
  }).then(ok => {
    if (ok) {
      saveAsExcel();
    }
  });
}

function saveAsExcel() {
  var totalInv=0, totalVal=0, totalTgt=0;
  state.forEach(f => {
    var inv = (f.initShares * f.basePrice) + f.buys.reduce((s,b)=>s+(b.amount||0),0);
    var sh = f.initShares + f.buys.reduce((s,b)=>s+(b.amount/(b.price||1)),0);
    totalInv += inv; totalVal += (f.price||0)*sh; totalTgt += f.target;
  });
  var totalPnl = totalVal - totalInv;
  var totalRate = totalInv>0 ? (totalPnl/totalInv*100) : 0;
  var totalShares = state.reduce((s,f)=>{
    return s + (f.initShares + f.buys.reduce((s,b)=>s+(b.amount/(b.price||1)),0));
  }, 0);

  var esc = (v) => {
    if (v === null || v === undefined) return '';
    var s = String(v);
    if (/[,"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  var lines = [];
  lines.push(['基金加仓总览']);
  lines.push(['导出时间', getShortDate()]);
  lines.push([]);
  lines.push(['总投入', totalInv.toFixed(2), '总市值', totalVal.toFixed(2), '总收益', totalPnl.toFixed(2), '总收益率', totalRate.toFixed(2)+'%', '完成度', (totalInv/totalTgt*100).toFixed(1)+'%']);
  lines.push([]);
  lines.push(['品种', '代码', '现价', '基准', '距基准%', '持有金额', '持有份额', '持仓成本', '持有收益', '收益率', '投入金额', '目标', '完成度']);
  state.forEach(f => {
    var inv = (f.initShares * f.basePrice) + f.buys.reduce((s,b)=>s+(b.amount||0),0);
    var sh = f.initShares + f.buys.reduce((s,b)=>s+(b.amount/(b.price||1)),0);
    var mv = (f.price||0)*sh;
    var pnl = mv-inv;
    var rate = inv>0 ? (pnl/inv*100) : 0;
    var dropPct = (f.price - f.basePrice) / f.basePrice * 100;
    var prog = f.target>0 ? (inv/f.target*100) : 0;
    lines.push([
      f.name, f.code, f.price.toFixed(4), f.basePrice.toFixed(4), dropPct.toFixed(2)+'%',
      mv.toFixed(2), sh.toFixed(2),
      sh>0?(inv/sh).toFixed(4):'-',
      pnl.toFixed(2), rate.toFixed(2)+'%',
      inv.toFixed(2), f.target, prog.toFixed(1)+'%'
    ]);
  });
  lines.push([
    '合计', '', '', '', '',
    totalVal.toFixed(2), totalShares.toFixed(2),
    '', totalPnl.toFixed(2), totalRate.toFixed(2)+'%',
    totalInv.toFixed(2), totalTgt.toFixed(2), (totalInv/totalTgt*100).toFixed(1)+'%'
  ]);
  lines.push([]);
  lines.push(['交易记录']);
  lines.push(['品种', '日期', '类型', '档位', '价格', '金额', '份额']);
  state.forEach(f => {
    f.buys.forEach(b => {
      var sh = b.amount && b.price ? (b.amount/b.price) : 0;
      var isSell = (b.type === 'sell') || (b.amount < 0);
      var typeLabel = isSell ? '卖出' : '买入';
      var absAmt = Math.abs(b.amount || 0);
      lines.push([f.name, b.date, typeLabel, (b.tier||0), b.price.toFixed(4), absAmt?Math.round(absAmt):'', sh?sh.toFixed(2):'']);
    });
  });
  var csv = '\uFEFF' + lines.map(row => row.map(esc).join(',')).join('\r\n');
  var filename = '基金加仓总览_' + getShortDate() + '.csv';

  function downloadFile(text, name, mime) {
    try {
      var blob = new Blob([text], { type: mime });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 200);
      return true;
    } catch (e) {
      console.warn('Blob 下载失败, 尝试 data URI', e);
    }
    try {
      var dataUrl = 'data:' + mime + ';charset=utf-8,' + encodeURIComponent(text);
      var a = document.createElement('a');
      a.href = dataUrl;
      a.download = name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 200);
      return true;
    } catch (e) {
      console.warn('data URI 下载失败', e);
    }
    try {
      var dataUrl = 'data:' + mime + ';charset=utf-8,' + encodeURIComponent(text);
      var w = window.open(dataUrl, '_blank');
      if (w) return true;
    } catch (e) {}
    return false;
  }
  var ok = downloadFile(csv, filename, 'text/csv;charset=utf-8');
  if (!ok) {
    showModal({
      title: '下载失败',
      message: '浏览器阻止了下载, 请长按下方链接手动保存:',
      okText: '好的',
      cancel: false,
    });
  }
}

// ==================== 导入 ====================
function importData(file) {
  showToast('⏳ 正在导入数据...');
  var reader = new FileReader();
  reader.onload = e => {
    try {
      var data = JSON.parse(e.target.result);
      if (data.funds && Array.isArray(data.funds)) {
        state = data.funds;
        if (data.nav_history) {
          localStorage.setItem('nav_history', JSON.stringify(data.nav_history));
        }
        save();
        render();
        showToast('✅ 数据导入成功！');
      } else if (Array.isArray(data) && data.length > 0) {
        state = data;
        save();
        render();
        showToast('✅ 数据导入成功！');
      } else {
        showToast('❌ 文件格式错误');
      }
    } catch(err) {
      showToast('❌ 解析失败: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ==================== 导出菜单 ====================
function showExportMenu() {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)';

  var box = document.createElement('div');
  box.style.cssText = 'background:rgba(20,26,56,0.95);border:1.5px solid #00f0ff;border-radius:18px;padding:20px;min-width:280px;max-width:90vw;box-shadow:0 0 32px rgba(0,240,255,0.4);color:#fff;font-family:-apple-system,sans-serif';

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div style="font-size:18px;font-weight:700;color:#00f0ff;text-shadow:0 0 8px rgba(0,240,255,0.5);letter-spacing:2px">📤 导出数据</div>
      <button id="exportClose" style="background:transparent;border:none;color:#93A3BD;font-size:20px;cursor:pointer;line-height:1;padding:0 4px;">✕</button>
    </div>
    <div style="font-size:13px;color:#cbd5e1;text-align:center;margin-bottom:16px;">请选择要导出的内容：</div>
    <div style="display:flex;gap:12px;margin-bottom:20px;">
      <button id="exportTypeSheet" style="flex:1;padding:12px;background:rgba(0,240,255,0.1);border:2px solid rgba(0,240,255,0.3);border-radius:10px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;">📊 收益表</button>
      <button id="exportTypeJSON" style="flex:1;padding:12px;background:rgba(0,240,255,0.1);border:2px solid rgba(0,240,255,0.3);border-radius:10px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;">💾 JSON</button>
    </div>
    <div style="display:flex;gap:10px;justify-content:center">
      <button id="exportCancel" style="flex:1;padding:10px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:10px;font-size:14px;font-weight:600;cursor:pointer">取消</button>
      <button id="exportConfirm" style="flex:1;padding:10px;background:rgba(255,255,255,0.1);color:#93A3BD;border:1.5px solid rgba(255,255,255,0.15);border-radius:10px;font-size:14px;font-weight:700;cursor:not-allowed;opacity:0.6" disabled>确认</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  var selectedType = null;
  var sheetBtn = box.querySelector('#exportTypeSheet');
  var jsonBtn = box.querySelector('#exportTypeJSON');
  var confirmBtn = box.querySelector('#exportConfirm');
  var cancelBtn = box.querySelector('#exportCancel');
  var closeBtn = box.querySelector('#exportClose');

  function selectType(type) {
    selectedType = type;
    sheetBtn.style.borderColor = type === 'sheet' ? '#00f0ff' : 'rgba(0,240,255,0.3)';
    sheetBtn.style.background = type === 'sheet' ? 'rgba(0,240,255,0.25)' : 'rgba(0,240,255,0.1)';
    jsonBtn.style.borderColor = type === 'json' ? '#00f0ff' : 'rgba(0,240,255,0.3)';
    jsonBtn.style.background = type === 'json' ? 'rgba(0,240,255,0.25)' : 'rgba(0,240,255,0.1)';
    confirmBtn.disabled = false;
    confirmBtn.style.cursor = 'pointer';
    confirmBtn.style.opacity = '1';
    confirmBtn.style.background = 'linear-gradient(135deg,rgba(0,240,255,0.3),rgba(255,43,214,0.3))';
    confirmBtn.style.color = '#fff';
    confirmBtn.style.borderColor = '#00f0ff';
  }

  sheetBtn.onclick = function() { selectType('sheet'); };
  jsonBtn.onclick = function() { selectType('json'); };

  function closeAndDownload() {
    document.body.removeChild(overlay);
    if (selectedType === 'sheet') {
      saveData();
    } else if (selectedType === 'json') {
      exportJSONData();
    }
  }

  function closeOnly() {
    document.body.removeChild(overlay);
  }

  confirmBtn.onclick = function() {
    if (selectedType) closeAndDownload();
  };

  cancelBtn.onclick = closeOnly;
  closeBtn.onclick = closeOnly;
  overlay.onclick = function(e) { if (e.target === overlay) closeOnly(); };
}

// ==================== 导出 JSON ====================
function exportJSONData() {
  var data = {
    funds: state,
    nav_history: getNavHistory(),
    exportTime: new Date().toISOString()
  };
  var json = JSON.stringify(data, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'funds_backup_' + getShortDate() + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== 主题切换 ====================
var THEME_CYCLE = ['cyber', 'dark', 'light'];
var THEME_ICON = { cyber: '🌃', dark: '🌙', light: '☀️' };
var theme = localStorage.getItem('theme') || 'cyber';
if (!THEME_CYCLE.includes(theme)) theme = 'cyber';
function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme);
  var btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = THEME_ICON[theme] || '🌃';
}
function toggleTheme() {
  var idx = THEME_CYCLE.indexOf(theme);
  theme = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
  localStorage.setItem('theme', theme);
  applyTheme();
}
function logout() { location.reload(); }
document.getElementById('themeBtn')?.addEventListener('click', toggleTheme);
document.getElementById('logoutBtn')?.addEventListener('click', logout);
applyTheme();

// ==================== 新增/删除基金 ====================
async function addNewFund() {
  var name = await showModal({ input: 'text', message: '基金名称 (如: 白酒/医药/新能源):', default: '新基金' });
  if (!name || name === '取消') return;
  var code = await showModal({ input: 'text', message: '基金代码 (腾讯基金代码):', default: '000000' }) || '000000';
  var basePrice = parseFloat(await showModal({ input: 'number', message: '基准价:', default: '1.0000' })) || 1.0;
  var initShares = parseFloat(await showModal({ input: 'number', message: '初始份额 (初始单价×此数=初始投入):', default: '0' })) || 0;
  var target = parseFloat(await showModal({ input: 'number', message: '目标金额:', default: '10000' })) || 10000;
  var mid = basePrice * 1.15;
  var newFund = {
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
  var prev = JSON.stringify(state);
  state.push(newFund);
  activeTab = state.length - 1;
  saveActiveTab(activeTab);
  save(prev);
  render();
  updateSaveBadge();
}

function deleteFund(idx) {
  var prev = JSON.stringify(state);
  state.splice(idx, 1);
  if (activeTab >= state.length) activeTab = Math.max(0, state.length - 1);
  save(prev);
  render();
  updateSaveBadge();
}

// ============== 假期、交易日 ==============
var HOLIDAYS_MAP = {
  '2026': [
    '2026-01-01','2026-01-02',
    '2026-02-16','2026-02-17','2026-02-18','2026-02-19','2026-02-20',
    '2026-04-06',
    '2026-05-01','2026-05-04','2026-05-05',
    '2026-06-19',
    '2026-09-25',
    '2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07','2026-10-08',
    '2026-12-25'
  ],
  '2027': []
};

function getHolidaysForDate(dateStr) {
  var year = dateStr.substring(0, 4);
  return HOLIDAYS_MAP[year] || [];
}

function isTradeDay(date) {
  var d = new Date(date + 'T00:00:00');
  var dow = d.getDay();
  var holidays = getHolidaysForDate(date);
  return dow !== 0 && dow !== 6 && !holidays.includes(date);
}

function nextTradeDay(date) {
  var d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  while (true) {
    var year = d.getFullYear();
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var ds = year + '-' + month + '-' + day;
    var dow = d.getDay();
    var holidays = getHolidaysForDate(ds);
    if (dow !== 0 && dow !== 6 && !holidays.includes(ds)) {
      return ds;
    }
    d.setDate(d.getDate() + 1);
  }
}

function smartBday(dateStr, timeStr) {
  if (!dateStr) return null;
  if (!timeStr) return isTradeDay(dateStr) ? dateStr : nextTradeDay(dateStr);
  var parts = timeStr.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (!parts) return dateStr;
  var hh = parseInt(parts[1], 10);
  var mm = parseInt(parts[2], 10);
  var minutes = hh * 60 + mm;
  if (minutes >= 570 && minutes <= 900) {
    return isTradeDay(dateStr) ? dateStr : nextTradeDay(dateStr);
  } else if (minutes > 900) {
    return nextTradeDay(dateStr);
  } else {
    return isTradeDay(dateStr) ? dateStr : nextTradeDay(dateStr);
  }
}

// ============== OCR 相关（交易 + 净值） ==============
var ocrWorker = null;
async function loadTesseractLib() {
  if (window.Tesseract) return;
  return new Promise((resolve, reject) => {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Tesseract.js 加载失败'));
    document.head.appendChild(s);
  });
}
async function ensureOCRWorker() {
  if (ocrWorker) return ocrWorker;
  await loadTesseractLib();
  ocrWorker = await Tesseract.createWorker('chi_sim+eng', 1);
  return ocrWorker;
}

async function runOCR(file, f, i) {
  showToast('正在识别图片…');
  try {
    var worker = await ensureOCRWorker();
    var { data } = await worker.recognize(file);
    var text = data.text || '';
    console.log('OCR text:\n' + text);

    // 先尝试解析交易记录
    var tradeRecords = parseBuyRecords(text);
    if (tradeRecords.length > 0) {
      var enriched = tradeRecords.map(r => {
        var b = smartBday(r.date, r.time);
        return { ...r, bday: b };
      });
      showOCRConfirmDialog(f, i, enriched, text, 'trade');
      return;
    }

    // 尝试解析净值记录
    var navRecords = parseNavRecords(text);
    if (navRecords.length > 0) {
      showOCRConfirmDialog(f, i, navRecords, text, 'nav');
      return;
    }

    showOCRDebug(text, '未识别到交易记录或净值数据');
  } catch(err) {
    showToast('识别失败: ' + err.message);
    console.error(err);
  }
}

function showOCRDebug(text, reason) {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:16px;box-sizing:border-box';
  var box = document.createElement('div');
  box.style.cssText = 'background:linear-gradient(135deg, rgba(20,26,56,0.98), rgba(10,16,36,0.98));border:1.5px solid #fbbf24;border-radius:16px;padding:18px;min-width:320px;max-width:90vw;max-height:80vh;overflow-y:auto;box-shadow:0 0 24px rgba(251,191,36,0.4);color:#fff;font-family:monospace';
  var preview = text.split('\n').slice(0, 30).map(l => l.trim() ? `<div style="color:#67e8f9">${l.replace(/</g,'&lt;')}</div>` : '<div>&nbsp;</div>').join('');
  box.innerHTML = `
    <div style="font-size:14px;font-weight:800;color:#fbbf24;margin-bottom:8px">⚠️ ${reason}</div>
    <div style="font-size:11px;color:#93A3BD;margin-bottom:10px">请检查图片或识别文字, 期望每行包含: 日期 时间 + 金额元</div>
    <div style="background:rgba(0,0,0,0.4);border-radius:8px;padding:10px;font-size:11px;line-height:1.6;max-height:50vh;overflow-y:auto;white-space:pre-wrap">${preview}</div>
    <div style="display:flex;gap:10px;margin-top:14px">
      <button id="ocrDbgOk" style="flex:1;padding:10px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#05060b;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer">知道了</button>
    </div>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  box.querySelector('#ocrDbgOk').onclick = () => document.body.removeChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) document.body.removeChild(overlay); };
}

function showOCRConfirmDialog(f, i, records, text, mode) {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
  var box = document.createElement('div');
  box.style.cssText = 'background:linear-gradient(135deg, rgba(20,26,56,0.98), rgba(10,16,36,0.98));border:1.5px solid #00f0ff;border-radius:16px;padding:18px;min-width:320px;max-width:90vw;max-height:80vh;overflow-y:auto;box-shadow:0 0 24px rgba(0,240,255,0.4);color:#fff;font-family:-apple-system,sans-serif';

  var title = mode === 'nav' ? '📈 识别到净值数据' : '📷 识别到交易记录';
  var previewRows = records.map((r, idx) => {
    if (mode === 'nav') {
      return `<div style="display:flex;gap:10px;padding:4px 0;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.05)">
        <span style="color:#93A3BD">${idx+1}.</span>
        <span style="color:#fff">${r.date}</span>
        <span style="color:#00f5c8;font-weight:700">${r.nav.toFixed(4)}</span>
      </div>`;
    } else {
      var bdayChanged = r.bday !== r.date;
      var isSell = r.type === 'sell';
      var typeLabel = isSell ? '卖出' : '买入';
      var typeColor = isSell ? '#22c55e' : '#fb7185';
      return `<div style="display:flex;gap:6px;align-items:center;padding:8px;background:rgba(0,0,0,0.3);border-radius:8px;margin-bottom:6px;font-size:11px;flex-wrap:wrap">
        <span style="color:#fbbf24;font-weight:700;min-width:18px">${idx+1}</span>
        <span style="color:${typeColor};font-weight:800;border:1px solid ${typeColor};border-radius:4px;padding:0 4px;font-size:10px">${typeLabel}</span>
        <span style="color:#93A3BD">${r.date} ${r.time}</span>
        <span style="color:#fff;font-weight:800">→</span>
        <span style="color:#00f5c8;font-weight:800">${r.bday}</span>
        <span style="color:#67e8f9;font-weight:700;margin-left:auto">¥${r.amount.toFixed(2)}</span>
        <span style="font-size:10px;color:${bdayChanged ? '#fbbf24' : '#475569'}">${bdayChanged ? '顺延' : '当天'}</span>
      </div>`;
    }
  }).join('');

  var details = mode === 'nav' ? '' : `<details style="font-size:10px;color:#475569;margin-bottom:10px"><summary style="cursor:pointer;color:#67e8f9">🔧 调试: 原始数据</summary><pre style="background:rgba(0,0,0,0.4);padding:8px;border-radius:6px;margin-top:6px;color:#67e8f9;font-size:10px;overflow-x:auto">${JSON.stringify(records, null, 2).replace(/</g,'&lt;')}</pre></details>`;

  box.innerHTML = `
    <div style="font-size:15px;font-weight:800;color:#00f0ff;letter-spacing:1px;margin-bottom:12px;text-shadow:0 0 8px rgba(0,240,255,0.5)">${title}</div>
    <div style="font-size:11px;color:#93A3BD;margin-bottom:10px">${mode === 'nav' ? '将导入以下净值记录到历史中，并更新当前基金价格' : '智能日期: 9:30-15:00 之内=当天, 之外=顺延到下个交易日'}</div>
    ${details}
    <div style="max-height:50vh;overflow-y:auto;margin-bottom:14px">${previewRows}</div>
    <div style="display:flex;gap:10px">
      <button id="ocrCancel" style="flex:1;padding:10px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">取消</button>
      <button id="ocrOk" style="flex:1;padding:10px;background:linear-gradient(135deg,#00f0ff,#00b4d8);color:#05060b;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 0 12px rgba(0,240,255,0.4)">全部添加</button>
    </div>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  box.querySelector('#ocrCancel').onclick = () => document.body.removeChild(overlay);

  box.querySelector('#ocrOk').onclick = function() {
    if (mode === 'nav') {
      var navList = getNavHistory();
      var name = f.name;
      var code = f.code;
      var added = 0;
      records.forEach(r => {
        var existIdx = navList.findIndex(item => item.code === code && item.date === r.date);
        var entry = { code, name, date: r.date, nav: r.nav, ts: Date.now() };
        if (existIdx >= 0) {
          navList[existIdx] = entry;
        } else {
          navList.push(entry);
        }
        added++;
      });
      saveNavHistory(navList);
      var sorted = records.slice().sort((a, b) => a.date.localeCompare(b.date));
      var latest = sorted[sorted.length - 1];
      if (latest) {
        f.price = latest.nav;
        f.priceDate = latest.date;
        f._manualPrice = true;
        save();
        render();
      }
      document.body.removeChild(overlay);
      showToast('✅ 已导入 ' + added + ' 条净值记录');
      setTimeout(function() {
        drawNavChart(f.code, 'navChart-' + i, '1M', f.buys);
      }, 100);
    } else {
      var prev = JSON.stringify(state);
      var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
      var hitCount = 0, missCount = 0, buyCount = 0, sellCount = 0;
      records.forEach(r => {
        var matched = navHistory.find(x => x.code === f.code && x.date === r.bday);
        var nav = matched ? matched.nav : 0;
        var isSell = r.type === 'sell';
        if (isSell) sellCount++; else buyCount++;
        var newBuy = {
          date: r.bday,
          type: isSell ? 'sell' : 'buy',
          price: nav,
          amount: 0,
          tier: 0,
          _mark: isSell ? 'green' : 'red',
        };
        if (isSell) {
          var sellAmt = Math.abs(r.amount || 0);
          if (nav > 0) {
            newBuy._shares = -(sellAmt / nav);
            newBuy.amount = -sellAmt;
            hitCount++;
          } else {
            newBuy.amount = 0;
            missCount++;
          }
        } else {
          newBuy.amount = Math.abs(r.amount || 0);
          if (nav > 0) {
            newBuy._shares = newBuy.amount / nav;
            hitCount++;
          } else {
            missCount++;
          }
        }
        f.buys.push(newBuy);
      });
      save(prev);
      document.body.removeChild(overlay);
      render();
      var msg = `✅ 已添加 ${records.length} 条 (买${buyCount}/卖${sellCount})`;
      if (missCount > 0) msg += ` · ${hitCount} 条匹配净值, ${missCount} 条无匹配`;
      showToast(msg);
    }
  };

  overlay.onclick = (e) => { if (e.target === overlay) document.body.removeChild(overlay); };
}

function showToast(msg) {
  var t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#00f5c8;padding:10px 18px;border-radius:20px;font-size:13px;font-weight:700;z-index:99999;border:1px solid #00f0ff;box-shadow:0 0 12px rgba(0,240,255,0.4)';
  document.body.appendChild(t);
  setTimeout(() => document.body.removeChild(t), 2500);
}

function showAddNavDialog(code, name, date) {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)';
  var box = document.createElement('div');
  box.style.cssText = 'background:linear-gradient(135deg, rgba(20,26,56,0.98), rgba(10,16,36,0.98));border:1.5px solid #00f0ff;border-radius:16px;padding:18px;min-width:280px;max-width:90vw;box-shadow:0 0 24px rgba(0,240,255,0.4);color:#fff;font-family:-apple-system,sans-serif';
  box.innerHTML = `
    <div style="font-size:15px;font-weight:800;color:#00f0ff;letter-spacing:1px;margin-bottom:12px;text-shadow:0 0 8px rgba(0,240,255,0.5)">📝 补录净值</div>
    <div style="font-size:12px;color:#93A3BD;margin-bottom:14px;line-height:1.6">
      <div>基金: <b style="color:#fff">${name}</b></div>
      <div>日期: <b style="color:#fff">${date}</b></div>
    </div>
    <div style="margin-bottom:14px">
      <label style="font-size:10px;color:#93A3BD;letter-spacing:1px;display:block;margin-bottom:4px">净值 (元)</label>
      <input type="number" step="0.0001" id="quickNavInput" value="" placeholder="0.0000" style="width:100%;background:rgba(0,0,0,0.4);border:1px solid rgba(0,240,255,0.3);border-radius:10px;padding:10px;color:#fff;font-size:15px;font-weight:800;font-family:monospace;text-align:center;outline:none;box-sizing:border-box">
    </div>
    <div style="display:flex;gap:10px">
      <button id="quickNavCancel" style="flex:1;padding:10px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">取消</button>
      <button id="quickNavOk" style="flex:1;padding:10px;background:linear-gradient(135deg,#00f0ff,#00b4d8);color:#05060b;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 0 12px rgba(0,240,255,0.4)">保存</button>
    </div>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  var input = box.querySelector('#quickNavInput');
  input.focus();
  function close() { document.body.removeChild(overlay); }
  box.querySelector('#quickNavCancel').onclick = close;
  box.querySelector('#quickNavOk').onclick = () => {
    var nav = parseFloat(input.value);
    if (isNaN(nav) || nav <= 0) {
      input.style.borderColor = '#ff5fa0';
      setTimeout(() => input.style.borderColor = 'rgba(0,240,255,0.3)', 800);
      return;
    }
    var list = getNavHistory();
    var existIdx = list.findIndex(r => r.code === code && r.date === date);
    if (existIdx >= 0) list[existIdx] = { code, name, date, nav, ts: Date.now() };
    else list.push({ code, name, date, nav, ts: Date.now() });
    saveNavHistory(list);
    close();
    render();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') box.querySelector('#quickNavOk').click();
    if (e.key === 'Escape') close();
  });
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
}

// ============== 净值历史弹窗（带分页 + 批量导入） ==============
function showNavModal() {
  var old = document.getElementById('navModal');
  if (old) old.remove();
  var overlay = document.createElement('div');
  overlay.id = 'navModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);padding:12px';
  var box = document.createElement('div');
  box.style.cssText = 'background:linear-gradient(135deg, rgba(20,26,56,0.98), rgba(10,16,36,0.98));border:1.5px solid #00f0ff;border-radius:18px;padding:18px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;box-shadow:0 0 32px rgba(0,240,255,0.4);color:#fff;font-family:-apple-system,sans-serif';

  var currentPage = 0;
  var pageSize = 20;
  var navList = [];

  function fundOptions(selectedCode) {
    return state.map(f =>
      `<option value="${f.code}" data-name="${f.name}" ${f.code === selectedCode ? 'selected' : ''}>${f.name} (${f.code})</option>`
    ).join('');
  }

  function renderTable() {
    navList = getNavHistory().slice().reverse();
    var totalPages = Math.ceil(navList.length / pageSize) || 1;
    if (currentPage >= totalPages) currentPage = Math.max(0, totalPages - 1);
    var start = currentPage * pageSize;
    var end = Math.min(start + pageSize, navList.length);
    var pageData = navList.slice(start, end);

    var tableBox = box.querySelector('#navTableBox');
    if (!tableBox) return;

    if (navList.length === 0) {
      tableBox.innerHTML = '<div style="text-align:center;color:#93A3BD;padding:20px;font-size:12px">还没有记录 · 填写下方表单添加</div>';
      return;
    }

    var html = `<table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:rgba(0,240,255,0.15)">
        <th style="padding:6px;text-align:left">基金</th>
        <th style="padding:6px;text-align:left">日期</th>
        <th style="padding:6px;text-align:right">净值</th>
        <th style="padding:6px;width:36px"></th>
      </tr></thead>
      <tbody>`;
    pageData.forEach((r, idx) => {
      var realIdx = navList.length - 1 - (start + idx);
      html += `<tr style="border-top:1px solid rgba(0,240,255,0.1)">
        <td style="padding:6px">${r.name} <span style="color:#93A3BD;font-size:10px">${r.code}</span></td>
        <td style="padding:6px;color:#93A3BD;font-family:monospace">${r.date}</td>
        <td style="padding:6px;text-align:right;font-weight:700;color:#00f5c8;font-family:monospace">${r.nav.toFixed(4)}</td>
        <td style="padding:6px;text-align:center"><button data-del-idx="${realIdx}" style="background:transparent;border:none;color:#ff5fa0;cursor:pointer;font-size:14px">✕</button></td>
      </tr>`;
    });
    html += '</tbody></table>';

    if (totalPages > 1) {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:#93A3BD">
        <button id="navPrevPage" style="background:rgba(0,240,255,0.1);border:1px solid rgba(0,240,255,0.3);border-radius:6px;padding:4px 12px;color:#fff;cursor:pointer" ${currentPage===0?'disabled':''}>◀ 上一页</button>
        <span>第 ${currentPage+1} / ${totalPages} 页</span>
        <button id="navNextPage" style="background:rgba(0,240,255,0.1);border:1px solid rgba(0,240,255,0.3);border-radius:6px;padding:4px 12px;color:#fff;cursor:pointer" ${currentPage>=totalPages-1?'disabled':''}>下一页 ▶</button>
      </div>`;
    }

    tableBox.innerHTML = html;
    bindDelete();

    var prevBtn = tableBox.querySelector('#navPrevPage');
    var nextBtn = tableBox.querySelector('#navNextPage');
    if (prevBtn) prevBtn.onclick = function() { if (currentPage > 0) { currentPage--; renderTable(); } };
    if (nextBtn) nextBtn.onclick = function() { if (currentPage < totalPages-1) { currentPage++; renderTable(); } };
  }

  function bindDelete() {
    box.querySelectorAll('[data-del-idx]').forEach(btn => {
      btn.onclick = function(e) {
        e.stopPropagation();
        var idx = parseInt(this.dataset.delIdx, 10);
        var list = getNavHistory();
        if (idx >= 0 && idx < list.length) {
          list.splice(idx, 1);
          saveNavHistory(list);
          renderTable();
        }
      };
    });
  }

  // 批量导入净值
  function batchImportNav(text) {
    var lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
    var records = [];
    var re = /(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})\s+([\d.]+)/;
    var sel = box.querySelector('#navFundSelect');
    var code = sel.value;
    var name = sel.options[sel.selectedIndex].dataset.name;

    for (var line of lines) {
      var m = line.match(re);
      if (m) {
        var date = m[1].replace(/[\/.]/g, '-');
        var nav = parseFloat(m[2]);
        if (!isNaN(nav) && nav > 0) {
          records.push({ code, name, date, nav, ts: Date.now() });
        }
      }
    }

    if (records.length === 0) {
      showToast('❌ 未识别到有效数据，请检查格式（日期 净值）');
      return;
    }

    var list = getNavHistory();
    records.forEach(r => {
      var existIdx = list.findIndex(item => item.code === r.code && item.date === r.date);
      if (existIdx >= 0) {
        list[existIdx] = r;
      } else {
        list.push(r);
      }
    });
    saveNavHistory(list);

    var sorted = records.sort((a, b) => a.date.localeCompare(b.date));
    var latest = sorted[sorted.length - 1];
    var f = state.find(x => x.code === code);
    if (f) {
      f.price = latest.nav;
      f.priceDate = latest.date;
      f._manualPrice = true;
      save();
      render();
    }

    currentPage = 0;
    renderTable();
    showToast('✅ 成功导入 ' + records.length + ' 条净值记录');
    var batchPanel = box.querySelector('#batchPanel');
    if (batchPanel) batchPanel.style.display = 'none';
    if (activeTab < state.length && state[activeTab].code === code) {
      setTimeout(function() {
        drawNavChart(code, 'navChart-' + activeTab, '1M', state[activeTab].buys);
      }, 100);
    }
  }

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:16px;font-weight:800;color:#00f0ff;letter-spacing:2px">📝 手动记录净值</div>
      <button id="navClose" style="background:transparent;border:none;color:#93A3BD;font-size:20px;cursor:pointer;line-height:1">×</button>
    </div>
    <div style="background:rgba(0,240,255,0.06);border:1px solid rgba(0,240,255,0.2);border-radius:12px;padding:10px;margin-bottom:14px">
      <div style="display:grid;grid-template-columns:1.4fr 1.4fr 1fr auto;gap:8px;align-items:center">
        <select id="navFundSelect" style="background:rgba(0,0,0,0.4);border:1px solid rgba(0,240,255,0.3);border-radius:8px;padding:8px;color:#fff;font-size:13px">
          ${fundOptions(state[activeTab] && state[activeTab].code)}
        </select>
        <input type="date" id="navDate" value="${new Date().toISOString().split('T')[0]}" style="background:rgba(0,0,0,0.4);border:1px solid rgba(0,240,255,0.3);border-radius:8px;padding:8px;color:#fff;font-size:13px;font-family:monospace">
        <input type="number" step="0.0001" id="navValue" placeholder="0.0000" style="background:rgba(0,0,0,0.4);border:1px solid rgba(0,240,255,0.3);border-radius:8px;padding:8px;color:#fff;font-size:13px;font-family:monospace;text-align:right">
        <button id="navAddBtn" style="background:linear-gradient(135deg,#00f0ff,#00b4d8);color:#05060b;border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap">+ 添加</button>
      </div>
      <div style="margin-top:8px;text-align:right">
        <button id="showBatchBtn" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:4px 12px;color:#93A3BD;font-size:11px;cursor:pointer">📥 批量导入</button>
      </div>
      <div id="batchPanel" style="display:none;margin-top:8px;">
        <textarea id="batchInput" rows="6" style="width:100%;background:rgba(0,0,0,0.4);border:1px solid rgba(0,240,255,0.3);border-radius:8px;padding:8px;color:#fff;font-size:12px;font-family:monospace;box-sizing:border-box" placeholder="每行一条：日期 净值&#10;例：&#10;2025-09-02 1.0696&#10;2025-09-01 1.0831"></textarea>
        <div style="display:flex;gap:8px;margin-top:6px;">
          <button id="batchImportBtn" style="flex:1;padding:6px;background:linear-gradient(135deg,#00f0ff,#00b4d8);color:#05060b;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer">确认导入</button>
          <button id="batchCancelBtn" style="flex:1;padding:6px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:6px;font-size:12px;cursor:pointer">取消</button>
        </div>
      </div>
    </div>
    <div id="navTableBox"></div>
    <div style="margin-top:12px;text-align:center;font-size:10px;color:#93A3BD">记录保存到 localStorage · 用于手动追踪净值变化</div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  function close() { overlay.remove(); }
  box.querySelector('#navClose').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  renderTable();

  box.querySelector('#navAddBtn').onclick = function() {
    var sel = box.querySelector('#navFundSelect');
    var dateInp = box.querySelector('#navDate');
    var valInp = box.querySelector('#navValue');
    var code = sel.value;
    var name = sel.options[sel.selectedIndex].dataset.name;
    var date = dateInp.value;
    var nav = parseFloat(valInp.value);
    if (!date || isNaN(nav) || nav <= 0) {
      valInp.style.borderColor = '#ff5fa0';
      setTimeout(() => valInp.style.borderColor = 'rgba(0,240,255,0.3)', 1000);
      return;
    }
    var list = getNavHistory();
    var existIdx = list.findIndex(r => r.code === code && r.date === date);
    if (existIdx >= 0) {
      list[existIdx] = { code, name, date, nav, ts: Date.now() };
    } else {
      list.push({ code, name, date, nav, ts: Date.now() });
    }
    saveNavHistory(list);
    var f = state.find(x => x.code === code);
    if (f) {
      f.price = nav;
      f.priceDate = date;
      f._manualPrice = true;
      save();
      render();
    }
    currentPage = 0;
    renderTable();
    valInp.value = '';
    if (activeTab < state.length && state[activeTab].code === code) {
      setTimeout(function() {
        drawNavChart(code, 'navChart-' + activeTab, '1M', state[activeTab].buys);
      }, 100);
    }
  };

  var showBatchBtn = box.querySelector('#showBatchBtn');
  var batchPanel = box.querySelector('#batchPanel');
  showBatchBtn.onclick = function() {
    if (batchPanel.style.display === 'none') {
      batchPanel.style.display = 'block';
      box.querySelector('#batchInput').focus();
    } else {
      batchPanel.style.display = 'none';
    }
  };
  box.querySelector('#batchCancelBtn').onclick = function() {
    batchPanel.style.display = 'none';
  };
  box.querySelector('#batchImportBtn').onclick = function() {
    var text = box.querySelector('#batchInput').value;
    if (!text.trim()) {
      showToast('⚠️ 请输入数据');
      return;
    }
    batchImportNav(text);
  };
}

// ==================== 自定义 Modal（带关闭按钮） ====================
var SONG_CI = [
  '春风又绿江南岸', '人生若只如初见', '明月几时有', '小楼昨夜又东风',
  '落花人独立', '碧云天，黄叶地', '一蓑烟雨任平生', '何妨吟啸且徐行',
  '归去，也无风雨也无晴', '但愿人长久，千里共婵娟', '此情可待成追忆',
  '天涯何处无芳草', '山有木兮木有枝', '桃李春风一杯酒', '人间有味是清欢',
  '醉后不知天在水', '满船清梦压星河', '沧海月明珠有泪', '留连戏蝶时时舞',
  '自在娇莺恰恰啼', '江上数峰青', '且将新火试新茶', '人间至味是清欢',
  '已是悬崖百丈冰', '花褪残红青杏小', '枝上柳绵吹又少', '天涯何处无芳草',
  '笑渐不闻声渐悄', '多情却被无情恼', '天涯流落思无穷'
];

function showModal(opts) {
  return new Promise((resolve) => {
    var title = opts.title || SONG_CI[Math.floor(Math.random() * SONG_CI.length)];
    var msg = opts.message || '';
    var def = opts.default || '';
    var okText = opts.okText || '确定';
    var cancelText = opts.cancelText || '取消';
    var isPrompt = opts.input !== undefined;
    var placeholder = opts.placeholder || '';
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)';
    var box = document.createElement('div');
    box.style.cssText = 'background:rgba(20,26,56,0.95);border:1.5px solid #00f0ff;border-radius:18px;padding:20px;min-width:280px;max-width:90vw;box-shadow:0 0 32px rgba(0,240,255,0.4);color:#fff;font-family:-apple-system,sans-serif';
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="font-size:18px;font-weight:700;color:#00f0ff;text-shadow:0 0 8px rgba(0,240,255,0.5);letter-spacing:2px">${title}</div>
        <button id="modalClose" style="background:transparent;border:none;color:#93A3BD;font-size:20px;cursor:pointer;line-height:1;padding:0 4px;">✕</button>
      </div>
      <div style="font-size:13px;color:#cbd5e1;text-align:center;margin-bottom:14px;line-height:1.5">${msg}</div>
      ${isPrompt ? `<input type="${opts.input || 'text'}" id="modalInput" value="${def}" placeholder="${placeholder}" style="width:100%;padding:10px;font-size:14px;border-radius:10px;border:1.5px solid rgba(0,240,255,0.4);background:rgba(0,0,0,0.4);color:#fff;text-align:center;outline:none;box-sizing:border-box;font-weight:600;margin-bottom:14px">` : ''}
      <div style="display:flex;gap:10px;justify-content:center">
        ${opts.cancel !== false ? `<button id="modalCancel" style="flex:1;padding:10px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:10px;font-size:14px;font-weight:600;cursor:pointer">${cancelText}</button>` : ''}
        <button id="modalOk" style="flex:1;padding:10px;background:linear-gradient(135deg,rgba(0,240,255,0.3),rgba(255,43,214,0.3));color:#fff;border:1.5px solid #00f0ff;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 0 12px rgba(0,240,255,0.3)">${okText}</button>
      </div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    var input = box.querySelector('#modalInput');
    if (input) { input.focus(); input.select(); }
    function close(val) {
      document.body.removeChild(overlay);
      resolve(val);
    }
    box.querySelector('#modalOk').onclick = () => close(isPrompt ? (input ? input.value : def) : true);
    if (opts.cancel !== false) box.querySelector('#modalCancel').onclick = () => close(isPrompt ? null : false);
    box.querySelector('#modalClose').onclick = () => close(isPrompt ? null : false);
    if (isPrompt) {
      input && input.addEventListener('keydown', e => {
        if (e.key === 'Enter') close(input.value);
        if (e.key === 'Escape') close(null);
      });
    }
  });
}

window.prompt = function(msg, def) {
  console.warn('prompt 被调用, 应当用 showModal 代替', msg);
  return def || '';
};
window.alert = function(msg) {
  console.warn('alert 被调用', msg);
};

// ==================== 加/减按钮 ====================
function addBuyByAmountDialog(i) {
  var f = state[i];
  var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
  var now = new Date();
  var today = now.toISOString().split('T')[0];
  var minutes = now.getHours() * 60 + now.getMinutes();
  var bday;
  if (minutes >= 570 && minutes <= 900) {
    bday = isTradeDay(today) ? today : nextTradeDay(today);
  } else {
    bday = nextTradeDay(today);
  }
  var matched = navHistory.find(r => r.code === f.code && r.date === bday);
  var nav = matched ? matched.nav : 0;
  var dateLabel = bday + (matched ? ' 净值 ' + nav.toFixed(4) : ' (无匹配)');
  var promptMsg = '日期: ' + dateLabel + '\n当前净值: ' + (nav ? nav.toFixed(4) : '无') + '\n请输入买入金额';
  showModal({
    title: '录入金额(买入)',
    message: promptMsg,
    okText: '确认',
    cancelText: '取消',
    input: 'number',
    placeholder: '金额',
  }).then(val => {
    if (val === null || val === undefined || val === '') return;
    var amt = parseFloat(val);
    if (!amt || amt <= 0) { flashHint('⚠️ 金额要大于 0'); return; }
    var prev = JSON.stringify(state);
    var newBuy = {
      date: bday,
      type: 'buy',
      price: nav,
      amount: amt,
      tier: 0,
      _mark: 'red',
    };
    if (nav > 0) {
      newBuy._shares = amt / nav;
    }
    f.buys.push(newBuy);
    save(prev);
    render();
    if (nav > 0) {
      flashHint('🔴 已录入金额 ' + Math.round(amt).toLocaleString() + ' / 份额 ' + (amt / nav).toFixed(2));
    } else {
      flashHint('🔴 已录入金额 ' + Math.round(amt).toLocaleString() + ' (无净值, 份额待补)');
    }
  });
}

function subBuyBySharesDialog(i) {
  var f = state[i];
  var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
  var now = new Date();
  var today = now.toISOString().split('T')[0];
  var minutes = now.getHours() * 60 + now.getMinutes();
  var bday;
  if (minutes >= 570 && minutes <= 900) {
    bday = isTradeDay(today) ? today : nextTradeDay(today);
  } else {
    bday = nextTradeDay(today);
  }
  var matched = navHistory.find(r => r.code === f.code && r.date === bday);
  var nav = matched ? matched.nav : 0;
  var dateLabel = bday + (matched ? ' 净值 ' + nav.toFixed(4) : ' (无匹配)');

  var navHistory2 = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
  var holdShares = (f.initShares || 0) + (f.buys || []).reduce((s, b) => {
    if (b._shares != null) return s + b._shares;
    if (!b.date) return s;
    var m = navHistory2.find(r => r.code === f.code && r.date === b.date);
    var p = m ? m.nav : (b.price || f.price || 0);
    return p > 0 ? s + (b.amount / p) : s;
  }, 0);

  var promptMsg = '日期: ' + dateLabel + '\n当前净值: ' + (nav ? nav.toFixed(4) : '无') +
                  '\n当前持有份额: ' + holdShares.toFixed(2) +
                  '\n请输入卖出份额';
  showModal({
    title: '录入份额(卖出)',
    message: promptMsg,
    okText: '确认',
    cancelText: '取消',
    input: 'number',
    placeholder: '份额',
  }).then(val => {
    if (val === null || val === undefined || val === '') return;
    var sh = parseFloat(val);
    if (!sh || sh <= 0) { flashHint('⚠️ 份额要大于 0'); return; }
    if (sh > holdShares + 0.01) { flashHint('⚠️ 卖出份额(' + sh.toFixed(2) + ')超过持有(' + holdShares.toFixed(2) + ')'); return; }
    var prev = JSON.stringify(state);
    var newBuy = {
      date: bday,
      type: 'sell',
      price: nav,
      amount: 0,
      tier: 0,
      _shares: -Math.abs(sh),
      _mark: 'green',
    };
    if (nav > 0) {
      newBuy.amount = -Math.abs(sh * nav);
    }
    f.buys.push(newBuy);
    save(prev);
    render();
    if (nav > 0) {
      flashHint('🟢 已录入份额 ' + sh.toFixed(2) + ' / 金额 ' + Math.round(newBuy.amount).toLocaleString());
    } else {
      flashHint('🟢 已录入份额 ' + sh.toFixed(2) + ' (无净值, 金额待补)');
    }
  });
}

var undoStack = [];
var redoStack = [];
function undo() {
  if (undoStack.length === 0) { alert('没有可撤销的操作'); return; }
  redoStack.push(JSON.stringify(state));
  var prev = undoStack.pop();
  state = JSON.parse(prev);
  save(false);
  render();
  flashHint('↩️ 已撤销');
}
function redo() {
  if (redoStack.length === 0) { alert('没有可重做的操作'); return; }
  undoStack.push(JSON.stringify(state));
  var next = redoStack.pop();
  state = JSON.parse(next);
  save(false);
  render();
  flashHint('↪️ 已重做');
}
function flashHint(t) {
  var h = document.getElementById('flashHint');
  if (!h) { h = document.createElement('div'); h.id = 'flashHint'; document.body.appendChild(h); }
  h.textContent = t;
  h.classList.add('show');
  clearTimeout(h._t);
  h._t = setTimeout(() => h.classList.remove('show'), 1200);
}

function getNavHistory() {
  try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); }
  catch (e) { return []; }
}
function saveNavHistory(list) {
  localStorage.setItem('nav_history', JSON.stringify(list));
}

// ==================== 绑定周期选择按钮事件（事件委托） ====================
document.addEventListener('click', function(e) {
  var btn = e.target.closest('.chart-period');
  if (!btn) return;
  var period = btn.dataset.period;
  var canvas = btn.closest('.chart-section').querySelector('canvas');
  if (!canvas) return;
  var id = canvas.id;
  var idx = id.replace('navChart-', '');
  if (idx !== '' && state[parseInt(idx)]) {
    var f = state[parseInt(idx)];
    var siblings = btn.parentElement.querySelectorAll('.chart-period');
    siblings.forEach(b => {
      b.style.background = 'transparent';
      b.style.borderColor = 'rgba(255,255,255,0.2)';
      b.style.color = '#93A3BD';
    });
    btn.style.background = 'rgba(0,240,255,0.2)';
    btn.style.borderColor = '#00f0ff';
    btn.style.color = '#fff';
    drawNavChart(f.code, id, period, f.buys);
  }
});