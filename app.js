// 读取全局已存在的state，不再重复声明let state，彻底解决报错
const state = window.state;

// 1. 净值数据整理映射
function initNavMap() {
    const map = {};
    window.NAV_HISTORY_INIT.forEach(item => {
        if(!map[item.code]) map[item.code] = [];
        map[item.code].push(item);
    })
    // 取最新净值
    Object.keys(map).forEach(code=>{
        const sortList = map[code].sort((a,b)=>b.ts - a.ts);
        map[code].latestNav = sortList[0].nav;
    })
    state.navMap = map;
}

// 2. 单只基金收益计算核心函数
function calcFundProfit(fund) {
    const latestNav = state.navMap[fund.code]?.latestNav || fund.costPrice;
    const marketValue = Number((fund.share * latestNav).toFixed(4));
    const totalCost = Number((fund.share * fund.costPrice).toFixed(4));
    const profit = Number((marketValue - totalCost).toFixed(4));
    const profitRate = totalCost === 0 ? 0 : ((profit / totalCost) * 100);
    return {
        latestNav, marketValue, totalCost, profit, profitRate
    }
}

// 3. 计算全部合计数据
function calcTotalData() {
    let totalCost = 0, totalValue = 0, totalProfit = 0;
    state.fundList.forEach(fund=>{
        const res = calcFundProfit(fund);
        totalCost += res.totalCost;
        totalValue += res.marketValue;
        totalProfit += res.profit;
    })
    const totalRate = totalCost === 0 ? 0 : ((totalProfit / totalCost)*100);
    return {
        totalCost: totalCost.toFixed(2),
        totalValue: totalValue.toFixed(2),
        totalProfit: totalProfit.toFixed(2),
        totalRate: totalRate.toFixed(2)
    }
}

// 4. 渲染表格+汇总数据
function renderTable() {
    const tbody = document.getElementById('fundTbody');
    tbody.innerHTML = '';
    state.fundList.forEach(fund=>{
        const data = calcFundProfit(fund);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${fund.code}</td>
            <td>${fund.name}</td>
            <td>${data.latestNav.toFixed(4)}</td>
            <td>${fund.share}</td>
            <td>${data.marketValue}</td>
            <td style="color:${data.profit>=0?'#ff5555':'#33cc66'}">${data.profit}</td>
            <td style="color:${data.profitRate>=0?'#ff5555':'#33cc66'}">${data.profitRate.toFixed(2)}%</td>
        `;
        tbody.appendChild(tr);
    })
    // 渲染合计
    const total = calcTotalData();
    document.getElementById('totalCost').innerText = total.totalCost;
    document.getElementById('totalValue').innerText = total.totalValue;
    document.getElementById('totalProfit').innerText = total.totalProfit;
    document.getElementById('totalRate').innerText = total.totalRate+'%';

    // 更新环形进度完成度
    updateRingProgress(total.totalRate);
}

// 5. 环形进度条更新逻辑
function updateRingProgress(rate) {
    const ringFill = document.querySelector('.ring-fill');
    const totalLen = 540;
    // 收益率正负映射0~100%进度
    let percent = Math.max(0, Math.min(100, Number(rate)));
    const offset = totalLen - (totalLen * percent / 100);
    ringFill.style.strokeDashoffset = offset;
    document.getElementById('percentText').innerText = percent.toFixed(1)+'%';
}

// 6. 参数面板绑定事件
function bindSettingEvent() {
    const baseInput = document.getElementById('basePrice');
    const moneyInput = document.getElementById('perMoney');
    const saveBtn = document.getElementById('saveSetBtn');
    // 回填已有设置
    baseInput.value = state.setting.basePrice;
    moneyInput.value = state.setting.perMoney;
    saveBtn.onclick = ()=>{
        state.setting.basePrice = Number(baseInput.value);
        state.setting.perMoney = Number(moneyInput.value);
        alert('参数保存成功');
    }
}

// 页面初始化执行
window.onload = ()=>{
    initNavMap();
    renderTable();
    bindSettingEvent();
}
