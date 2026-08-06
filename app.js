// === 完整 app.js 第 1 部分 ===
// 包含：全局错误兜底、数据初始化、净值抓取、刷新、保存、样式注入、档位计算、下拉刷新、render 函数

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
if (typeof DEFAULT_INIT === 'undefined') { var DEFAULT_INIT = []; }
var state;
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
    .add-btn, .del-btn, .buy-toggle-btn { transition: all .2s ease; }
    .add-btn { width:36px; height:36px; border-radius:50%; background:rgba(0,240,255,0.08); color:#67e8f9; border:1.5px solid rgba(0,240,255,0.3); font-size:18px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; margin-right:6px; box-shadow:none; }
    .add-btn:hover { background:rgba(0,240,255,0.18); box-shadow:0 0 8px rgba(0,240,255,0.25); }
    .buy-toggle-btn { width:36px; height:36px; border-radius:50%; background:rgba(255,255,255,0.06); color:#94a3b8; border:1.5px solid rgba(148,163,184,0.35); font-size:18px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; margin-right:6px; }
    .buy-toggle-btn:hover { background:rgba(148,163,184,0.15); }
    .buy-toggle-btn.active { background:rgba(251,146,60,0.18); color:#fb923c; border-color:rgba(251,146,60,0.55); box-shadow:0 0 10px rgba(251,146,60,0.3); }
    .del-btn { background:rgba(251,113,133,0.12); color:#fb7185; border:1.5px solid rgba(251,113,133,0.4); box-shadow:0 0 6px rgba(251,113,133,0.15); }
    .del-btn:hover { background:rgba(251,113,133,0.22); }
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
function triggerRefresh() { localStorage.setItem('funds', JSON.stringify(state)); refreshAll(); var btn = document.getElementById('refreshBtn'); if (btn) { var old = btn.textContent; btn.textContent='✓'; setTimeout(()=>btn.textContent=old, 800); } }
document.addEventListener('DOMContentLoaded', setupPullToRefresh);

function getSavedActiveTab() { try { var s = localStorage.getItem('activeTab'); return s !== null ? parseInt(s,10) : -1; } catch(e){ return -1; } }
function saveActiveTab(t) { try { localStorage.setItem('activeTab', String(t)); } catch(e){} }
var activeTab = getSavedActiveTab();

// ==================== 主渲染函数（已修复长按干扰点击） ====================
function render() {
  // 顶部 tab-bar 删了, 切到下边
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
  // 底部 dock: 保存 / 导表 / | / 汇总 / 港股 / 证券 / +
  html += '<div class="dock-bar">';
  // 工具按钮: 保存(刷新) + 导表 (用 .tab 样式, 不占位)
  html += '<button class="dock-btn-small" id="refreshBtn" title="保存+刷新"><span class="dock-ico">💾</span><span class="dock-lbl">保存</span></button>';
  html += '<button class="dock-btn-small" id="tabSaveBtn" title="导出收益表"><span class="dock-ico">📊</span><span class="dock-lbl">导表</span></button>';
  // 分隔
  html += '<span class="dock-sep"></span>';
  // 切换: 沿用原 .tab 样式
  html += '<button class="tab tab-summary ' + (activeTab===state.length?'active':'') + '" data-tab="' + state.length + '">📊 汇总</button>';
  state.forEach((f, i) => {
    html += `<button class="tab ${i===activeTab?'active':''}" data-tab="${i}">${f.name}</button>`;
  });
  html += '<button class="tab-add" data-add="1" title="新增基金">+</button>';
  html += '</div>';
  // 滚轮选择器容器 (3列联动, 数字输入统一用这个)
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

  // 单击切换（防误触）
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (btn.dataset._pressing) return;
      activeTab = parseInt(btn.dataset.tab);
      saveActiveTab(activeTab);
      render();
    });
  });

  document.querySelector('.tab-add[data-add="1"]')?.addEventListener('click', addNewFund);
  document.getElementById('tabSaveBtn')?.addEventListener('click', saveData);
  document.getElementById('refreshBtn')?.addEventListener('click', () => { location.href = 'nav.html'; });

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

  // 长按删除（已修复，不阻止点击）
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
  document.querySelectorAll(".range-track").forEach(updateRangeTrack);
}
// ==================== 跑道 + 跑步小人 ====================
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
    if (rate >= 10) {
      runner.classList.add("running-fast");
      if (emoji) emoji.textContent = "🏃‍♀️";
      if (dust) dust.textContent = "💨";
    } else if (rate >= 0) {
      runner.classList.add("running-slow");
      if (emoji) emoji.textContent = "🚶‍♂️";
      if (dust) dust.textContent = "";
    } else if (rate >= -10) {
      runner.classList.add("walking-back");
      if (emoji) emoji.textContent = "😟";
      if (dust) dust.textContent = "";
    } else {
      runner.classList.add("running-flee");
      if (emoji) emoji.textContent = "🏃‍♀️";
      if (dust) dust.textContent = "💦";
    }
    track.querySelectorAll(".range-tree").forEach(function(tree) {
      var leftPct = parseFloat(tree.style.left) || 0;
      if (Math.abs(rate) >= leftPct) tree.classList.add("reached");
      else tree.classList.remove("reached");
    });
  }
}

