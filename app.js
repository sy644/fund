// 公共统一收益/份额计算工具（全局唯一计算逻辑，杜绝多处重复）
function calcFundMetrics(fund) {
  const { initShares = 0, initCost = 0, buys = [], price = 0, basePrice = 0, target = 0 } = fund;
  // 初始投入：初始份额 × 独立初始成本（修复原basePrice错误逻辑）
  const investInit = initShares * initCost;

  // 遍历买入记录，价格为0直接跳过份额换算，不生成虚假份额
  let investBuy = 0;
  let shareBuy = 0;
  for (const b of buys) {
    const amt = Number(b.amount || 0);
    const p = Number(b.price || 0);
    investBuy += amt;
    if (p > 0) shareBuy += amt / p;
  }

  const totalInvest = investInit + investBuy;
  const totalShare = initShares + shareBuy;
  const marketValue = totalShare * price;
  const pnl = marketValue - totalInvest;
  const profitRate = totalInvest > 0 ? Number((pnl / totalInvest) * 100) : 0;
  const avgCost = totalShare > 0 ? Number((totalInvest / totalShare).toFixed(4)) : 0;
  const dropPct = basePrice > 0 ? Number(((price - basePrice) / basePrice) * 100) : 0;
  const progress = target > 0 ? Number((totalInvest / target) * 100) : 0;

  return {
    investInit, investBuy, totalInvest,
    totalShare, shareBuy,
    marketValue, pnl, profitRate, avgCost,
    dropPct, progress
  };
}

// 基金空初始数据
const FUNDS_INIT = [];
let state;
let undoStack = [];
let redoStack = [];

// 加载本地存储基金数据
try {
  const localRaw = localStorage.getItem('funds');
  state = localRaw ? JSON.parse(localRaw) : JSON.parse(JSON.stringify(FUNDS_INIT));
  render();
  startAutoRefresh();
} catch (e) {
  const fundWrap = document.getElementById('funds');
  if (fundWrap) fundWrap.innerHTML = `<pre style="color:red;padding:20px">STATE INIT ERROR: ${e.message} | FUNDS_INIT type: ${typeof FUNDS_INIT}</pre>`;
  throw e;
}

// 抓取天天基金实时净值
async function fetchNAV(code) {
  const url = `https://fund.eastmoney.com/f10/FundNetValue.ashx?type=latest&code=${code}&_=${Date.now()}`;
  try {
    const resp = await fetch(url);
    const text = await resp.text();
    const jsonpMatch = text.match(/jsonpCallback\((\{.*\})\)/);
    if (!jsonpMatch) return null;
    const data = JSON.parse(jsonpMatch[1]);
    if (data.Data && data.Data.length > 0) {
      const item = data.Data[0];
      const nav = parseFloat(item.NETVALUE || 0);
      const date = item.NAVDATE || '';
      if (nav > 0) return { nav, date };
    }
  } catch (e) {
    console.warn('天天基金净值抓取失败', e);
  }
  return null;
}

// 一键刷新全部基金净值
async function refreshAll() {
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '⏳';
  }
  let cacheData = {};
  try {
    const cacheResp = await fetch('nav_cache.json');
    if (cacheResp.ok) cacheData = await cacheResp.json();
  } catch (e) {}

  for (const fund of state) {
    let netInfo = null;
    try { netInfo = await fetchNAV(fund.code); } catch (e) {}
    if (netInfo && netInfo.nav) {
      fund.price = netInfo.nav;
      fund.priceDate = netInfo.date || new Date().toISOString().split('T')[0];
      fund._manualPrice = false;
    } else if (cacheData[fund.code]) {
      const cacheItem = cacheData[fund.code];
      const lastRecord = Array.isArray(cacheItem) ? cacheItem[cacheItem.length - 1] : cacheItem;
      if (lastRecord && lastRecord.nav) {
        fund.price = lastRecord.nav;
        fund.priceDate = lastRecord.date || lastRecord.fetched;
        fund._manualPrice = false;
      }
    }
  }

  if (refreshBtn) {
    refreshBtn.disabled = false;
    refreshBtn.textContent = '🔄';
  }
  localStorage.setItem('funds', JSON.stringify(state));
  render();
}

// 保存数据，支持撤销快照记录
function save(prevSnap) {
  try {
    if (prevSnap) {
      undoStack.push(prevSnap);
      if (undoStack.length > 30) undoStack.shift();
    }
    localStorage.setItem('funds', JSON.stringify(state));
    updateSaveBadge();
  } catch (e) {
    console.error('数据保存异常', e);
  }
}

let saveDelayTimer = null;
function saveDebounced() {
  clearTimeout(saveDelayTimer);
  saveDelayTimer = setTimeout(save, 50);
}

// 更新保存状态提示
function updateSaveBadge() {
  const badgeEl = document.getElementById('saveStatus');
  if (!badgeEl) return;
  const timeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  badgeEl.textContent = `已存 ${timeStr}`;
  badgeEl.classList.add('saved');
  setTimeout(() => badgeEl.classList.remove('saved'), 800);
}

const fundContainer = document.getElementById('funds');

// 生成定投档位表格数据
function buildTierTable(fund) {
  const { target, initShares, multi, tiers, basePrice, priceLow, priceMid, priceHigh, step, initCost = 0 } = fund;
  const initInvest = initShares * initCost;
  const remainingInvest = target - initInvest;
  const m1 = remainingInvest * (1 - multi) / (1 - Math.pow(multi, tiers));
  let buyStartTier = 0;
  if (priceMid && priceMid > basePrice) {
    buyStartTier = Math.ceil((priceMid - basePrice) / basePrice / step);
  }
  const buyEndTier = buyStartTier - (tiers - 1);
  const rows = [];

  for (let t = 10; t >= -10; t--) {
    let amount = null, label, triggerPrice, isMid = false, isLow = false, isHigh = false, isBuyTier = false;
    if (t === 0) {
      amount = initInvest;
      label = '基准';
      triggerPrice = basePrice;
    } else {
      triggerPrice = basePrice * (1 + t * step);
      label = `${t > 0 ? '+' : ''}${t}档`;
      const tierIndex = buyStartTier - t + 1;
      if (tierIndex >= 1 && tierIndex <= tiers) {
        amount = m1 * Math.pow(multi, tierIndex - 1);
        isBuyTier = true;
      }
    }
    if (priceLow && Math.abs(triggerPrice - priceLow) <= 0.01) isLow = true;
    if (priceMid && Math.abs(triggerPrice - priceMid) <= 0.01) isMid = true;
    if (priceHigh && Math.abs(triggerPrice - priceHigh) <= 0.01) isHigh = true;
    rows.push({ tier: t, label, amt: amount, trigger: triggerPrice, isMid, isLow, isHigh, isBuy: isBuyTier, buyStart: buyStartTier, buyEnd: buyEndTier });
  }
  return rows;
}

