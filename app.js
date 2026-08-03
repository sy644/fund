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
try {
  // 优先用 data.js 里的 FUNDS_INIT, 否则空数组
  var initSource = (typeof FUNDS_INIT !== 'undefined') ? FUNDS_INIT : DEFAULT_INIT;
  var s = localStorage.getItem('funds');
  state = s ? JSON.parse(s) : JSON.parse(JSON.stringify(initSource));
  // 初始化 nav_history: 首次加载或为空时, 用 demo 的 NAV_HISTORY_INIT
  if (typeof NAV_HISTORY_INIT !== 'undefined' && Array.isArray(NAV_HISTORY_INIT)) {
    var cur = (() => { try { return JSON.parse(localStorage.getItem('nav_history') || '[]'); } catch(e) { return []; }})();
    if (!Array.isArray(cur) || cur.length === 0) {
      localStorage.setItem('nav_history', JSON.stringify(NAV_HISTORY_INIT));
    }
  }
  // 数据迁移: 旧 buys 缺 type 字段, 负数 amount 自动归类为卖出
  if (Array.isArray(state)) {
    state.forEach(f => {
      if (Array.isArray(f.buys)) {
        f.buys.forEach(b => {
          if (!b.type) b.type = (b.amount < 0) ? 'sell' : 'buy';
        });
      }
    });
  }
  // URL ?fund=<code> 支持 nav.html 双击跳转
  try {
    var qCode = new URLSearchParams(location.search).get('fund');
    if (qCode && Array.isArray(state)) {
      var idx = state.findIndex(f => f.code === qCode);
      if (idx >= 0) {
        // activeTab = idx (基金位置), 但默认仍是汇总, 这里用 sessionStorage 标记
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
  // 主: 天天基金最新净值 (JSONP,专门给前端用,CORS 友好)
  try {
    var url1 = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
    var r1 = await fetch(url1);
    var t1 = await r1.text();
    // 格式: jsonpgz({"fundcode":"513770","name":"港股互联","jzrq":"2025-xx-xx","dwjz":"0.6854","gsz":"0.6854","gszzl":"-13.2","gztime":"..."});
    var m1 = t1.match(/jsonpgz\(([^)]+)\)/);
    if (m1) {
      var d = JSON.parse(m1[1]);
      var nav = parseFloat(d.dwjz || d.gsz || 0);
      var date = d.jzrq || d.gztime || '';
      if (nav > 0) return { nav, date };
    }
  } catch (e) { console.warn('天天基金抓取失败', e); }

  // 备: 东方财富 (备用接口)
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

  // 备2: 腾讯基金接口
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
  // app.js - refreshAll 函数
for (const f of state) {
  // 去掉下面这行判断，或者把它注释掉
  // if (f._manualPrice) continue;//
  
  var r = null;
  try { r = await fetchNAV(f.code); } catch(e) {}
  if (r && r.nav) {
    // 抓取成功 → 强制覆盖，并且清除手动锁定标记（防止其他地方干扰）
    f.price = r.nav;
    f.priceDate = r.date || new Date().toISOString().split('T')[0];
    f._manualPrice = false; // 👈 清除锁定标记，保持自动状态
  } else if (cache[f.code]) {
    var c = cache[f.code];
    var last = Array.isArray(c) ? c[c.length-1] : c;
    if (last && last.nav) {
      f.price = last.nav;
      f.priceDate = last.date || last.fetched;
      f._manualPrice = false;
    }
  }
  // 如果抓取失败，保留现有值（可能是手动填的或旧的抓取值）
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
var saveTimer = null;
function saveDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 50);  // 50ms 批量保存
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

// 注入自定义动画样式(持有收益/收益率闪烁 + 滑选日期 + 按钮优化)
(function injectAnimStyles() {
  if (document.getElementById('fund-anim-style')) return;
  var s = document.createElement('style');
  s.id = 'fund-anim-style';
  s.textContent = `
    @keyframes pnlPulse {
      0%, 100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 var(--pnl-color, #dc2626);
        filter: brightness(1);
      }
      50% {
        transform: scale(1.04);
        box-shadow: 0 0 18px 4px var(--pnl-color, #dc2626);
        filter: brightness(1.25);
      }
    }
    .pnl-flash {
      transition: all .2s ease;
    }
    /* 滑选日期控件 (xx/xx 格式) */
    .bdate-slider {
      appearance: none;
      -webkit-appearance: none;
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
    /* 顶部按钮优化(更柔和的颜色) */
    .add-btn, .del-btn, .buy-toggle-btn {
      transition: all .2s ease;
    }
    /* 添加/撤销/重做按钮 - 浅灰蓝柔和配色 */
    .add-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(0,240,255,0.08);
      color: #67e8f9;
      border: 1.5px solid rgba(0,240,255,0.3);
      font-size: 18px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-right: 6px;
      box-shadow: none;
    }
    .add-btn:hover {
      background: rgba(0,240,255,0.18);
      box-shadow: 0 0 8px rgba(0,240,255,0.25);
    }
    /* 滑选删除模式的红色按钮 - 颜色更柔和 */
    .buy-toggle-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(255,255,255,0.06);
      color: #94a3b8;
      border: 1.5px solid rgba(148,163,184,0.35);
      font-size: 18px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
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
// activeTab 持久化: 刷新页面后恢复上次的 tab
function getSavedActiveTab() {
  try {
    var s = localStorage.getItem('activeTab');
    return s !== null ? parseInt(s, 10) : -1;
  } catch(e) { return -1; }
}
function saveActiveTab(t) {
  try { localStorage.setItem('activeTab', String(t)); } catch(e) {}
}
var activeTab = getSavedActiveTab(); // -1 表示默认值, render 时根据是否有基金动态选择

function render() {
  var html = '<div class="tab-bar">';
  // 存表按钮 - 最左(和 + 同款圆形)
  html += '<button class="tab-add tab-save-btn" id="tabSaveBtn" title="导出收益表">📊</button>';
  // 手动记录净值按钮
  html += '<button class="tab-add tab-refresh-btn" id="refreshBtn" title="手动记录净值">📝</button>';
  // 状态间用间隔
  html += '<div style="width:6px;flex-shrink:0"></div>';
  // 汇总 tab
  html += '<button class="tab tab-summary ' + (activeTab===state.length?'active':'') + '" data-tab="' + state.length + '">📊 汇总</button>';
  // 状态间用间隔
  html += '<div style="width:6px;flex-shrink:0"></div>';
  state.forEach((f, i) => {
    html += `<button class="tab ${i===activeTab?'active':''}" data-tab="${i}">${f.name}</button>`;
  });
  // + 按钮放最右
  html += '<button class="tab-add" data-add="1" title="新增基金">+</button>';
  html += '</div>';
  html += '<div class="tab-content">';
  // 默认页: 有基金 → 汇总(state.length), 无基金 → 第一个基金(0)
  if (activeTab < 0 || activeTab > state.length) {
    activeTab = state.length > 0 ? state.length : 0;
  }
  // nav.html 双击跳转过来: 切到指定 tab
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
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = parseInt(btn.dataset.tab);
      saveActiveTab(activeTab);
      render();
    });
  });
  // + 按钮: 新增基金
  document.querySelector('.tab-add[data-add="1"]')?.addEventListener('click', addNewFund);
  document.getElementById('tabSaveBtn')?.addEventListener('click', saveData);
  // 手动记录净值 - 跳转到独立页面
  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    location.href = 'nav.html';
  });
  // 汇总表品种名改名同步到 state
  document.querySelectorAll('.sname-input').forEach(inp => {
    inp.addEventListener('blur', () => {
      var fidx = parseInt(inp.dataset.fidx);
      var newName = inp.value.trim();
      if (newName && state[fidx] && state[fidx].name !== newName) {
        state[fidx].name = newName;
        localStorage.setItem('funds', JSON.stringify(state));
        render(); // 重新渲染同步 tab
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
  // 长按删除基金 tab (排除汇总、存表、+)
  document.querySelectorAll('.tab:not(.tab-summary):not(.tab-add):not(.tab-save-btn)').forEach(btn => {
    btn.addEventListener('touchstart', e => {
      btn.classList.add('pressing');
      var secs = 1.0;
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
        var idx = parseInt(btn.dataset.tab);
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
    }, {passive: true});
    var cancel = () => {
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
  // 兼容: activeTab 越界修复
  if (activeTab < 0 || activeTab > state.length) {
    activeTab = state.length > 0 ? state.length : 0;
  }
  updateTime();
}

function bindFundEvents(f, i) {
  var priceIn = document.getElementById(`price-${i}`);
  if (priceIn) priceIn.addEventListener('input', e => {
    var prev = JSON.stringify(state);
    f.price = parseFloat(e.target.value) || 0;
   // f._manualPrice = true; //
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
    var inp = document.getElementById(`${k}-${i}`);
    if (inp) inp.addEventListener('input', e => {
      var field = k.replace('price-', '');
      var prev = JSON.stringify(state);
      f[field] = parseFloat(e.target.value) || 0;
      f._manualFields = f._manualFields || {};
      f._manualFields[field] = true;
 