// ==================== 跑道 + 跑步小人 (F 方案 7 档) ====================
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
    // F 方案: 股票情绪 7 档
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

// ==================== 第 2 部分：核心渲染函数 ====================

// ============== 滚轮选择器 (3列联动, 仿 iOS) ==============
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
    // 5 列: 元 / 十分 / 百分 / 千分 / 万分 (0.0000 - 5.9999)
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
    // int: 5 列 万/千/百/十/个 (0 - 99999)
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
  // 找标题: 优先用 input 前面 .lbl 的文字
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
    // 边界弹性
    if (off > maxOff + 50) off = maxOff + 50 + (off - maxOff - 50) * 0.3;
    if (off < minOff - 50) off = minOff - 50 + (off - minOff + 50) * 0.3;
    track.style.transform = 'translateY(' + off + 'px)';
    // 速度
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
  // 鼠标拖拽(桌面端调试)
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
  // 触发原 input 的 input 事件, 让 save/updateCardValues 链生效
  inp.dispatchEvent(new Event('input', { bubbles: true }));
}

// 滚轮全局事件 (DOMContentLoaded 后绑定一次)
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

function bindFundEvents(f, i) {
  // 数字输入改用滚轮选择器 (全局委托 .click-wheel), 这里不再单独绑 click
  // 保留 input 事件以兼容程序触发 (滚轮写回后会 dispatch('input'))
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
  var html = '<div class="fund" style="border-top: 4px solid #FFD700">';
  html += '<div class="summary-title">📊 投资汇总</div>';
  // 预读净值历史, 统一用 nav_history 里的真实净值算每笔份额
  var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
  var totalInv=0, totalVal=0, totalTgt=0, totalShares=0;
  var stats = state.map(f => {
    var initShares = f.initShares || 0;
    var basePrice = f.basePrice || 0;
    var curPrice = f.price || 0;
    var target = f.target || 0;
    var inv = (initShares * basePrice) + f.buys.reduce((s,b)=>s+(b.amount||0),0);
    // 份额: 与卡片一致, 用 b.date 对应的净值; 没有 b.date 时退到 f.price
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
    // 回撤: 现价相对高点的跌幅, <= 0
    var pHigh = parseFloat(f.priceHigh) || 0;
    var drawdown = (pHigh > 0 && curPrice > 0) ? ((curPrice - pHigh) / pHigh * 100) : 0;
    // 兼容旧字段 dropPct (用回撤)
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
    // 回撤颜色: 0 = 灰(没跌), 跌得越深越绿
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

function updateCardValuesAll() {
  state.forEach((_, i) => updateCardValues(i));
}
function updateCardValues(i) {
  var f = state[i];
  var card = document.querySelectorAll('.fund')[i];
  if (!card) return;
  var { tier, currentAmt, currentTrigger, currentTier, currentIsBuy, neighbors } = calcCurrent(f);
  // 回撤: 现价相对高点
  var pHighU = parseFloat(f.priceHigh) || 0;
  var curU = parseFloat(f.price) || 0;
  var dropPct = (pHighU > 0 && curU > 0) ? ((curU - pHighU) / pHighU * 100) : (((f.price - f.basePrice) / f.basePrice * 100) || 0);
  var dropColor = dropPct < -10 ? '#16a34a' : (dropPct < 0 ? '#4ade80' : '#93A3BD');
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
  // 回撤: 现价相对高点; 没有高点就退到相对基准
  var pHigh = parseFloat(f.priceHigh) || 0;
  var curPrice0 = parseFloat(f.price) || 0;
  var dropPct;
  if (pHigh > 0 && curPrice0 > 0) {
    dropPct = (curPrice0 - pHigh) / pHigh * 100;  // 永远 <= 0
  } else {
    dropPct = ((f.price - f.basePrice) / f.basePrice * 100) || 0;
  }
  var dropColor = dropPct < -10 ? '#16a34a' : (dropPct < 0 ? '#4ade80' : '#93A3BD');
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
  return `
    <div class="fund" style="border-top: 4px solid ${f.color}">
      <div class="fund-head">
        <div class="fund-name-pill">
          <div class="pill-name">${f.name}</div>
          <div class="pill-code">${f.code}</div>
        </div>
        <div class="fund-price-pill">
          <div class="pill-lbl">现价</div>
          <input type="text" inputmode="decimal" id="price-${i}" value="${(f.price||0).toFixed(4)}" class="price-input click-wheel" data-wheel-kind="price" data-fidx="${i}" data-decimals="4" readonly>
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
        // ===== 区间条: 现价在 low-mid-high 区间中的位置可视化 =====
        var pLow = parseFloat(f.priceLow) || 0;
        var pMid = parseFloat(f.priceMid) || 0;
        var pHigh = parseFloat(f.priceHigh) || 0;
        var pNow = parseFloat(f.price) || 0;
        if (pLow > 0 && pHigh > pLow && pMid > 0 && pMid < pHigh) {
          // 总格数: 用 tiers * 2, 让中点正好落在中间
          var total = Math.max(20, (f.tiers || 10) * 2);
          var lowFrac = (pLow - pLow) / (pHigh - pLow);
          var midFrac = (pMid - pLow) / (pHigh - pLow);
          var nowFrac = (pNow - pLow) / (pHigh - pLow);
          lowFrac = Math.max(0, Math.min(1, lowFrac));
          midFrac = Math.max(0, Math.min(1, midFrac));
          nowFrac = Math.max(0, Math.min(1, nowFrac));
          // 现价格位
          var nowCell = Math.round(nowFrac * (total - 1));
          var midCell = Math.round(midFrac * (total - 1));
          // 拼字符: 末位 ☀, 现价格用 ●, 中点格(在另一边)用半心♥(颜色区分)
          var chars = [];
          for (var k = 0; k < total; k++) {
            if (k === total - 1) chars.push('☀'); // 终点
            else if (k === nowCell && k === midCell) chars.push('●'); // 正好在中点
            else if (k === nowCell) chars.push('●'); // 现价格
            else {
              // 现价以下 = 实心 ♥, 现价以上 = 空心 ♡
              if (k < nowCell) chars.push('♥');
              else chars.push('♡');
            }
          }
          var bar = chars.join('');
          // 现价相对位置% (标签)
          var nowPct = (nowFrac * 100).toFixed(1);
          // 现价颜色: <中点 绿(低吸区), >=中点 橙(追高区)
          var nowColor = pNow <= pMid ? 'var(--neon-green)' : 'var(--neon-orange)';
          var distLow = ((pNow - pLow) / pLow * 100).toFixed(1);
          var distMid = ((pNow - pMid) / pMid * 100).toFixed(1);
          var distHigh = ((pNow - pHigh) / pHigh * 100).toFixed(1);
          // ===== 新版: 跑道 + 跑步小人 + 树 + 星星 + 飞云 =====
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
            <button class="add-btn" id="undo-${i}" title="撤销">‹‹</button>
            <button class="add-btn" id="redo-${i}" title="重做">››</button>
            <button class="add-btn" id="ocr-${i}" title="识图录入">📷</button>
            <button class="add-btn" id="addBuy-${i}" title="添加一行">+</button>
          </div>
        </div>
        <div class="buy-table-wrap">
          <div class="buy-grid-head"><div>Bday</div><div>净值</div><div>金额</div><div>份额</div><div>涨幅</div><div>Sday</div></div>
          <div class="buy-grid-body">
              ${f.buys.map((b, bi) => {
                var realAmt = b.amount || 0;
                var amtCls = realAmt > 0 ? 'amt-pos' : (realAmt < 0 ? 'amt-neg' : 'amt-neu');
                var displayAmt = realAmt;
                var navHistory = (() => {
                  try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); }
                  catch(e) { return []; }
                })();
                var sday = b.sday || '';
                var sdayNav = sday ? (navHistory.find(r => r.code === f.code && r.date === sday) || {}).nav : null;
                var bNavMatch = b.date ? (navHistory.find(r => r.code === f.code && r.date === b.date) || {}).nav : null;
                var shares = (realAmt && bNavMatch) ? (Math.abs(realAmt) / bNavMatch) : 0;
                var priceNow = f.price || 0;
                var priceBuy = bNavMatch != null ? bNavMatch : 0;
                var hasSdayMatch = !!(sday && sdayNav != null);
                var refPrice = hasSdayMatch ? sdayNav : priceNow;
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
                  var parts = sday.split('-');
                  if (parts.length === 3) sdayShort = parts[1] + '/' + parts[2];
                  else sdayShort = sday;
                }
                return `
            <div class="buy-row" data-bi="${bi}" data-fund-i="${i}">
              <div class="buy-row-inner">
                <div class="bc bc-pill bc-date ${b.date && !navHistory.find(r => r.code === f.code && r.date === b.date) ? 'sday-miss' : ''}"><input type="date" id="bdate-${i}-${bi}" value="${b.date||''}" data-short="${dateShort}" class="bcell bdate-slider"></div>
                <div class="bc bc-pill bc-nav ${!bNavMatch ? 'sday-miss' : ''}" id="bnavwrap-${i}-${bi}">${bNavMatch != null ? '<span class="bnav-readonly" data-bi="'+bi+'" style="color:var(--neon-green);font-size:12px;font-weight:700;font-family:monospace">'+bNavMatch.toFixed(4)+'</span>' : '<span class="bnav-readonly" data-bi="'+bi+'" style="color:#6b7280;font-size:11px;font-weight:600">无匹配</span>'}</div>
                <div class="bc bc-pill">
                  <input type="number" step="1" id="bamt-${i}-${bi}" value="${displayAmt?Math.round(displayAmt):''}" class="bcell ${amtCls}" data-original-amount="${realAmt}" style="width:100%">
                </div>
                <div class="bc bc-pill"><span class="bshares" data-bi="${bi}" style="color:#93A3BD;font-size:13px;font-weight:700">${shares ? shares.toFixed(2) : '-'}</span></div>
                <div class="bc bc-pill"><span class="bchange" data-bi="${bi}" style="color:${changeColor};font-size:12px;font-weight:700">${changePct === null ? '-' : (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%'}</span></div>
                <div class="bc bc-pill bc-sday ${sday && sdayNav == null ? 'sday-miss' : ''}"><input type="date" id="bsday-${i}-${bi}" value="${sday}" max="${new Date().toISOString().split('T')[0]}" data-short="${sdayShort}" class="bcell bdate-slider" data-bi="${bi}" data-fund-i="${i}"></div>
              </div>
            </div>
              `;}).join('')}
          </div>
          <div class="buy-grid-foot">
            <div class="bf-label"><b>合计</b></div>
            <div></div>
            <div><b>${Math.round(invested).toLocaleString()}</b></div>
            <div><b>${Math.round(shares).toLocaleString()}</b></div>
            <div></div>
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

      <div class="param-section">
        <div class="section-title">参数设置</div>
        <div class="param-grid-table">
          <div class="param-grid-row">
            <div class="ps-item"><span class="lbl">基准</span><input type="text" inputmode="decimal" id="base-basePrice-${i}" value="${parseFloat(f.basePrice||0).toFixed(4)}" class="param-input click-wheel" data-wheel-kind="price" data-fidx="${i}" data-decimals="4" readonly style="width:100%;min-width:0;max-width:100%;font-size:13px;box-sizing:border-box;overflow:hidden;text-align:right"></div>
            <div class="ps-item"><span class="lbl">初始份额</span><input type="text" inputmode="numeric" id="base-initShares-${i}" value="${Math.round(f.initShares||0)}" class="param-input click-wheel" data-wheel-kind="int" data-fidx="${i}" readonly style="width:100%;min-width:0;max-width:100%;font-size:13px;box-sizing:border-box;overflow:hidden;text-align:right"></div>
            <div class="ps-item"><span class="lbl">目标</span><input type="text" inputmode="numeric" id="base-target-${i}" value="${Math.round(f.target||0)}" class="param-input click-wheel" data-wheel-kind="int" data-fidx="${i}" readonly style="width:100%;min-width:0;max-width:100%;font-size:13px;box-sizing:border-box;overflow:hidden;text-align:right"></div>
          </div>
          <div class="param-grid-row">
            <div class="ps-item"><span class="lbl">高点</span><input type="text" inputmode="decimal" id="price-priceHigh-${i}" value="${parseFloat(f.priceHigh||0).toFixed(4)}" class="param-input click-wheel" data-wheel-kind="price" data-fidx="${i}" data-decimals="4" readonly style="width:100%;min-width:0;max-width:100%;font-size:13px;box-sizing:border-box;overflow:hidden;text-align:right"></div>
            <div class="ps-item"><span class="lbl">中点</span><input type="text" inputmode="decimal" id="price-priceMid-${i}" value="${parseFloat(f.priceMid||0).toFixed(4)}" class="param-input click-wheel" data-wheel-kind="price" data-fidx="${i}" data-decimals="4" readonly style="width:100%;min-width:0;max-width:100%;font-size:13px;box-sizing:border-box;overflow:hidden;text-align:right"></div>
            <div class="ps-item"><span class="lbl">低点</span><input type="text" inputmode="decimal" id="price-priceLow-${i}" value="${parseFloat(f.priceLow||0).toFixed(4)}" class="param-input click-wheel" data-wheel-kind="price" data-fidx="${i}" data-decimals="4" readonly style="width:100%;min-width:0;max-width:100%;font-size:13px;box-sizing:border-box;overflow:hidden;text-align:right"></div>
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
// ==================== 第 3 部分：事件监听、导出、主题、OCR、弹窗等 ====================

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

document.getElementById('exportBtn')?.addEventListener('click', showExportModal);
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
function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}
function showExportModal() {
  var now = new Date();
  var ts = now.toISOString().split('T')[0] + ' ' + now.toTimeString().substring(0,5);
  var navHistory = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
  var stats = state.map(f => {
    var invested = (f.initShares * f.basePrice) + f.buys.reduce((s, b) => s + (b.amount || 0), 0);
    var sh_buys = f.buys.reduce((s, b) => {
      if (!b.date) return s;
      var matched = navHistory.find(r => r.code === f.code && r.date === b.date);
      var price = matched ? matched.nav : (f.price || 0);
      return price > 0 ? s + (b.amount / price) : s;
    }, 0);
    var shares = f.initShares + sh_buys;
    var marketValue = (f.price || 0) * shares;
    var pnl = marketValue - invested;
    return { f, invested, shares, marketValue, pnl, cost: shares > 0 ? invested/shares : 0 };
  });
  var totalInvested = stats.reduce((s, x) => s + x.invested, 0);
  var totalShares = stats.reduce((s, x) => s + x.shares, 0);
  var totalValue = stats.reduce((s, x) => s + x.marketValue, 0);
  var totalPnl = totalValue - totalInvested;
  var totalTarget = state.reduce((s, f) => s + f.target, 0);
  var totalRate = totalInvested > 0 ? (totalPnl/totalInvested*100) : 0;
  var pnlColor = (v) => v >= 0 ? '#dc2626' : '#16a34a';
  var pnlSign = (v) => v >= 0 ? '+' : '';
  
  var summaryRows = stats.map(s => {
    var rate = s.invested > 0 ? (s.pnl/s.invested*100) : 0;
    var ratio = totalInvested > 0 ? (s.invested/totalInvested*100) : 0;
    var prog = s.f.target > 0 ? (s.invested/s.f.target*100) : 0;
    return `<tr>
      <td><b>${s.f.name}</b><br><small>${s.f.code}</small></td>
      <td>${s.f.price.toFixed(4)}</td>
      <td>${s.f.basePrice.toFixed(4)}</td>
      <td>${Math.round(s.marketValue).toLocaleString()}</td>
      <td>${Math.round(s.shares).toLocaleString()}</td>
      <td>${s.cost > 0 ? s.cost.toFixed(4) : '-'}</td>
      <td style="color:${pnlColor(s.pnl)}">${pnlSign(s.pnl)}${Math.round(s.pnl).toLocaleString()}</td>
      <td style="color:${pnlColor(rate)}">${rate.toFixed(2)}%</td>
      <td>${Math.round(s.invested).toLocaleString()}</td>
      <td>${prog.toFixed(0)}%</td>
      <td>${ratio.toFixed(1)}%</td>
    </tr>`;
  }).join('');
  
  var buyRows = [];
  state.forEach(f => {
    f.buys.forEach(b => {
      var sh = b.amount && b.price ? b.amount/b.price : 0;
      var isSell = (b.type === 'sell') || (b.amount < 0);
      var typeLabel = isSell ? '卖出' : '买入';
      var typeColor = isSell ? '#16a34a' : '#dc2626';
      var amtColor = isSell ? '#16a34a' : '#dc2626';
      var sign = isSell ? '-' : '+';
      var absAmt = Math.abs(b.amount || 0);
      buyRows.push(`<tr>
        <td>${f.name}</td>
        <td>${b.date}</td>
        <td style="color:${typeColor};font-weight:700">${typeLabel}</td>
        <td>${b.price.toFixed(4)}</td>
        <td style="color:${amtColor};font-weight:700">${sign}${Math.round(absAmt).toLocaleString()}</td>
        <td>${sh ? sh.toFixed(2) : '-'}</td>
      </tr>`);
    });
  });
  
  var html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
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
<\/style></head><body>
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
<thead><tr><th>品种</th><th>现价</th><th>基准</th><th>持有金额</th><th>持有份额</th><th>成本</th><th>持有收益</th><th>收益率</th><th>投入</th><th>完成度</th><th>占比</th></tr></thead>
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

<h2>📋 交易记录</h2>
<table>
<thead><tr><th>品种</th><th>日期</th><th>价格</th><th>金额</th><th>份额</th></tr></thead>
<tbody>${buyRows.join('')}</tbody></table>

<div class="footer">导出自基金加仓总览</div>
</body></html>`;
  
  var w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
  } else {
    alert('请允许弹出窗口以查看表格');
  }
}

function exportExcelToFile() {
  if (typeof XLSX === 'undefined') {
    var s = document.createElement('script');
    s.src = 'xlsx.full.min.js';
    document.head.appendChild(s);
    setTimeout(exportExcelToFile, 1500);
    alert('首次使用，正在加载 Excel 库');
    return;
  }
  var wb = XLSX.utils.book_new();
  var totalInv=0, totalVal=0, totalTgt=0;
  var navHistoryXls = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
  var calcShares = (f) => {
    var sh_buys = f.buys.reduce((s, b) => {
      if (!b.date) return s;
      var matched = navHistoryXls.find(r => r.code === f.code && r.date === b.date);
      var price = matched ? matched.nav : (f.price || 0);
      return price > 0 ? s + (b.amount / price) : s;
    }, 0);
    return (f.initShares || 0) + sh_buys;
  };
  state.forEach(f => {
    var inv = (f.initShares * f.basePrice) + f.buys.reduce((s,b)=>s+(b.amount||0),0);
    var sh = calcShares(f);
    totalInv += inv; totalVal += (f.price||0)*sh; totalTgt += f.target;
  });
  var totalPnl = totalVal - totalInv;
  var totalRate = totalInv>0 ? (totalPnl/totalInv*100) : 0;
  var totalShares = state.reduce((s,f)=> s + calcShares(f), 0);
  var rows = [
    ['基金加仓总览', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['导出时间', new Date().toISOString().split('T')[0], '', '', '', '', '', '', '', '', '', '', ''],
    [],
    ['=== 总体汇总 ===', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['总投入', totalInv.toFixed(2), '', '总市值', totalVal.toFixed(2), '', '总收益', totalPnl.toFixed(2), '', '总收益率', totalRate.toFixed(2)+'%', '', '完成度', (totalInv/totalTgt*100).toFixed(1)+'%'],
    [],
    ['=== 各基金主表 ===', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['品种', '代码', '现价', '基准', '距基准%', '持有金额', '持有份额', '持仓成本', '持有收益', '收益率', '投入金额', '目标', '完成度'],
  ];
  state.forEach(f => {
    var inv = (f.initShares * f.basePrice) + f.buys.reduce((s,b)=>s+(b.amount||0),0);
    var sh = calcShares(f);
    var mv = (f.price||0)*sh;
    var pnl = mv-inv;
    var rate = inv>0 ? (pnl/inv*100) : 0;
    var dropPct = (f.price - f.basePrice) / f.basePrice * 100;
    var prog = f.target>0 ? (inv/f.target*100) : 0;
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
  rows.push(['=== 交易记录 ===', '', '', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['品种', '日期', '类型', '档位', '价格', '金额', '份额', '', '', '', '', '', '']);
  state.forEach(f => {
    f.buys.forEach(b => {
      var sh = b.amount && b.price ? (b.amount/b.price) : 0;
      var isSell = (b.type === 'sell') || (b.amount < 0);
      var typeLabel = isSell ? '卖出' : '买入';
      var absAmt = Math.abs(b.amount || 0);
      rows.push([f.name, b.date, typeLabel, b.tier, b.price, absAmt?Math.round(absAmt):'', sh?sh.toFixed(2):'', '', '', '', '', '']);
    });
  });
  var ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!merges'] = [
    {s:{r:0,c:0},e:{r:0,c:12}},
    {s:{r:1,c:1},e:{r:1,c:4}},
    {s:{r:3,c:0},e:{r:3,c:12}},
    {s:{r:6,c:0},e:{r:6,c:12}},
    {s:{r:rows.length - state.reduce((s,f)=>s+f.buys.length,0) - 2,c:0},e:{r:rows.length - state.reduce((s,f)=>s+f.buys.length,0) - 2,c:12}},
  ];
  XLSX.utils.book_append_sheet(wb, ws, '基金加仓总览');
  var ts = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, '基金加仓总览_' + ts + '.xlsx');
}

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
  var today = new Date().toISOString().split('T')[0];

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
      var btn = document.getElementById('tabSaveBtn');
      if (btn) {
        var old = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => btn.textContent = old, 1200);
      }
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
  lines.push(['导出时间', new Date().toISOString().split('T')[0]]);
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
  var ts = new Date().toISOString().split('T')[0];
  var filename = '基金加仓总览_' + ts + '.csv';

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

function importData(file) {
  var reader = new FileReader();
  reader.onload = e => {
    try {
      var data = JSON.parse(e.target.result);
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
  var initSource = (typeof FUNDS_INIT !== 'undefined') ? FUNDS_INIT : DEFAULT_INIT;
  state = JSON.parse(JSON.stringify(initSource));
  localStorage.setItem('funds', JSON.stringify(state));
  render();
}

document.getElementById('saveBtn')?.addEventListener('click', saveData);

// 主题切换
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
document.getElementById('excelBtn')?.addEventListener('click', exportExcelToFile);

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

// ============== 多年度动态假期列表 ==============
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

// ============== OCR 识别交易记录（修复版） ==============
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

function parseBuyRecords(text) {
  var lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  var rows = [];
  var reDate = /(20\d{2})[\-\/年.](\d{1,2})[\-\/月.](\d{1,2})/;
  var reTime = /(\d{1,2}):(\d{2})(?::(\d{2}))?/;
  var reAmount = /(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)\s*元/;
  
  for (let i = 0; i < lines.length; i++) {
    var line = lines[i];
    var prev1 = lines[i-1] || '';
    var next1 = lines[i+1] || '';
    var next2 = lines[i+2] || '';
    
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
        if (v >= 1 && v < 10000000) { amount = v; break; }
      }
    }
    if (amount != null) rows.push({ date, time, amount });
  }
  return rows;
}

async function runOCR(file, f, i) {
  showToast('正在识别图片…');
  try {
    var worker = await ensureOCRWorker();
    var { data } = await worker.recognize(file);
    var text = data.text || '';
    console.log('OCR text:\n' + text);
    var records = parseBuyRecords(text);
    if (records.length === 0) {
      showOCRDebug(text, '未识别到交易记录');
      return;
    }
    var enriched = records.map(r => {
      var b = smartBday(r.date, r.time);
      console.log('[smartBday]', r.date, r.time, '→', b);
      return { ...r, bday: b };
    });
    showOCRConfirmDialog(f, i, enriched, text);
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

function showOCRConfirmDialog(f, i, records) {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
  var box = document.createElement('div');
  box.style.cssText = 'background:linear-gradient(135deg, rgba(20,26,56,0.98), rgba(10,16,36,0.98));border:1.5px solid #00f0ff;border-radius:16px;padding:18px;min-width:320px;max-width:90vw;max-height:80vh;overflow-y:auto;box-shadow:0 0 24px rgba(0,240,255,0.4);color:#fff;font-family:-apple-system,sans-serif';
  
  var rowsHtml = records.map((r, idx) => {
    var bdayChanged = r.bday !== r.date;
    return `<div style="display:flex;gap:6px;align-items:center;padding:8px;background:rgba(0,0,0,0.3);border-radius:8px;margin-bottom:6px;font-size:11px;flex-wrap:wrap">
      <span style="color:#fbbf24;font-weight:700;min-width:18px">${idx+1}</span>
      <span style="color:#93A3BD">${r.date} ${r.time}</span>
      <span style="color:#fff;font-weight:800">→</span>
      <span style="color:#00f5c8;font-weight:800">${r.bday}</span>
      <span style="color:#67e8f9;font-weight:700;margin-left:auto">¥${r.amount.toFixed(2)}</span>
      <span style="font-size:10px;color:${bdayChanged ? '#fbbf24' : '#475569'}">${bdayChanged ? '顺延' : '当天'}</span>
    </div>`;
  }).join('');
  
  box.innerHTML = `
    <div style="font-size:15px;font-weight:800;color:#00f0ff;letter-spacing:1px;margin-bottom:12px;text-shadow:0 0 8px rgba(0,240,255,0.5)">📷 识别到 ${records.length} 条</div>
    <div style="font-size:11px;color:#93A3BD;margin-bottom:10px">智能日期: 9:30-15:00 之内=当天, 之外=顺延到下个交易日</div>
    <details style="font-size:10px;color:#475569;margin-bottom:10px"><summary style="cursor:pointer;color:#67e8f9">🔧 调试: 原始数据 (date/time/bday)</summary>
      <pre style="background:rgba(0,0,0,0.4);padding:8px;border-radius:6px;margin-top:6px;color:#67e8f9;font-size:10px;overflow-x:auto">${JSON.stringify(records, null, 2).replace(/</g,'&lt;')}</pre>
    </details>
    <div style="max-height:50vh;overflow-y:auto;margin-bottom:14px">${rowsHtml}</div>
    <div style="display:flex;gap:10px">
      <button id="ocrCancel" style="flex:1;padding:10px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">取消</button>
      <button id="ocrOk" style="flex:1;padding:10px;background:linear-gradient(135deg,#00f0ff,#00b4d8);color:#05060b;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 0 12px rgba(0,240,255,0.4)">全部添加</button>
    </div>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  box.querySelector('#ocrCancel').onclick = () => document.body.removeChild(overlay);
  box.querySelector('#ocrOk').onclick = () => {
    var prev = JSON.stringify(state);
    records.forEach(r => {
      f.buys.push({ date: r.bday, type: 'buy', price: 0, amount: r.amount, tier: 0 });
    });
    save(prev);
    document.body.removeChild(overlay);
    render();
    showToast(`✅ 已添加 ${records.length} 条记录`);
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

function showNavModal() {
  var old = document.getElementById('navModal');
  if (old) old.remove();
  var overlay = document.createElement('div');
  overlay.id = 'navModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);padding:12px';
  var box = document.createElement('div');
  box.style.cssText = 'background:linear-gradient(135deg, rgba(20,26,56,0.98), rgba(10,16,36,0.98));border:1.5px solid #00f0ff;border-radius:18px;padding:18px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;box-shadow:0 0 32px rgba(0,240,255,0.4);color:#fff;font-family:-apple-system,sans-serif';
  function fundOptions(selectedCode) {
    return state.map(f =>
      `<option value="${f.code}" data-name="${f.name}" ${f.code === selectedCode ? 'selected' : ''}>${f.name} (${f.code})</option>`
    ).join('');
  }
  function renderTable() {
    var list = getNavHistory().slice().reverse();
    if (list.length === 0) {
      return '<div style="text-align:center;color:#93A3BD;padding:20px;font-size:12px">还没有记录 · 填写下方表单添加</div>';
    }
    return `<table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:rgba(0,240,255,0.15)">
        <th style="padding:6px;text-align:left">基金</th>
        <th style="padding:6px;text-align:left">日期</th>
        <th style="padding:6px;text-align:right">净值</th>
        <th style="padding:6px;width:36px"></th>
      </tr></thead>
      <tbody>
        ${list.map((r, i) => {
          var realIdx = list.length - 1 - i;
          return `<tr style="border-top:1px solid rgba(0,240,255,0.1)">
            <td style="padding:6px">${r.name} <span style="color:#93A3BD;font-size:10px">${r.code}</span></td>
            <td style="padding:6px;color:#93A3BD;font-family:monospace">${r.date}</td>
            <td style="padding:6px;text-align:right;font-weight:700;color:#00f5c8;font-family:monospace">${r.nav.toFixed(4)}</td>
            <td style="padding:6px;text-align:center"><button data-del-idx="${realIdx}" style="background:transparent;border:none;color:#ff5fa0;cursor:pointer;font-size:14px">✕</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
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
    </div>
    <div id="navTableBox">
      ${renderTable()}
    </div>
    <div style="margin-top:12px;text-align:center;font-size:10px;color:#93A3BD">记录保存到 localStorage · 用于手动追踪净值变化</div>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  function close() { overlay.remove(); }
  box.querySelector('#navClose').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  box.querySelector('#navAddBtn').onclick = () => {
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
    list.push({ code, name, date, nav, ts: Date.now() });
    saveNavHistory(list);
    var f = state.find(x => x.code === code);
    if (f) {
      f.price = nav;
      f.priceDate = date;
      f._manualPrice = true;
      save();
      render();
    }
    box.querySelector('#navTableBox').innerHTML = renderTable();
    bindDelete();
    valInp.value = '';
  };
  function bindDelete() {
    box.querySelectorAll('[data-del-idx]').forEach(btn => {
      btn.onclick = () => {
        var idx = parseInt(btn.dataset.delIdx, 10);
        var list = getNavHistory();
        list.splice(idx, 1);
        saveNavHistory(list);
        box.querySelector('#navTableBox').innerHTML = renderTable();
        bindDelete();
      };
    });
  }
  bindDelete();
}

// 自定义 modal
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
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)';
    var box = document.createElement('div');
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
    var input = box.querySelector('#modalInput');
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

window.prompt = function(msg, def) {
  console.warn('prompt 被调用, 应当用 showModal 代替', msg);
  return def || '';
};
window.alert = function(msg) {
  console.warn('alert 被调用', msg);
};

function addBuyDialog(i) {
  var f = state[i];
  var now = new Date();
  var today = now.toISOString().split('T')[0];
  var minutes = now.getHours() * 60 + now.getMinutes();
  var bday;
  if (minutes >= 570 && minutes <= 900) {
    bday = isTradeDay(today) ? today : nextTradeDay(today);
  } else {
    bday = nextTradeDay(today);
  }
  var prev = JSON.stringify(state);
  f.buys.push({
    date: bday,
    type: 'buy',
    price: f.price || f.basePrice || 0,
    amount: 0,
    tier: 0
  });
  save(prev);
  render();
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