// 计算当前价格对应档位
function calcTier(fund) {
  const { price, basePrice, step } = fund;
  if (!price) return { tier: 0, dropPct: 0 };
  const rawOffset = (price - basePrice) / basePrice / step;
  const floorVal = Math.floor(rawOffset);
  const ceilVal = Math.ceil(rawOffset);
  const roundVal = Math.round(rawOffset);
  const floorTrigger = basePrice * (1 + floorVal * step);
  const ceilTrigger = basePrice * (1 + ceilVal * step);
  let currentTier;
  if (Math.abs(price - floorTrigger) <= 0.01) currentTier = floorVal;
  else if (Math.abs(price - ceilTrigger) <= 0.01) currentTier = ceilVal;
  else currentTier = roundVal;
  const dropPct = Number(((price - basePrice) / basePrice) * 100);
  return { tier: currentTier, dropPct };
}

// 获取当前触发加仓档位、邻近档位信息
function calcCurrent(fund) {
  const tierRows = buildTierTable(fund);
  const { tier, dropPct } = calcTier(fund);
  const buyRows = tierRows.filter(r => r.isBuy);
  if (buyRows.length === 0) {
    return { tier, dropPct, currentAmt: null, currentTrigger: null, currentTier: null, neighbors: [], currentIsBuy: false };
  }
  const triggeredList = buyRows.filter(r => fund.price <= r.trigger);
  const triggerItem = triggeredList.length > 0 ? triggeredList.reduce((min, r) => r.tier < min.tier ? r : min) : null;
  if (!triggerItem) {
    const nearestItem = buyRows.reduce((min, r) => Math.abs(fund.price - r.trigger) < Math.abs(fund.price - min.trigger) ? r : min);
    const idx = buyRows.findIndex(r => r.tier === nearestItem.tier);
    const sliceStart = Math.max(0, idx - 1);
    const sliceEnd = Math.min(buyRows.length, idx + 2);
    return {
      tier, dropPct,
      currentAmt: nearestItem.amt,
      currentTrigger: nearestItem.trigger,
      currentTier: nearestItem.tier,
      currentIsBuy: false,
      neighbors: buyRows.slice(sliceStart, sliceEnd)
    };
  }
  const idx = buyRows.findIndex(r => r.tier === triggerItem.tier);
  const sliceStart = Math.max(0, idx - 1);
  const sliceEnd = Math.min(buyRows.length, idx + 2);
  return {
    tier, dropPct,
    currentAmt: triggerItem.amt,
    currentTrigger: triggerItem.trigger,
    currentTier: triggerItem.tier,
    currentIsBuy: true,
    neighbors: buyRows.slice(sliceStart, sliceEnd)
  };
}

// 下拉刷新逻辑
let touchStartY = 0, isPulling = false;
function setupPullToRefresh() {
  document.addEventListener('touchstart', e => {
    if (window.scrollY === 0) {
      touchStartY = e.touches[0].clientY;
      isPulling = true;
    }
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (isPulling && window.scrollY === 0) {
      const deltaY = e.touches[0].clientY - touchStartY;
      if (deltaY > 80) showPullHint();
    }
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (isPulling) {
      const deltaY = e.changedTouches[0].clientY - touchStartY;
      if (deltaY > 80 && window.scrollY === 0) triggerRefresh();
      isPulling = false;
      hidePullHint();
    }
  });
}
function showPullHint() {
  let hintEl = document.getElementById('pullHint');
  if (!hintEl) {
    hintEl = document.createElement('div');
    hintEl.id = 'pullHint';
    hintEl.innerHTML = '↓ 松手刷新';
    document.body.appendChild(hintEl);
  }
  hintEl.classList.add('show');
}
function hidePullHint() {
  const hintEl = document.getElementById('pullHint');
  if (hintEl) hintEl.classList.remove('show');
}
function triggerRefresh() {
  localStorage.setItem('funds', JSON.stringify(state));
  refreshAll();
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    const oldText = refreshBtn.textContent;
    refreshBtn.textContent = '✓';
    setTimeout(() => refreshBtn.textContent = oldText, 800);
  }
}
document.addEventListener('DOMContentLoaded', setupPullToRefresh);

let activeTabIndex = 0;
// 全局主渲染入口
function render() {
  let html = '<div class="tab-bar">';
  html += `<button class="tab tab-summary ${activeTabIndex === state.length ? 'active' : ''}" data-tab="${state.length}">📊 汇总</button>`;
  html += '<div style="width:8px;flex-shrink:0"></div>';
  state.forEach((fund, idx) => {
    html += `<button class="tab ${idx === activeTabIndex ? 'active' : ''}" data-tab="${idx}">${fund.name}</button>`;
  });
  html += '<button class="tab-add" data-add="1" title="新增基金">+</button>';
  html += '</div>';
  html += '<div class="tab-content">';
  if (activeTabIndex < state.length) html += renderFundSingle(state[activeTabIndex], activeTabIndex);
  else html += renderSummaryPage();
  html += '</div>';
  fundContainer.innerHTML = html;

  // 标签切换绑定
  document.querySelectorAll('.tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      activeTabIndex = parseInt(tabBtn.dataset.tab);
      render();
    });
  });
  document.querySelector('.tab-add')?.addEventListener('click', addNewFund);

  // 基金名称修改同步
  document.querySelectorAll('.sname-input').forEach(input => {
    input.addEventListener('blur', () => {
      const fundIdx = parseInt(input.dataset.fidx);
      const newName = input.value.trim();
      if (newName && state[fundIdx] && state[fundIdx].name !== newName) {
        state[fundIdx].name = newName;
        localStorage.setItem('funds', JSON.stringify(state));
        render();
      }
    });
    input.addEventListener('focus', () => input.style.borderColor = 'var(--neon-cyan)');
    input.addEventListener('blur', () => input.style.borderColor = 'transparent');
  });

  // 长按删除基金逻辑
  let pressTimer = null, progressTimer = null;
  function showTabTip(text) {
    let tipEl = document.getElementById('tabHint');
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.id = 'tabHint';
      tipEl.className = 'tab-hint';
      document.body.appendChild(tipEl);
    }
    tipEl.textContent = text;
    tipEl.classList.add('show');
  }
  function hideTabTip() {
    const tipEl = document.getElementById('tabHint');
    if (tipEl) tipEl.classList.remove('show');
  }
  document.querySelectorAll('.tab').forEach(tabBtn => {
    tabBtn.addEventListener('touchstart', e => {
      tabBtn.classList.add('pressing');
      let remainSec = 1.0;
      showTabTip(`松开删除 · ${remainSec.toFixed(1)}s`);
      progressTimer = setInterval(() => {
        remainSec -= 0.1;
        if (remainSec <= 0) clearInterval(progressTimer);
        showTabTip(`松开删除 · ${remainSec.toFixed(1)}s`);
      }, 100);
      pressTimer = setTimeout(() => {
        clearInterval(progressTimer);
        tabBtn.classList.remove('pressing');
        hideTabTip();
        const idx = parseInt(tabBtn.dataset.tab);
        if (!isNaN(idx) && state[idx]) {
          if (confirm(`确定删除 ${state[idx].name}？所有买入记录将丢失`)) deleteFund(idx);
        }
      }, 1000);
    }, { passive: true });
    const cancelPress = () => {
      clearTimeout(pressTimer);
      clearInterval(progressTimer);
      tabBtn.classList.remove('pressing');
      hideTabTip();
    };
    tabBtn.addEventListener('touchend', cancelPress);
    tabBtn.addEventListener('touchmove', cancelPress);
    tabBtn.addEventListener('touchcancel', cancelPress);
  });

  if (activeTabIndex < state.length) bindFundEvent(state[activeTabIndex], activeTabIndex);
  else bindSummaryEvent();
  updateTimeDisplay();
}

