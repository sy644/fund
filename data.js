// === 基金基础数据 (对应 Excel Sheet3 / 分表参数) ===
// 字段名严格对应 Excel 公式:
//   basePrice = 基准 (Excel C13~C16)
//   target = 目标 (Excel D13~D16)
//   initShares = 初始份额 (Excel B13-B16), 初始投入 = initShares * basePrice
//   multi = 倍数 (Excel B25/B26)
//   step = 幅度 (Excel B26/B27)
//   tiers = 档数 (Excel B27/B28)
//   code = 腾讯基金代码

const FUNDS_INIT = [
  {
    name: "港股互联",
    code: "014674",
    price: 0.6854,
    basePrice: 0.7898,
    initShares: 18331.15,
    target: 20000,
    multi: 1.1,
    step: 0.03,
    tiers: 15,
    priceLow: 0.5740,
    priceMid: 0.9120,
    priceHigh: 1.1249,
    buys: [
      { date: "2025-02-19", price: 0.7898, amount: 14476.66, tier: 0 },
      { date: "2026-07-15", price: 0.666,  amount: 600,      tier: -6 },
    ],
    color: "#FFB6C1",
  },
  {
    name: "证券",
    code: "161720",
    price: 0.7530,
    basePrice: 1.145,
    initShares: 4366.65,
    target: 6000,
    multi: 1.1,
    step: 0.03,
    tiers: 8,
    priceLow: 1.1052,
    priceMid: 1.3548,
    priceHigh: 1.4750,
    buys: [
      { date: "2025-02-19", price: 1.145,  amount: 4999.81, tier: 0 },
      { date: "2026-07-09", price: 1.2406, amount: 400,     tier: 1 },
    ],
    color: "#B0E0E6",
  },
  {
    name: "煤炭",
    code: "161032",
    price: 1.5390,
    basePrice: 1.8692,
    initShares: 280.26,
    target: 5000,
    multi: 1.1,
    step: 0.03,
    tiers: 10,
    priceLow: 1.7250,
    priceMid: 2.1450,
    priceHigh: 2.3475,
    buys: [
      { date: "2025-02-19", price: 1.8692, amount: 523.86, tier: 0 },
      { date: "2026-07-09", price: 1.873,  amount: 800,     tier: 1 },
      { date: "2026-07-14", price: 1.948,  amount: 400,     tier: 2 },
    ],
    color: "#FFE4B5",
  },
  {
    name: "军工",
    code: "161038",
    price: 1.5096,
    basePrice: 1.4054,
    initShares: 965.08,
    target: 5000,
    multi: 1.1,
    step: 0.03,
    tiers: 10,
    priceLow: 1.2693,
    priceMid: 1.5200,
    priceHigh: 1.6458,
    buys: [
      { date: "2025-02-19", price: 1.4054, amount: 1356.32, tier: 0 },
      { date: "2026-07-09", price: 1.3425, amount: 500,      tier: -1 },
      { date: "2026-07-14", price: 1.237,  amount: 300,      tier: -5 },
      { date: "2026-07-XX", price: 1.2685, amount: 24,       tier: -10 },
    ],
    color: "#DDA0DD",
  },
];
