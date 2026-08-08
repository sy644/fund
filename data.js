// data.js - 基金初始数据
var FUNDS_INIT = [
  {
    name: "军工ETF",          // 基金名称
    code: "512660",           // 用于抓取净值的基金代码
    etfCode: "1.512660",      // 🆕 场内K线代码（上海ETF填 1.XXXXXX，深圳填 0.XXXXXX）
    price: 1.0500,            // 当前价格（首次加载用）
    basePrice: 1.0000,        // 基准价
    initShares: 0,            // 初始份额
    target: 20000,            // 目标投入金额
    multi: 1.1,               // 档位倍数
    step: 0.03,               // 档位幅度 (3%)
    tiers: 10,                // 档位数
    priceLow: 0.7000,         // 低点（用于跑道图）
    priceMid: 1.1500,         // 中点
    priceHigh: 1.3000,        // 高点
    color: "#FF6B6B",         // 卡片主题色
    buys: []                  // 交易记录（空）
  }
];

// 如果不想用示例数据，清空数组即可：var FUNDS_INIT = [];