function bindSummaryEvent() {}

// 汇总页面渲染
function renderSummaryPage() {
  let html = '<div class="fund" style="border-top: 4px solid #FFD700">';
  html += '<div class="summary-title">📊 投资汇总</div>';
  let totalInvest = 0, totalMarketVal = 0, totalTargetSum = 0, totalShareSum = 0;
  const fundStats = state.map(fund => {
    const metric = calcFundMetrics(fund);
    totalInvest += metric.totalInvest;
    totalMarketVal += metric.marketValue;
    totalTargetSum += fund.target || 0;
    totalShareSum += metric.totalShare;
    return { fund, ...metric };
  });
  const totalPnl = totalMarketVal - totalInvest;
  const totalRate = totalInvest > 0 ? Number((totalPnl / totalInvest * 100).toFixed(2)) : 0;
  const profitColor = totalPnl >= 0 ? '#16a34a' : '#dc2626';
  html += '<div class="summary-big">';
  html += `<div class="sb-stat"><span>总投入</span><b>${Math.round(totalInvest).toLocaleString()}</b></div>`;
  html += `<div class="sb-stat"><span>总市值</span><b>${Math.round(totalMarketVal).toLocaleString()}</b></div>`;
  html += `<div class="sb-stat"><span>总收益</span><b style="color:${profitColor}">${totalPnl >= 0 ? '+' : ''}${Math.round(totalPnl).toLocaleString()}</b></div>`;
  html += `<div class="sb-stat"><span>总收益率</span><b style="color:${profitColor}">${totalRate}%</b></div>`;
  html += `<div class="sb-stat"><span>完成度</span><b>${totalTargetSum > 0 ? (totalInvest / totalTargetSum * 100).toFixed(1) : '0'}%</b></div>`;
  html += `<div class="sb-stat"><span>总份额</span><b>${Math.round(totalShareSum).toLocaleString()}</b></div>`;
  html += '</div>';
  html += '<div class="section-title">📋 各品种明细</div>';
  html += '<div class="sum-table-wrap"><table class="buy-table"><thead><tr><th>品种</th><th>现价</th><th>距基准</th><th>金额</th><th>份额</th><th>收益</th><th>收益率</th><th>投入</th><th>完成度</th></tr></thead><tbody>';
  fundStats.forEach(item => {
    const profitTextColor = item.pnl >= 0 ? '#16a34a' : '#dc2626';
    const dropTextColor = item.dropPct < 0 ? '#dc2626' : '#16a34a';
    const dropStr = `${item.dropPct >= 0 ? '+' : ''}${item.dropPct.toFixed(1)}%`;
    html += '<tr>';
    html += `<td><input type="text" class="sname-input" data-fidx="${state.indexOf(item.fund)}" value="${item.fund.name}" style="width:80px;background:transparent;border:1px solid transparent;color:inherit;font-weight:700;font-size:13px;padding:2px 4px;border-radius:6px"></td>`;
    html += `<td>${item.fund.price.toFixed(4)}</td>`;
    html += `<td style="color:${dropTextColor}">${dropStr}</td>`;
    html += `<td>${Math.round(item.marketValue).toLocaleString()}</td>`;
    html += `<td>${Math.round(item.totalShare).toLocaleString()}</td>`;
    html += `<td style="color:${profitTextColor}">${item.pnl >= 0 ? '+' : ''}${Math.round(item.pnl).toLocaleString()}</td>`;
    html += `<td style="color:${profitTextColor}">${item.profitRate.toFixed(1)}%</td>`;
    html += `<td>${Math.round(item.totalInvest).toLocaleString()}</td>`;
    html += `<td>${item.progress.toFixed(0)}%</td>`;
    html += '</tr>';
  });
  html += `<tr style="background:#1F4E78;color:#fff;font-weight:700">
    <td>合计</td><td>-</td><td>-</td>
    <td>${Math.round(totalMarketVal).toLocaleString()}</td>
    <td>${Math.round(totalShareSum).toLocaleString()}</td>
    <td style="color:#FFD700">${totalPnl >= 0 ? '+' : ''}${Math.round(totalPnl).toLocaleString()}</td>
    <td style="color:#FFD700">${totalRate}%</td>
    <td>${Math.round(totalInvest).toLocaleString()}</td>
    <td>${totalTargetSum > 0 ? (totalInvest / totalTargetSum * 100).toFixed(0) : '0'}%</td>
  </tr>`;
  html += '</tbody></table></div>';
  html += '<div class="section-title">💡 综合性投资建议</div>';
  html += '<div class="advice-list">';
  fundStats.forEach(item => {
    const { fund } = item;
    const { currentIsBuy, currentAmt, currentTier, currentTrigger } = calcCurrent(fund);
    const tierSign = currentTier > 0 ? '+' : '';
    const dropStr = `${item.dropPct >= 0 ? '+' : ''}${item.dropPct.toFixed(1)}%`;
    const dropColor = item.dropPct < -10 ? '#dc2626' : (item.dropPct < -3 ? '#f59e0b' : (item.dropPct > 0 ? '#16a34a' : '#93A3BD'));
    let adviceText = '', opClass = 'normal', actionText = '观望', reasonText = '';
    if (currentIsBuy) {
      opClass = 'urgent';
      actionText = '🔴 立即补仓';
      adviceText = `${tierSign}${currentTier} 档已触发，建议补 ${Math.round(currentAmt)} 元`;
      reasonText = item.dropPct < -10 ? '已深度下跌，加仓区间' : (item.dropPct < 0 ? '回调至加仓点' : '走势偏弱');
    } else if (currentTrigger && (currentTrigger - fund.price) > 0 && (currentTrigger - fund.price) < 0.05) {
      opClass = 'pending';
      actionText = '⏳ 关注';
      adviceText = `距 ${tierSign}${currentTier} 档仅 ${(currentTrigger - fund.price).toFixed(4)}`;
      reasonText = '接近加仓点';
    } else if (currentTier !== null && currentTier < 0) {
      opClass = 'normal';
      actionText = '👀 持有';
      adviceText = `已跌至 ${tierSign}${currentTier} 档，未触发`;
      reasonText = item.dropPct < -15 ? '深度超跌，可考虑分批' : '下行中，耐心等待';
    } else if (currentTier > 0) {
      opClass = 'good';
      actionText = '✋ 上涨';
      adviceText = `上涨 ${tierSign}${currentTier} 档`;
      reasonText = '浮亏减少，继续持有';
    } else {
      opClass = 'normal';
      actionText = '💤 基准';
      adviceText = '现价 ≈ 基准';
      reasonText = '位置正常';
    }
    const industryMap = { '港股互联': '港股互联网(恒生科技)', '证券': '券商(牛市弹性)', '煤炭': '煤炭(红利防御)', '军工': '军工(主题博弈)' };
    const industry = industryMap[fund.name] || fund.name;
    const marketTip = item.dropPct < -15 ? '🔻 超跌，可分批' : (item.dropPct < -5 ? '⚠️ 偏弱' : (item.dropPct < 0 ? '📉 弱市' : '📈 偏强'));
    html += `<div class="advice-card ${opClass}">
      <div class="ac-head"><span class="ac-name">${fund.name}</span><span class="ac-action">${actionText}</span></div>
      <div class="ac-body">
        <div class="ac-row"><span>行业</span><b>${industry}</b></div>
        <div class="ac-row"><span>现价</span><b>${fund.price.toFixed(4)} <small style="color:${dropColor}">${dropStr}</small></b></div>
        <div class="ac-row"><span>建议</span><b>${adviceText}</b></div>
        <div class="ac-row"><span>原因</span><b style="font-size:11px;color:#6b7280">${reasonText}</b></div>
        <div class="ac-row"><span>行情</span><b style="font-size:11px">${marketTip}</b></div>
        <div class="ac-row ac-foot"><span>投入 ${Math.round(item.totalInvest).toLocaleString()} · 完成 ${item.progress.toFixed(0)}%</span><b>收益 ${item.pnl >= 0 ? '+' : ''}${Math.round(item.pnl).toLocaleString()} (${item.profitRate.toFixed(1)}%)</b></div>
      </div>
    </div>`;
  });
  // 综合判断卡片
  const triggerList = fundStats.filter(s => calcCurrent(s.fund).currentIsBuy);
  html += '<div class="advice-card total">';
  html += `<div class="ac-head"><span class="ac-name">📊 综合判断</span><span class="ac-action">${triggerList.length > 0 ? '⚡ 立即行动' : '✅ 静观其变'}</span></div>`;
  html += '<div class="ac-body">';
  if (triggerList.length > 0) {
    html += `<div class="ac-row"><span>触发</span><b style="color:#dc2626">${triggerList.length} 只基金已触发加仓</b></div>`;
    let totalAddAmt = 0;
    triggerList.forEach(s => {
      const curInfo = calcCurrent(s.fund);
      totalAddAmt += curInfo.currentAmt;
    });
    html += `<div class="ac-row"><span>建议加仓</span><b style="color:#dc2626">约 ${Math.round(totalAddAmt).toLocaleString()} 元</b></div>`;
  } else {
    html += '<div class="ac-row"><span>当前</span><b>无加仓触发点</b></div>';
  }
  html += `<div class="ac-row"><span>总收益</span><b style="color:${profitColor}">${totalPnl >= 0 ? '+' : ''}${Math.round(totalPnl).toLocaleString()} (${totalRate}%)</b></div>`;
  html += '<div class="ac-row ac-foot"><span>策略</span><b style="font-size:11px">';
  if (totalPnl < -3000) html += '⚠️ 浮亏较大，分批加仓降本';
  else if (totalPnl < 0) html += '📊 浮亏控制中，等待触发补仓';
  else html += '🎉 浮盈状态，可适度止盈';
  html += '</b></div>';
  html += '</div></div>';
  html += '</div></div>';
  return html;
}

