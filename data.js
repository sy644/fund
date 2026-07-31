// data.js - 初始基金数据
// FUNDS_INIT 必须叫这个名, app.js 会读取它
const FUNDS_INIT = [
  {
    name: '示例-白酒',
    code: '161725',
    price: 0.8500,
    basePrice: 1.0000,
    initShares: 0,
    target: 10000,
    multi: 1.10,    // 等比倍数
    step: 0.03,     // 档位幅度 3%
    tiers: 10,      // 总档数
    priceLow: 0.70,
    priceMid: 1.15,
    priceHigh: 1.30,
    buys: [
      { date: '2024-01-15', type: 'buy', price: 0.95, amount: 500, tier: 0 }
    ],
    color: '#00f0ff'
  },
  {
    name: '示例-医药',
    code: '161127',
    price: 0.7800,
    basePrice: 1.0000,
    initShares: 1000,
    target: 8000,
    multi: 1.10,
    step: 0.03,
    tiers: 10,
    priceLow: 0.70,
    priceMid: 1.15,
    priceHigh: 1.30,
    buys: [
      { date: '2024-01-15', type: 'buy', price: 0.90, amount: 800, tier: 0 }
    ],
    color: '#ff2bd6'
  }
];