function updateAllCardValues() {
  state.forEach((_, idx) => updateSingleCardValue(idx));
}

function updateSingleCardValue(idx) {
  const fund = state[idx];
  const metric = calcFundMetrics(fund);
  const cardDom = document.querySelectorAll('.fund')[idx];
  if (!cardDom) return;
  const tierInfo = calcCurrent(fund);
  const dropPct = metric.dropPct;
  const dropTextColor = dropPct < 0 ? '#dc2626' : '#16a34a';
  const profitClass = metric.pnl > 0 ? 'pnl-pos' : (metric.pnl < 0 ? 'pnl-neg' : '');
  // 距基准百分比
  const dropEl = cardDom.querySelector('.fund-head .fund-extra .val');
  if (dropEl) {
    dropEl.textContent = `${dropPct.toFixed(1)}%`;
    dropEl.style.color = dropTextColor;
  }
  // 邻近档位渲染
  const neighborItems = cardDom.querySelectorAll('.neighbor-row .nbr');
  neighborItems.forEach((el, i) => {
    const n = tierInfo.neighbors[i];
    if (!n) return;
    const tierSign = n.tier > 0 ? '+' : '';
    el.querySelector('.nbr-tier').textContent = `${tierSign}${n.tier}档`;
    el.querySelector('.nbr-trig').textContent = n.trigger.toFixed(4);
    el.querySelector('.nbr-amt').textContent = Math.round(n.amt);
    el.classList.toggle('cur', n.tier === tierInfo.currentTier);
  });
  // 环形完成度
  const ringAmtEl = cardDom.querySelector('.ring-amount');
  const ringFootEl = cardDom.querySelector('.ring-foot');
  const ringPctEl = cardDom.querySelector('.ring-pct');
  const ringFillEl = cardDom.querySelector('.ring-fill-circle');
  if (ringAmtEl) ringAmtEl.textContent = `${Math.round(metric.totalInvest).toLocaleString()} / ${fund.target.toLocaleString()}`;
  if (ringFootEl) ringFootEl.textContent = `剩余 ${Math.max(0, fund.target - metric.totalInvest).toLocaleString()}`;
  if (ringPctEl) ringPctEl.textContent = `${(metric.progress * 100).toFixed(0)}%`;
  if (ringFillEl) {
    const circumference = 2 * Math.PI * 86;
    const pct = Math.min(1, metric.progress);
    ringFillEl.setAttribute('stroke-dasharray', `${(circumference * pct).toFixed(1)} ${circumference.toFixed(1)}`);
  }
  // 持仓统计数值
  const statItems = cardDom.querySelectorAll('.fund-stats > div .val');
  if (statItems[0]) statItems[0].textContent = Math.round(metric.marketValue).toLocaleString();
  if (statItems[1]) statItems[1].textContent = Math.round(metric.totalShare).toLocaleString();
  if (statItems[2]) statItems[2].textContent = metric.avgCost > 0 ? metric.avgCost.toFixed(4) : '-';
  if (statItems[3]) {
    statItems[3].textContent = `${metric.pnl >= 0 ? '+' : ''}${Math.round(metric.pnl).toLocaleString()}`;
    statItems[3].parentElement.className = profitClass;
  }
  if (statItems[4]) {
    statItems[4].textContent = metric.totalInvest > 0 ? `${metric.profitRate.toFixed(1)}%` : '-';
    statItems[4].parentElement.className = profitClass;
  }
  // 买入合计底部
  const buyTotalMoney = cardDom.querySelector('.buy-table tfoot td:nth-child(4) b');
  const buyTotalShare = cardDom.querySelector('.buy-table tfoot td:nth-child(5) b');
  if (buyTotalMoney) buyTotalMoney.textContent = Math.round(metric.totalInvest).toLocaleString();
  if (buyTotalShare) buyTotalShare.textContent = Math.round(metric.totalShare).toLocaleString();
}

// 单只基金页面渲染
function renderFundSingle(fund, idx) {
  const metric = calcFundMetrics(fund);
  const tierInfo = calcCurrent(fund);
  const dropPct = metric.dropPct;
  const dropTextColor = dropPct < 0 ? '#dc2626' : '#16a34a';
  const profitClass = metric.pnl > 0 ? 'pnl-pos' : (metric.pnl < 0 ? 'pnl-neg' : '');
  const progress = metric.progress;
  const tierTableRows = buildTierTable(fund);
  return `
    <div class="fund" style="border-top: 4px solid ${fund.color}">
      <div class="fund-head">
        <div class="fund-name">${fund.name} <span class="code-mini">${fund.code}</span></div>
        <div class="fund-price">
          <span class="lbl">现价</span>
          <input type="number" step="0.0001" id="price-${idx}" value="${(fund.price || 0).toFixed(4)}" inputmode="decimal" class="price-input">
        </div>
        <div class="fund-extra">
          <span class="lbl">距基准</span>
          <span class="val" style="color:${dropTextColor}">${dropPct.toFixed(1)}%</span>
        </div>
      </div>
      <div class="neighbor-section">
        ${(() => {
          const ns = tierInfo.neighbors || [];
          if (ns.length === 0) return '';
          return `<div class="nb-hbar">
            ${ns.map(n => {
              const ts = n.tier > 0 ? '+' : '';
              const isCur = n.tier === tierInfo.currentTier;
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
              <div class="param-row"><span class="param-lbl">基准价</span><input type="number" step="0.0001" id="base-basePrice-${idx}" value="${fund.basePrice}" class="param-input"></div>
              <div class="param-row highlight"><span class="param-lbl">初始份额</span><input type="number" step="1" id="base-initShares-${idx}" value="${fund.initShares}" class="param-input"></div>
              <div class="param-row highlight"><span class="param-lbl">初始成本</span><input type="number" step="0.0001" id="base-initCost-${idx}" value="${fund.initCost || 0}" class="param-input"></div>
              <div class="param-row"><span class="param-lbl">目标</span><input type="number" step="100" id="base-target-${idx}" value="${fund.target}" class="param-input"></div>
              <div class="param-row"><span class="param-lbl">中点</span><input type="number" step="0.0001" id="price-priceMid-${idx}" value="${fund.priceMid || 0}" class="param-input"></div>
              <div class="param-row"><span class="param-lbl">低点</span><input type="number" step="0.0001" id="price-priceLow-${idx}" value="${fund.priceLow || 0}" class="param-input"></div>
              <div class="param-row"><span class="param-lbl">高点</span><input type="number" step="0.0001" id="price-priceHigh-${idx}" value="${fund.priceHigh || 0}" class="param-input"></div>
            </div>
          </div>
        </div>
        <div class="ring-center">
          ${(() => {
            const pct = Math.min(1, progress);
            const C = 2 * Math.PI * 86;
            const filled = C * pct;
            const ca = pct >= 1 ? '#16a34a' : '#00e5ff';
            const cb = pct >= 1 ? '#39ff14' : '#39ff14';
            const ringId = `rg_${idx}_${Date.now()}`;
            return `
              <svg viewBox="0 0 200 200" class="ring-svg ring-anim">
                <defs>
                  <linearGradient id="${ringId}" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="${ca}" />
                    <stop offset="100%" stop-color="${cb}" />
                  </linearGradient>
                </defs>
                <circle class="ring-track" cx="100" cy="100" r="86" />
                <circle class="ring-fill ring-fill-anim" cx="100" cy="100" r="86"
                  stroke-dasharray="${C}"
                  stroke-dashoffset="${C - filled}"
                  style="--target-dashoffset: ${C - filled};"
                  transform="rotate(-90 100 100)"
                  stroke="url(#${ringId})" />
                <text x="100" y="100" text-anchor="middle" dominant-baseline="central" font-size="22" font-weight="800" fill="currentColor" class="ring-pct">${(progress * 100).toFixed(0)}%</text>
                <text x="100" y="122" text-anchor="middle" font-size="9" fill="currentColor" class="ring-sub">完成度</text>
              </svg>
              <div class="ring-foot">剩余 ${Math.max(0, fund.target - metric.totalInvest).toLocaleString()}</div>
            `;
          })()}
        </div>
      </div>
      <div class="hold-panel">
        <div class="hold-grid">
          <div class="hold-cell"><div class="hold-lbl">持有金额</div><div class="hold-val">${metric.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
          <div class="hold-cell"><div class="hold-lbl">持有份额</div><div class="hold-val">${metric.totalShare.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
          <div class="hold-cell"><div class="hold-lbl">持仓成本</div><div class="hold-val">${metric.avgCost > 0 ? metric.avgCost.toFixed(4) : '-'}</div></div>
          <div class="hold-cell ${profitClass}"><div class="hold-lbl">持有收益</div><div class="hold-val">${metric.pnl >= 0 ? '+' : ''}${metric.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
          <div class="hold-cell ${profitClass}"><div class="hold-lbl">持有收益率</div><div class="hold-val">${metric.totalInvest > 0 ? metric.profitRate.toFixed(2) + '%' : '-'}</div></div>
        </div>
      </div>
      <div class="buy-section">
        <div class="section-title">
          📋 买入记录
          <div class="buy-btns">
            <button class="add-btn" id="undo-${idx}" title="撤销">↩️</button>
            <button class="add-btn" id="redo-${idx}" title="重做">↪️</button>
            <button class="add-btn" id="addBuy-${idx}">+ 添加</button>
          </div>
        </div>
        <div class="buy-table-wrap">
          <table class="buy-table">
            <thead><tr><th>日期</th><th>价格</th><th>金额</th><th>×</th></tr></thead>
            <tbody>
              ${fund.buys.map((b, bi) => `
              <tr>
                <td><input type="text" id="bdate-${idx}-${bi}" value="${b.date}" class="bcell"></td>
                <td><input type="number" step="0.0001" id="bprice-${idx}-${bi}" value="${b.price}" class="bcell"></td>
                <td><input type="number" step="1" id="bamt-${idx}-${bi}" value="${b.amount ? Math.round(b.amount) : ''}" class="bcell"></td>
                <td><button class="del-btn" data-buy-del="${idx}" data-idx="${bi}">×</button></td>
              </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2"><b>合计</b></td>
                <td><b>${Math.round(metric.totalInvest).toLocaleString()}</b></td>
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
            const leftRows = tierTableRows.filter(r => r.tier >= 0).sort((a, b) => b.tier - a.tier);
            const rightRows = tierTableRows.filter(r => r.tier < 0).sort((a, b) => b.tier - a.tier);
            const maxLength = Math.max(leftRows.length, rightRows.length);
            const renderRowDom = (row) => {
              if (!row) return '<div class="tier-row empty"></div>';
              let cls = '';
              if (row.tier === tierInfo.tier) cls = 'current-tier';
              else if (row.tier === 0) cls = 'base-tier';
              else if (row.isBuy) cls = 'buy-tier';
              if (row.isMid) cls += ' mid-tier';
              return `<div class="tier-row ${cls}">
                <span class="t-label">${row.label}${row.isMid ? ' ⭐' : ''}</span>
                <span class="t-trigger">${row.trigger ? row.trigger.toFixed(4) : '-'}</span>
                <span class="t-amt">${row.amt === null ? '-' : Math.round(row.amt).toLocaleString()}</span>
              </div>`;
            };
            let gridHtml = '';
            for (let i = 0; i < maxLength; i++) {
              gridHtml += renderRowDom(leftRows[i]);
              gridHtml += renderRowDom(rightRows[i]);
            }
            return gridHtml;
          })()}
        </div>
      </div>
      <div class="param-strip">
        <div class="ps-item"><span class="lbl">倍数</span><select id="param-multi-${idx}" class="param-select">${(() => { let optStr = ""; [1.0,1.05,1.10,1.15,1.20,1.25,1.30].forEach(v => optStr += `<option value="${v}"${Math.abs(v - fund.multi) < 0.001 ? ' selected' : ''}>${v.toFixed(2)}</option>`); return optStr; })()}</select></div>
        <div class="ps-item"><span class="lbl">幅度</span><select id="param-step-${idx}" class="param-select">${(() => { let optStr = ""; [0.02,0.03,0.05].forEach(v => optStr += `<option value="${v}"${Math.abs(v - fund.step) < 0.001 ? ' selected' : ''}>${(v*100).toFixed(0)}%</option>`); return optStr; })()}</select></div>
        <div class="ps-item"><span class="lbl">档数</span><select id="param-tiers-${idx}" class="param-select">${(() => { let optStr = ""; for(let v=6;v<=16;v++) optStr += `<option value="${v}"${v === fund.tiers ? ' selected' : ''}>${v}</option>`; return optStr; })()}</select></div>
      </div>
    </div>
  `;
}

function bindFundEvent(fund, idx) {
  // 现价输入
  const priceInput = document.getElementById(`price-${idx}`);
  if (priceInput) priceInput.addEventListener('input', e => {
    const snapshot = JSON.stringify(state);
    fund.price = parseFloat(e.target.value) || 0;
    fund._manualPrice = true;
    save(snapshot);
    updateSingleCardValue(idx);
  });
  // 基础参数输入
  ['base-basePrice', 'base-initShares', 'base-initCost', 'base-target'].forEach(keyId => {
    const input = document.getElementById(`${keyId}-${idx}`);
    if (!input) return;
    input.addEventListener('input', e => {
      const field = keyId.replace('base-', '');
      const snapshot = JSON.stringify(state);
      fund[field] = parseFloat(e.target.value) || 0;
      fund._manualFields = fund._manualFields || {};
      fund._manualFields[field] = true;
      save(snapshot);
      updateSingleCardValue(idx);
    });
  });
  // 高低中点价格
  ['price-priceLow', 'price-priceMid', 'price-priceHigh'].forEach(keyId => {
    const input = document.getElementById(`${keyId}-${idx}`);
    if (!input) return;
    input.addEventListener('input', e => {
      const field = keyId.replace('price-', '');
      const snapshot = JSON.stringify(state);
      fund[field] = parseFloat(e.target.value) || 0;
      fund._manualFields = fund._manualFields || {};
      fund._manualFields[field] = true;
      save(snapshot);
      updateSingleCardValue(idx);
    });
  });
  // 添加买入、撤销、重做按钮
  document.getElementById(`addBuy-${idx}`)?.addEventListener('click', () => addBuyDialog(idx));
  document.getElementById(`undo-${idx}`)?.addEventListener('click', undo);
  document.getElementById(`redo-${idx}`)?.addEventListener('click', redo);
  // 买入记录行编辑
  fund.buys.forEach((buy, bi) => {
    const dateInp = document.getElementById(`bdate-${idx}-${bi}`);
    const priceInp = document.getElementById(`bprice-${idx}-${bi}`);
    const amtInp = document.getElementById(`bamt-${idx}-${bi}`);
    if (dateInp) dateInp.addEventListener('input', e => { const snap = JSON.stringify(state); buy.date = e.target.value; save(snap); });
    if (priceInp) priceInp.addEventListener('input', e => { const snap = JSON.stringify(state); buy.price = parseFloat(e.target.value) || 0; save(snap); updateSingleCardValue(idx); });
    if (amtInp) amtInp.addEventListener('input', e => { const snap = JSON.stringify(state); buy.amount = parseFloat(e.target.value) || 0; save(snap); updateSingleCardValue(idx); });
    const delBtn = document.querySelector(`[data-buy-del="${idx}"][data-idx="${bi}"]`);
    if (delBtn) delBtn.addEventListener('click', () => { const snap = JSON.stringify(state); fund.buys.splice(bi, 1); save(snap); render(); });
  });
  // 定投参数下拉
  ['param-multi', 'param-step', 'param-tiers'].forEach(prefix => {
    const select = document.getElementById(`${prefix}-${idx}`);
    if (!select) return;
    select.onchange = () => {
      const field = prefix.replace('param-', '');
      fund[field] = parseFloat(select.value);
      save();
      render();
    };
  });
}

// 更新页面时间显示
function updateTimeDisplay() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const titleEl = document.getElementById('dateTitle');
  if (titleEl) titleEl.textContent = `${y}/${m}/${d}`;
  const badgeEl = document.getElementById('dateBadge');
  if (badgeEl) badgeEl.textContent = `${y}-${m}-${d} ${hh}:${mi}`;
  const timeEl = document.getElementById('time');
  if (timeEl) timeEl.textContent = '';
}

// 页面切出/缓存恢复重载数据
window.addEventListener('focus', () => {
  const localRaw = localStorage.getItem('funds');
  if (localRaw) {
    try {
      const newState = JSON.parse(localRaw);
      if (JSON.stringify(newState) !== JSON.stringify(state)) {
        state = newState;
        render();
      }
    } catch (e) {}
  }
});
window.addEventListener('pageshow', e => {
  if (e.persisted) {
    const localRaw = localStorage.getItem('funds');
    if (localRaw) {
      try {
        state = JSON.parse(localRaw);
        render();
      } catch (e) {}
    }
  }
});

// 自动定时刷新净值
let autoRefreshTimer = null;
function startAutoRefresh() {
  if (autoRefreshTimer) return;
  setTimeout(refreshAll, 5000);
  autoRefreshTimer = setInterval(refreshAll, 5 * 60 * 1000);
}
function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

// 导出HTML打印简表
function showExportModal() {
  const now = new Date();
  const timeStamp = `${now.toISOString().split('T')[0]} ${now.toTimeString().substring(0, 5)}`;
  const fundStats = state.map(f => ({ f, ...calcFundMetrics(f) }));
  const totalInvestSum = fundStats.reduce((s, x) => s + x.totalInvest, 0);
  const totalShareSum = fundStats.reduce((s, x) => s + x.totalShare, 0);
  const totalMarketSum = fundStats.reduce((s, x) => s + x.marketValue, 0);
  const totalPnlSum = totalMarketSum - totalInvestSum;
  const totalTargetSum = state.reduce((s, f) => s + f.target, 0);
  const totalRateVal = totalInvestSum > 0 ? Number((totalPnlSum / totalInvestSum * 100).toFixed(2)) : 0;
  const getProfitColor = val => val >= 0 ? '#16a34a' : '#dc2626';
  const getSign = val => val >= 0 ? '+' : '';

  const tableRows = fundStats.map(item => {
    const ratio = totalInvestSum > 0 ? Number((item.totalInvest / totalInvestSum * 100).toFixed(1)) : 0;
    return `<tr>
      <td><b>${item.f.name}</b><br><small>${item.f.code}</small></td>
      <td>${item.f.price.toFixed(4)}</td>
      <td>${item.f.basePrice.toFixed(4)}</td>
      <td>${Math.round(item.marketValue).toLocaleString()}</td>
      <td>${Math.round(item.totalShare).toLocaleString()}</td>
      <td>${item.avgCost > 0 ? item.avgCost.toFixed(4) : '-'}</td>
      <td style="color:${getProfitColor(item.pnl)}">${getSign(item.pnl)}${Math.round(item.pnl).toLocaleString()}</td>
      <td style="color:${getProfitColor(item.profitRate)}">${item.profitRate.toFixed(2)}%</td>
      <td>${Math.round(item.totalInvest).toLocaleString()}</td>
      <td>${item.progress.toFixed(0)}%</td>
      <td>${ratio}%</td>
    </tr>`;
  }).join('');

  const buyRecordRows = [];
  state.forEach(fund => {
    fund.buys.forEach(buy => {
      const shareNum = Number(buy.price || 0) > 0 ? buy.amount / buy.price : 0;
      buyRecordRows.push(`<tr>
        <td>${fund.name}</td>
        <td>${buy.date}</td>
        <td>${buy.price.toFixed(4)}</td>
        <td>${Math.round(buy.amount || 0).toLocaleString()}</td>
        <td>${shareNum ? shareNum.toFixed(2) : '-'}</td>
      </tr>`);
    });
  });

  const htmlDoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
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
<div class="meta">导出时间: ${timeStamp} | 基金数量: ${state.length}</div>
<div class="summary-box">
  <div class="sb-row"><span>总投入</span><b>${Math.round(totalInvestSum).toLocaleString()}</b></div>
  <div class="sb-row"><span>总市值</span><b>${Math.round(totalMarketSum).toLocaleString()}</b></div>
  <div class="sb-row"><span>总收益</span><b style="color:${getProfitColor(totalPnlSum)}">${getSign(totalPnlSum)}${Math.round(totalPnlSum).toLocaleString()}</b></div>
  <div class="sb-row"><span>总收益率</span><b style="color:${getProfitColor(totalRateVal)}">${totalRateVal.toFixed(2)}%</b></div>
  <div class="sb-row"><span>总目标 / 完成度</span><b>${totalTargetSum.toLocaleString()} / ${totalTargetSum > 0 ? (totalInvestSum / totalTargetSum * 100).toFixed(1) : '0'}%</b></div>
</div>
<h2>📋 各品种主表</h2>
<table>
<thead><tr><th>品种</th><th>现价</th><th>基准</th><th>持有金额</th><th>持有份额</th><th>持仓成本</th><th>持有收益</th><th>收益率</th><th>投入</th><th>完成度</th><th>仓位占比</th></tr></thead>
<tbody>${tableRows}
<tr style="background:#1F4E78;font-weight:700">
  <td>合计</td><td>-</td><td>-</td>
  <td>${Math.round(totalMarketSum).toLocaleString()}</td>
  <td>${Math.round(totalShareSum).toLocaleString()}</td><td>-</td>
  <td style="color:#FFD700">${getSign(totalPnlSum)}${Math.round(totalPnlSum).toLocaleString()}</td>
  <td style="color:#FFD700">${totalRateVal}%</td>
  <td>${Math.round(totalInvestSum).toLocaleString()}</td>
  <td>${totalTargetSum > 0 ? (totalInvestSum / totalTargetSum * 100).toFixed(0) : '0'}%</td>
  <td>100%</td>
</tr>
</tbody></table>
<h2>📥 买入记录明细</h2>
<table>
<thead><tr><th>品种</th><th>日期</th><th>单价</th><th>投入金额</th><th>对应份额</th></tr></thead>
<tbody>${buyRecordRows.join('')}</tbody></table>
<div class="footer">数据导出自本地基金加仓工具</div>
</body></html>`;
  const newWin = window.open('', '_blank');
  if (newWin) {
    newWin.document.write(htmlDoc);
    newWin.document.close();
  } else {
    alert('浏览器弹窗被拦截，请允许弹窗后重试');
  }
}

// 导出Excel文件
function exportExcelToFile() {
  if (typeof XLSX === 'undefined') {
    const script = document.createElement('script');
    script.src = 'xlsx.full.min.js';
    document.head.appendChild(script);
    setTimeout(exportExcelToFile, 1500);
    alert('首次导出Excel，正在加载依赖库，请稍等');
    return;
  }
  const workbook = XLSX.utils.book_new();
  let totalInvestSum = 0, totalMarketSum = 0, totalTargetSum = 0;
  state.forEach(f => {
    const m = calcFundMetrics(f);
    totalInvestSum += m.totalInvest;
    totalMarketSum += m.marketValue;
    totalTargetSum += f.target || 0;
  });
  const totalPnlSum = totalMarketSum - totalInvestSum;
  const totalRateVal = totalInvestSum > 0 ? Number((totalPnlSum / totalInvestSum * 100).toFixed(2)) : 0;
  const totalShareSum = state.reduce((s, f) => s + calcFundMetrics(f).totalShare, 0);
  const sheetRows = [
    ['基金加仓资产总览', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['导出日期', new Date().toISOString().split('T')[0], '', '', '', '', '', '', '', '', '', '', ''],
    [],
    ['=== 全局汇总数据 ===', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['总投入金额', totalInvestSum.toFixed(2), '', '总市值', totalMarketSum.toFixed(2), '', '总浮盈', totalPnlSum.toFixed(2), '', '综合收益率', totalRateVal.toFixed(2)+'%', '', '目标完成度', (totalInvestSum / totalTargetSum * 100).toFixed(1)+'%'],
    [],
    ['=== 单基金持仓明细 ===', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['基金名称','基金代码','现价','基准价','相对基准%','持有市值','总份额','平均成本','浮盈','收益率','累计投入','目标金额','完成度'],
  ];
  state.forEach(fund => {
    const m = calcFundMetrics(fund);
    sheetRows.push([
      fund.name, fund.code, fund.price, fund.basePrice, m.dropPct.toFixed(1)+'%',
      m.marketValue.toFixed(2), m.totalShare.toFixed(2),
      m.avgCost > 0 ? m.avgCost.toFixed(4) : '-',
      m.pnl.toFixed(2), m.profitRate.toFixed(2)+'%',
      m.totalInvest.toFixed(2), fund.target, m.progress.toFixed(0)+'%'
    ]);
  });
  sheetRows.push([
    '合计','','','','',
    totalMarketSum.toFixed(2), totalShareSum.toFixed(2),
    '', totalPnlSum.toFixed(2), totalRateVal.toFixed(2)+'%',
    totalInvestSum.toFixed(2), totalTargetSum.toFixed(2), (totalInvestSum / totalTargetSum * 100).toFixed(0)+'%'
  ]);
  sheetRows.push([]);
  sheetRows.push(['=== 每笔买入记录 ===', '', '', '', '', '', '', '', '', '', '', '', '']);
  sheetRows.push(['基金名称','买入日期','档位','买入单价','投入金额','获得份额','','','','','','','']);
  state.forEach(fund => {
    fund.buys.forEach(buy => {
      const shareNum = Number(buy.price || 0) > 0 ? (buy.amount / buy.price) : 0;
      sheetRows.push([fund.name, buy.date, buy.tier || 0, buy.price, buy.amount ? Math.round(buy.amount) : '', shareNum ? shareNum.toFixed(2) : '', '', '', '', '', '', '']);
    });
  });
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet['!merges'] = [
    {s:{r:0,c:0},e:{r:0,c:12}},
    {s:{r:1,c:1},e:{r:1,c:4}},
    {s:{r:3,c:0},e:{r:3,c:12}},
    {s:{r:6,c:0},e:{r:6,c:12}},
    {s:{r:sheetRows.length - state.reduce((s,f)=>s+f.buys.length,0) - 2,c:0},e:{r:sheetRows.length - state.reduce((s,f)=>s+f.buys.length,0) - 2,c:12}},
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, '基金资产总览');
  const fileDate = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `基金加仓总览_${fileDate}.xlsx`);
}

// 本地保存数据并同步导出Excel
function saveData() {
  localStorage.setItem('funds', JSON.stringify(state));
  updateAllCardValues();
  render();
  if (typeof XLSX !== 'undefined') saveAsExcel();
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    const oldText = saveBtn.textContent;
    saveBtn.textContent = '✓';
    setTimeout(() => saveBtn.textContent = oldText, 1200);
  }
}

function saveAsExcel() {
  const workbook = XLSX.utils.book_new();
  let totalInvestSum = 0, totalMarketSum = 0, totalTargetSum = 0;
  state.forEach(f => {
    const m = calcFundMetrics(f);
    totalInvestSum += m.totalInvest;
    totalMarketSum += m.marketValue;
    totalTargetSum += f.target || 0;
  });
  const totalPnlSum = totalMarketSum - totalInvestSum;
  const totalRateVal = totalInvestSum > 0 ? Number((totalPnlSum / totalInvestSum * 100).toFixed(2)) : 0;
  const totalShareSum = state.reduce((s, f) => calcFundMetrics(f).totalShare, 0);
  const sheetRows = [
    ['基金加仓资产总览', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['保存日期', new Date().toISOString().split('T')[0], '', '', '', '', '', '', '', '', '', '', ''],
    [],
    ['总投入金额', totalInvestSum.toFixed(2), '', '总市值', totalMarketSum.toFixed(2), '', '总浮盈', totalPnlSum.toFixed(2), '', '综合收益率', totalRateVal.toFixed(2)+'%', '', '目标完成度', (totalInvestSum / totalTargetSum * 100).toFixed(1)+'%'],
    [],
    ['基金名称','基金代码','现价','基准价','相对基准%','持有市值','总份额','平均成本','浮盈','收益率','累计投入','目标金额','完成度'],
  ];
  state.forEach(fund => {
    const m = calcFundMetrics(fund);
    sheetRows.push([
      fund.name, fund.code, fund.price, fund.basePrice, m.dropPct.toFixed(1)+'%',
      m.marketValue.toFixed(2), m.totalShare.toFixed(2),
      m.avgCost > 0 ? m.avgCost.toFixed(4) : '-',
      m.pnl.toFixed(2), m.profitRate.toFixed(2)+'%',
      m.totalInvest.toFixed(2), fund.target, m.progress.toFixed(0)+'%'
    ]);
  });
  sheetRows
