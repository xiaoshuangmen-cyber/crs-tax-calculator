// CRS 涉税资产与证券交易盈亏系统的纯离线前端交互与计算核心逻辑
const ALIAS_MAP = {
  account_no: ['account_no', 'account', '账号', '客户账号', '证券账号', 'a/c no'],
  client_name: ['account_name_chi', 'client_name', 'name', '姓名', '客户名称', '名称', '户名', 'account_name', 'account_name_eng'],
  trade_date: ['trade_date', 'tx_date', 'date', '交易日期', '日期', '成交日期', '结息日期', '入账日期'],
  record_type: ['record_type', 'type', '业务类型', '记录类型', '交易类型'],
  io_type: ['io_type', 'io', 'direction', '收支类型', '买卖方向', '方向'],
  market: ['exchange_code', 'market', '市场', '交易市场', '交易所'],
  code: ['product_code', 'stock_code', 'symbol', 'code', '股票代码', '证券代码', '代码', '产品代码'],
  name: ['product_name', 'stock_name', '股票名称', '证券名称', '产品名称'],
  remarks: ['remark', 'remarks', 'description', '备注', '摘要', '说明'],
  qty: ['qty', 'quantity', 'shares', '数量', '成交数量', '股数'],
  price: ['average_price', 'avg_price', 'price', '平均价', '成交均价', '成交价', '单价'],
  ccy: ['ccy', 'currency', '币种', '结算币种', '货币'],
  deduct_amount: ['dr_amount', 'debit_amount', 'deduct_amount', 'deduct', '扣除金额', '支出金额', '借方金额', '扣款金额'],
  deposit_amount: ['cr_amount', 'credit_amount', 'deposit_amount', 'deposit', '存入金额', '收入金额', '贷方金额', '收款金额']
};

function getField(row, field, defVal) {
  if (defVal === undefined) defVal = '';
  var aliases = ALIAS_MAP[field] || [field];
  for (var i = 0; i < aliases.length; i++) {
    var a = aliases[i];
    if (row[a] !== undefined && row[a] !== null && String(row[a]).trim() !== '') {
      return row[a];
    }
    for (var k in row) {
      if (k.trim().toLowerCase() === a) {
        return row[k];
      }
    }
  }
  return defVal;
}

let appData = null;
let costMethod = 'WAC';
let yearFilter = 'ALL';
let stockFilterMode = 'all';

// 分页状态
let tradePage = 1, tradePageSize = 15;
let divPage = 1, divPageSize = 15;
let intPage = 1, intPageSize = 15;
let cashPage = 1, cashPageSize = 15;
let chargesPage = 1, chargesPageSize = 15;

// 初始化：默认以干净清空状态启动
window.addEventListener('DOMContentLoaded', function() {
  resetToEmptyState();
  setupDragAndDrop();
});

// 清空当前数据回到初始状态
function resetToEmptyState() {
  appData = null;
  window.__lastCleanRecords = null;
  customPrices = {};
  initialCosts = {};
  yearFilter = 'ALL';

  var welcomeCard = document.getElementById('empty-welcome-card');
  if (welcomeCard) welcomeCard.style.display = 'block';

  // 客户信息清空
  document.getElementById('c-name').innerText = '等待导入客户流水';
  document.getElementById('c-avatar').innerText = '📥';
  document.getElementById('c-account').innerText = '账号: --';
  document.getElementById('c-currency').innerText = '结算币种: --';
  document.getElementById('c-daterange').innerText = '请导入流水文件开始核算';
  document.getElementById('c-total-rows').innerText = '0';
  document.getElementById('date-start').value = '';
  document.getElementById('date-end').value = '';

  // 指标卡片归零
  document.getElementById('val-dividend').innerText = 'HK$ 0.00';
  document.getElementById('cnt-dividend').innerText = '0';
  document.getElementById('val-interest').innerText = 'HK$ 0.00';
  document.getElementById('cnt-interest').innerText = '0';
  document.getElementById('val-pnl').innerText = 'HK$ 0.00';
  document.getElementById('val-pnl').className = 'stat-val number-font';
  document.getElementById('cnt-pnl').innerText = '0';
  document.getElementById('val-sales').innerText = 'HK$ 0.00';
  document.getElementById('cnt-sales').innerText = '0';

  // 资金卡片归零
  document.getElementById('val-deposit').innerText = 'HK$ 0.00';
  document.getElementById('val-withdraw').innerText = 'HK$ 0.00';
  document.getElementById('val-net-deposit').innerText = 'HK$ 0.00';
  document.getElementById('val-deposit-all').innerText = 'HK$ 0.00';
  document.getElementById('val-withdraw-all').innerText = 'HK$ 0.00';
  document.getElementById('val-net-deposit-all').innerText = 'HK$ 0.00';

  // 持仓汇总条归零
  var elHoldCost = document.getElementById('val-hold-cost');
  var elHoldMarket = document.getElementById('val-hold-market');
  var elHoldUn = document.getElementById('val-hold-unrealized');
  if (elHoldCost) elHoldCost.innerText = 'HK$ 0.00';
  if (elHoldMarket) elHoldMarket.innerText = 'HK$ 0.00';
  if (elHoldUn) {
    elHoldUn.innerText = 'HK$ 0.00 (0.00%)';
    elHoldUn.className = 'number-font';
  }

  // 徽标数字归零
  var bTrades = document.getElementById('tab-badge-trades'); if (bTrades) bTrades.innerText = '0';
  var bDiv = document.getElementById('tab-badge-div'); if (bDiv) bDiv.innerText = '0';
  var bInt = document.getElementById('tab-badge-int'); if (bInt) bInt.innerText = '0';
  var bCash = document.getElementById('tab-badge-cash'); if (bCash) bCash.innerText = '0';
  var bChg = document.getElementById('tab-badge-charges'); if (bChg) bChg.innerText = '0';

  // 年份胶囊栏清空
  var box = document.getElementById('year-pills-box');
  if (box) {
    box.innerHTML = '<button class="year-pill active">全部开户以来 (All-Time)</button>';
  }

  // 表格展示空状态行
  var emptyRow = '<tr><td colspan="12" style="text-align:center; padding:32px 16px; color:#94a3b8; font-size:13px;">📥 暂无数据，请点击上方 <strong>📂 导入 C1900 / Excel</strong> 或直接将文件拖拽至此</td></tr>';
  var tStock = document.getElementById('stock-tbody'); if (tStock) tStock.innerHTML = emptyRow;
  var tYearly = document.getElementById('yearly-tbody'); if (tYearly) tYearly.innerHTML = emptyRow;
  var tTrade = document.getElementById('trades-tbody'); if (tTrade) tTrade.innerHTML = emptyRow;
  var tDiv = document.getElementById('dividends-tbody'); if (tDiv) tDiv.innerHTML = emptyRow;
  var tInt = document.getElementById('interest-tbody'); if (tInt) tInt.innerHTML = emptyRow;
  var tCash = document.getElementById('cash-tbody'); if (tCash) tCash.innerHTML = emptyRow;
  var tCharges = document.getElementById('charges-tbody'); if (tCharges) tCharges.innerHTML = emptyRow;
}

function initApp() {
  if (!appData) return;
  var welcomeCard = document.getElementById('empty-welcome-card');
  if (welcomeCard) welcomeCard.style.display = 'none';

  renderClientInfo();
  renderYearPills();
  recalculate();
  renderStockTable();
  renderYearlyTable();
  renderTradesTable();
  renderDividendsTable();
  renderInterestTable();
  renderCashTable();
  renderChargesTable();
}

function showToast(msg, type) {
  var container = document.getElementById('toast-container');
  if (!container) return;
  var toast = document.createElement('div');
  toast.className = 'toast';
  var icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️');
  toast.innerHTML = '<span>' + icon + '</span><span>' + msg + '</span>';
  container.appendChild(toast);
  setTimeout(function() {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(function() { toast.remove(); }, 300);
  }, 2500);
}

function fmt(n, ccy) {
  if (ccy === undefined) ccy = 'HK$';
  if (n === null || n === undefined || isNaN(n)) return ccy + ' 0.00';
  var isNeg = n < 0;
  var val = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (isNeg ? '-' : '') + ccy + ' ' + val;
}

function fmtQty(n) {
  if (!n) return '0';
  return Number(n).toLocaleString('en-US');
}

function renderClientInfo() {
  var info = appData.client_info;
  document.getElementById('c-name').innerText = info.client_name || '客户';
  document.getElementById('c-avatar').innerText = (info.client_name || '客')[0];
  document.getElementById('c-account').innerText = '账号: ' + (info.account_no || '--');
  document.getElementById('c-currency').innerText = '结算币种: ' + (info.currency || 'HKD');
  document.getElementById('c-daterange').innerText = (info.earliest_date || '') + ' 至 ' + (info.latest_date || '');
  document.getElementById('c-total-rows').innerText = info.total_records || 0;

  document.getElementById('date-start').value = info.earliest_date || '';
  document.getElementById('date-end').value = info.latest_date || '';
}

function renderYearPills() {
  var box = document.getElementById('year-pills-box');
  box.innerHTML = '';

  var allBtn = document.createElement('button');
  allBtn.className = 'year-pill' + (yearFilter === 'ALL' ? ' active' : '');
  allBtn.innerText = '全部开户以来 (All-Time)';
  allBtn.onclick = function() { setYear('ALL'); };
  box.appendChild(allBtn);

  // 年份由新到旧降序排序（最新年份在前）
  var sortedYears = (appData.yearly_stats || []).slice().sort(function(a, b) { return b.year - a.year; });

  sortedYears.forEach(function(y) {
    var btn = document.createElement('button');
    btn.className = 'year-pill' + (yearFilter === y.year ? ' active' : '');
    btn.innerText = y.year + ' 年度';
    btn.onclick = function() { setYear(y.year); };
    box.appendChild(btn);
  });
}

function setYear(yr) {
  yearFilter = yr;
  if (yr === 'ALL') {
    document.getElementById('date-start').value = appData.client_info.earliest_date;
    document.getElementById('date-end').value = appData.client_info.latest_date;
    document.getElementById('period-display-label').innerText = '全部历史（开户以来 2009~2026）';
    showToast('已切换至【全部历史】统计周期', 'info');
  } else {
    document.getElementById('date-start').value = yr + '-01-01';
    document.getElementById('date-end').value = yr + '-12-31';
    document.getElementById('period-display-label').innerText = yr + ' 年度申报区间 (' + yr + '-01-01 至 ' + yr + '-12-31)';
    showToast('已切换至【' + yr + ' 年度】申报区间', 'info');
  }
  renderYearPills();
  recalculate();
  tradePage = 1; divPage = 1; intPage = 1; cashPage = 1; chargesPage = 1;
  renderTradesTable();
  renderDividendsTable();
  renderInterestTable();
  renderCashTable();
  renderChargesTable();
}

function onCustomDate() {
  var s = document.getElementById('date-start').value;
  var e = document.getElementById('date-end').value;
  yearFilter = 'CUSTOM';
  document.getElementById('period-display-label').innerText = '自定义时间段 (' + s + ' 至 ' + e + ')';
  renderYearPills();
  recalculate();
  tradePage = 1; divPage = 1; intPage = 1; cashPage = 1; chargesPage = 1;
  renderTradesTable();
  renderDividendsTable();
  renderInterestTable();
  renderCashTable();
  renderChargesTable();
  showToast('已更新自定义时间范围', 'info');
}

function resetAllTime() { setYear('ALL'); }

function setMethod(m) {
  costMethod = m;
  document.getElementById('btn-wac').className = 'pill-btn' + (m === 'WAC' ? ' active' : '');
  document.getElementById('btn-fifo').className = 'pill-btn' + (m === 'FIFO' ? ' active' : '');
  document.getElementById('method-display-label').innerText = m === 'WAC' ? '移动加权平均成本法 (WAC)' : '先进先出法 (FIFO)';
  recalculate();
  renderStockTable();
  renderTradesTable();
  renderYearlyTable();
  showToast('计税方法已切换为: ' + (m === 'WAC' ? '移动加权平均法' : '先进先出法'), 'info');
}

function recalculate() {
  if (!appData) return;
  var sDate = document.getElementById('date-start').value || '1970-01-01';
  var eDate = document.getElementById('date-end').value || '2099-12-31';

  var trades = appData.trade_logs.filter(function(t) { return t.date >= sDate && t.date <= eDate; });
  var divs = appData.dividend_logs.filter(function(d) { return d.date >= sDate && d.date <= eDate; });
  var ints = appData.interest_logs.filter(function(i) { return i.date >= sDate && i.date <= eDate; });
  var cash = appData.cash_logs.filter(function(c) { return c.date >= sDate && c.date <= eDate; });

  var divSum = divs.reduce(function(acc, cur) { return acc + cur.amount; }, 0);
  var intSum = ints.reduce(function(acc, cur) { return acc + cur.amount; }, 0);

  var sells = trades.filter(function(t) { return t.action === '卖出'; });
  var salesSum = sells.reduce(function(acc, cur) { return acc + cur.amount; }, 0);
  var pnlSum = costMethod === 'WAC'
    ? sells.reduce(function(acc, cur) { return acc + cur.realized_pnl_wac; }, 0)
    : sells.reduce(function(acc, cur) { return acc + cur.realized_pnl_fifo; }, 0);
  var depLogs = cash.filter(function(c) { return c.type === '入金'; });
  var withLogs = cash.filter(function(c) { return c.type === '出金'; });
  var depSum = depLogs.reduce(function(acc, cur) { return acc + cur.amount; }, 0);
  var withSum = withLogs.reduce(function(acc, cur) { return acc + cur.amount; }, 0);

  document.getElementById('val-dividend').innerText = fmt(divSum);
  document.getElementById('cnt-dividend').innerText = divs.length;

  document.getElementById('val-interest').innerText = fmt(intSum);
  document.getElementById('cnt-interest').innerText = ints.length;

  var pnlEl = document.getElementById('val-pnl');
  pnlEl.innerText = fmt(pnlSum);
  pnlEl.style.color = pnlSum >= 0 ? 'var(--gain)' : 'var(--loss)';
  document.getElementById('icon-pnl-wrap').style.background = pnlSum >= 0 ? 'var(--gain-bg)' : 'var(--loss-bg)';
  document.getElementById('icon-pnl-wrap').style.color = pnlSum >= 0 ? 'var(--gain)' : 'var(--loss)';
  document.getElementById('cnt-pnl').innerText = sells.length;

  document.getElementById('val-sales').innerText = fmt(salesSum);
  document.getElementById('cnt-sales-stocks').innerText = new Set(sells.map(function(t) { return t.code; })).size;

  document.getElementById('val-deposit').innerText = fmt(depSum);
  document.getElementById('val-withdraw').innerText = fmt(withSum);
  document.getElementById('val-net-deposit').innerText = fmt(withSum - depSum);

  var all = appData.all_time_totals;
  var allWithLogs = appData.cash_logs.filter(function(c) { return c.type === '出金'; });
  var allDepLogs = appData.cash_logs.filter(function(c) { return c.type === '入金'; });
  document.getElementById('val-deposit-all').innerText = fmt(all.deposit_total) + ' (' + allDepLogs.length + ' 笔入账)';
  document.getElementById('val-withdraw-all').innerText = fmt(all.withdrawal_total) + ' (' + allWithLogs.length + ' 笔出金)';
  document.getElementById('val-net-deposit-all').innerText = fmt(all.withdrawal_total - all.deposit_total);

  var bTrades = document.getElementById('tab-badge-trades'); if (bTrades) bTrades.innerText = trades.length;
  var bDiv = document.getElementById('tab-badge-div'); if (bDiv) bDiv.innerText = divs.length;
  var bInt = document.getElementById('tab-badge-int'); if (bInt) bInt.innerText = ints.length;
  var bCash = document.getElementById('tab-badge-cash'); if (bCash) bCash.innerText = cash.length;
  var charges = (appData.charge_logs || []).filter(function(c) { return c.date >= sDate && c.date <= eDate; });
  var bChg = document.getElementById('tab-badge-charges'); if (bChg) bChg.innerText = charges.length;
}

function filterStockTable(mode) {
  stockFilterMode = mode;
  ['all', 'holding', 'closed'].forEach(function(m) {
    document.getElementById('filter-stock-' + m).className = 'pill-btn' + (m === mode ? ' active' : '');
  });
  renderStockTable();
}

let customPrices = {};

function updateHoldingPrice(code, newPrice) {
  var p = parseFloat(newPrice);
  if (!isNaN(p) && p >= 0) {
    customPrices[code] = p;
  } else {
    delete customPrices[code];
  }
  renderStockTable();
  if (document.getElementById('stock-modal').classList.contains('open')) {
    openStockModal(code);
  }
}

function renderStockTable() {
  if (!appData) return;
  var tbody = document.getElementById('stock-tbody');
  tbody.innerHTML = '';

  var allList = appData.stocks || [];
  var holdCount = allList.filter(function(s) { return s.status === '持仓中'; }).length;
  var closedCount = allList.filter(function(s) { return s.status === '已清仓'; }).length;

  var btnAll = document.getElementById('filter-stock-all');
  var btnHold = document.getElementById('filter-stock-holding');
  var btnClosed = document.getElementById('filter-stock-closed');
  if (btnAll) btnAll.innerText = '全部 (' + allList.length + ')';
  if (btnHold) btnHold.innerText = '持仓中 (' + holdCount + ')';
  if (btnClosed) btnClosed.innerText = '已清仓 (' + closedCount + ')';

  var totalHoldCost = 0;
  var totalHoldMarket = 0;
  var totalUnrealizedPnl = 0;

  allList.forEach(function(st) {
    if (st.status === '持仓中') {
      var hCost = st.current_cost_total;
      var curP = customPrices[st.code] !== undefined ? customPrices[st.code] : (st.avg_cost || 0);
      var mVal = st.current_qty * curP;
      var uPnl = mVal - hCost;
      totalHoldCost += hCost;
      totalHoldMarket += mVal;
      totalUnrealizedPnl += uPnl;
    }
  });

  // 更新顶部持仓汇总条
  var elHoldCost = document.getElementById('val-hold-cost');
  var elHoldMarket = document.getElementById('val-hold-market');
  var elHoldUn = document.getElementById('val-hold-unrealized');
  if (elHoldCost) elHoldCost.innerText = fmt(totalHoldCost);
  if (elHoldMarket) elHoldMarket.innerText = fmt(totalHoldMarket);
  if (elHoldUn) {
    var unRoiTotal = totalHoldCost > 0 ? (totalUnrealizedPnl / totalHoldCost * 100) : 0;
    var sign = totalUnrealizedPnl >= 0 ? '+' : '';
    elHoldUn.className = 'number-font ' + (totalUnrealizedPnl >= 0 ? 'text-gain' : 'text-loss');
    elHoldUn.innerText = sign + fmt(totalUnrealizedPnl) + ' (' + sign + unRoiTotal.toFixed(2) + '%)';
  }

  var list = allList;
  if (stockFilterMode === 'holding') list = list.filter(function(s) { return s.status === '持仓中'; });
  if (stockFilterMode === 'closed') list = list.filter(function(s) { return s.status === '已清仓'; });

  list.forEach(function(st) {
    var tr = document.createElement('tr');
    var isHold = st.status === '持仓中';
    var pnl = costMethod === 'WAC' ? st.realized_pnl_wac : st.realized_pnl_fifo;
    var pnlClass = pnl >= 0 ? 'text-gain' : 'text-loss';

    var avgBuyP = st.total_buy_qty > 0 ? (st.total_buy_amount / st.total_buy_qty) : 0;
    var avgSellP = st.total_sell_qty > 0 ? (st.total_sell_amount / st.total_sell_qty) : 0;
    var dilutedC = isHold ? ((st.total_buy_amount - st.total_sell_amount - (st.dividends_total || 0)) / st.current_qty) : 0;

    var curP = customPrices[st.code] !== undefined ? customPrices[st.code] : (st.avg_cost || 0);
    var mVal = isHold ? (st.current_qty * curP) : 0;
    var uPnl = isHold ? (mVal - st.current_cost_total) : 0;
    var uRoi = (isHold && st.current_cost_total > 0) ? (uPnl / st.current_cost_total * 100) : 0;
    var uPnlClass = uPnl >= 0 ? 'text-gain' : 'text-loss';
    var uSign = uPnl >= 0 ? '+' : '';

    var totalCompPnl = pnl + (isHold ? uPnl : 0) + (st.dividends_total || 0);
    var compRoi = st.total_buy_amount > 0 ? (totalCompPnl / st.total_buy_amount * 100) : 0;
    var compPnlClass = totalCompPnl >= 0 ? 'text-gain' : 'text-loss';
    var compSign = totalCompPnl >= 0 ? '+' : '';

    var priceCell = '<span style="color:#94a3b8;">-</span>';
    var mktValCell = '<span style="color:#94a3b8;">-</span>';
    var unPnlCell = '<span style="color:#94a3b8;">-</span>';

    if (isHold) {
      priceCell = '<div style="display:inline-flex; align-items:center; gap:4px;">' +
        '<input type="number" step="0.0001" min="0" value="' + curP.toFixed(4) + '" ' +
        'onchange="updateHoldingPrice(\'' + st.code + '\', this.value)" ' +
        'style="width:85px; padding:3px 6px; font-size:12px; font-weight:700; border:1px solid #cbd5e1; border-radius:6px; text-align:right; font-family:monospace; background:#fff;" title="输入最新市价实时测算浮动盈亏">' +
        '</div>';

      mktValCell = '<strong style="color:var(--slate-900);">' + fmt(mVal, '') + '</strong>';
      unPnlCell = '<div class="' + uPnlClass + '" style="font-weight:700;">' + uSign + fmt(uPnl, '') + '</div>' +
        '<div class="' + uPnlClass + '" style="font-size:10px;">' + uSign + uRoi.toFixed(2) + '%</div>';
    }

    tr.innerHTML = '<td><strong style="color:var(--slate-900); cursor:pointer;" onclick="openStockModal(\'' + st.code + '\')">' + st.code + ' ' + st.name + ' 🔍</strong><div style="font-size:10px; color:#94a3b8;">市场: ' + st.market + '</div></td>' +
      '<td class="text-center" style="white-space: nowrap;"><span class="tag" style="' + (isHold ? 'background:#e0f2fe;color:#0369a1;' : 'background:#f1f5f9;color:#475569;') + '">' + st.status + '</span></td>' +
      '<td class="text-right number-font">' + fmt(st.total_buy_amount, '') + (avgBuyP > 0 ? '<div style="font-size:10px; color:#94a3b8;">均价 ' + avgBuyP.toFixed(3) + '</div>' : '') + '</td>' +
      '<td class="text-right number-font">' + fmt(st.total_sell_amount, '') + (avgSellP > 0 ? '<div style="font-size:10px; color:#94a3b8;">均价 ' + avgSellP.toFixed(3) + '</div>' : '') + '</td>' +
      '<td class="text-right number-font ' + pnlClass + '" style="font-weight:700;">' + fmt(pnl, '') + '</td>' +
      '<td class="text-right number-font" style="' + (isHold ? 'color:#0369a1; font-weight:700;' : 'color:#94a3b8;') + '">' + fmtQty(st.current_qty) + '</td>' +
      '<td class="text-right number-font">' + (st.avg_cost > 0 ? st.avg_cost.toFixed(4) : '-') + '</td>' +
      '<td class="text-right number-font" style="' + (isHold ? 'color:#d97706; font-weight:600;' : 'color:#94a3b8;') + '">' + (isHold ? dilutedC.toFixed(4) : '-') + '</td>' +
      '<td class="text-right">' + priceCell + '</td>' +
      '<td class="text-right number-font">' + mktValCell + '</td>' +
      '<td class="text-right number-font">' + unPnlCell + '</td>' +
      '<td class="text-right number-font" style="color:#d97706;">' + (st.dividends_total > 0 ? '+' + fmt(st.dividends_total, '') : '-') + '</td>' +
      '<td class="text-right number-font ' + compPnlClass + '" style="font-weight:700;">' + compSign + fmt(totalCompPnl, '') + '<div style="font-size:10px;">' + compSign + compRoi.toFixed(2) + '%</div></td>' +
      '<td class="text-center no-print" style="white-space: nowrap;"><button class="btn-drill" onclick="openStockModal(\'' + st.code + '\')">' + st.trades_count + ' 笔穿透</button></td>';
    tbody.appendChild(tr);
  });
}

// 选项卡切换与平滑滚动定位
function showTab(t) {
  ['yearly', 'trades', 'dividends', 'interest', 'cash', 'charges'].forEach(function(k) {
    var btn = document.getElementById('tab-btn-' + k);
    var pane = document.getElementById('tab-pane-' + k);
    if (btn) btn.className = 'tab-btn' + (k === t ? ' active' : '');
    if (pane) pane.className = 'tab-pane' + (k === t ? ' active' : '');
  });
}

function showTabAndScroll(t) {
  showTab(t);
  scrollToElement('pane-details');
  var card = document.getElementById('pane-details');
  if (card) {
    card.classList.remove('highlight-pulse');
    void card.offsetWidth;
    card.classList.add('highlight-pulse');
  }
}

function scrollToElement(id) {
  var elem = document.getElementById(id);
  if (elem) {
    elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

let initialCosts = {};

function updateInitialCost(code, costVal) {
  var c = parseFloat(costVal);
  if (!isNaN(c) && c > 0) {
    initialCosts[code] = c;
  } else {
    delete initialCosts[code];
  }
  if (window.__lastCleanRecords) {
    appData = calculateAllFromRecords(window.__lastCleanRecords);
    initApp();
    openStockModal(code);
    showToast('已更新 ' + code + ' 的期初开仓成本均价！', 'success');
  }
}

// 模态框逻辑
function openStockModal(code) {
  var st = appData.stocks.find(function(s) { return s.code === code || s.code === code.padStart(5, '0') || s.code === code.replace(/^0+/, ''); });
  if (!st) {
    showToast('未找到该股票数据: ' + code, 'error');
    return;
  }

  var isInitialOnly = st.total_buy_qty === 0 && st.total_sell_qty > 0;
  var initC = initialCosts[st.code] || 0;

  document.getElementById('m-stock-title').innerText = st.code + ' ' + st.name;
  document.getElementById('m-stock-sub').innerText = '市场: ' + st.market + ' | 当前状态: ' + st.status + (isInitialOnly ? ' (⚠️ 期初存量股票)' : '');

  var pnl = costMethod === 'WAC' ? st.realized_pnl_wac : st.realized_pnl_fifo;
  var pnlClass = pnl >= 0 ? 'text-gain' : 'text-loss';
  var isHold = st.status === '持仓中';

  var curP = customPrices[st.code] !== undefined ? customPrices[st.code] : (st.avg_cost || 0);
  var mVal = isHold ? (st.current_qty * curP) : 0;
  var uPnl = isHold ? (mVal - st.current_cost_total) : 0;
  var uRoi = (isHold && st.current_cost_total > 0) ? (uPnl / st.current_cost_total * 100) : 0;
  var uPnlClass = uPnl >= 0 ? 'text-gain' : 'text-loss';
  var uSign = uPnl >= 0 ? '+' : '';

  var avgBuyP = st.total_buy_qty > 0 ? (st.total_buy_amount / st.total_buy_qty) : 0;
  var avgSellP = st.total_sell_qty > 0 ? (st.total_sell_amount / st.total_sell_qty) : 0;
  var dilutedC = isHold ? ((st.total_buy_amount - st.total_sell_amount - (st.dividends_total || 0)) / st.current_qty) : 0;

  var totalCompPnl = pnl + (isHold ? uPnl : 0) + (st.dividends_total || 0);
  var compRoi = st.total_buy_amount > 0 ? (totalCompPnl / st.total_buy_amount * 100) : 0;
  var compPnlClass = totalCompPnl >= 0 ? 'text-gain' : 'text-loss';
  var compSign = totalCompPnl >= 0 ? '+' : '';

  var statsBox = document.getElementById('m-stats-box');
  var htmlStats =
    // 1. 累计买入
    '<div style="background:var(--slate-50); padding:12px; border-radius:8px; border:1px solid var(--slate-200);">' +
      '<div style="font-size:11px; color:#64748b; font-weight:600;">📥 累计买入金额 (含交易规费)</div>' +
      '<div class="number-font" style="font-size:16px; font-weight:700; color:#0f172a; margin-top:4px;">' + fmt(st.total_buy_amount) + '</div>' +
      '<div style="font-size:11px; color:#64748b; margin-top:4px;">买入均价: <strong class="number-font">' + (avgBuyP > 0 ? avgBuyP.toFixed(4) : '-') + '</strong> (共 ' + fmtQty(st.total_buy_qty) + ' 股)</div>' +
    '</div>' +

    // 2. 累计卖出
    '<div style="background:var(--slate-50); padding:12px; border-radius:8px; border:1px solid var(--slate-200);">' +
      '<div style="font-size:11px; color:#64748b; font-weight:600;">📤 累计卖出净回款 (扣除规费)</div>' +
      '<div class="number-font" style="font-size:16px; font-weight:700; color:#0f172a; margin-top:4px;">' + fmt(st.total_sell_amount) + '</div>' +
      '<div style="font-size:11px; color:#64748b; margin-top:4px;">卖出均价: <strong class="number-font">' + (avgSellP > 0 ? avgSellP.toFixed(4) : '-') + '</strong> (共 ' + fmtQty(st.total_sell_qty) + ' 股)</div>' +
    '</div>' +

    // 3. 已实现盈亏
    '<div style="background:var(--slate-50); padding:12px; border-radius:8px; border:1px solid var(--slate-200);">' +
      '<div style="font-size:11px; color:#64748b; font-weight:600;">🎯 已实现盈亏 (' + costMethod + ' 结转)</div>' +
      '<div class="number-font ' + pnlClass + '" style="font-size:16px; font-weight:700; margin-top:4px;">' + (pnl >= 0 ? '+' : '') + fmt(pnl) + '</div>' +
      '<div style="font-size:11px; color:#64748b; margin-top:4px;">结转买入成本: <span class="number-font">' + fmt(st.total_sell_amount - pnl) + '</span></div>' +
    '</div>' +

    // 4. 当前持仓与双成本价
    '<div style="background:var(--slate-50); padding:12px; border-radius:8px; border:1px solid var(--slate-200);">' +
      '<div style="font-size:11px; color:#64748b; font-weight:600;">📦 当前持仓股数 / 成本价</div>' +
      '<div class="number-font" style="font-size:16px; font-weight:700; color:' + (isHold ? '#0369a1' : '#94a3b8') + '; margin-top:4px;">' + (isHold ? fmtQty(st.current_qty) + ' 股' : '已全部清仓') + '</div>' +
      '<div style="font-size:11px; color:#64748b; margin-top:4px;">' +
        (isHold ? '平均成本: <strong class="number-font">' + st.avg_cost.toFixed(4) + '</strong> | 摊薄保本价: <strong class="number-font" style="color:#d97706;">' + dilutedC.toFixed(4) + '</strong>' : '无存量持仓') +
      '</div>' +
    '</div>' +

    // 5. 累计现金分红
    '<div style="background:var(--slate-50); padding:12px; border-radius:8px; border:1px solid var(--slate-200);">' +
      '<div style="font-size:11px; color:#64748b; font-weight:600;">🎁 累计现金股息分红</div>' +
      '<div class="number-font" style="font-size:16px; font-weight:700; color:#d97706; margin-top:4px;">+' + fmt(st.dividends_total || 0) + '</div>' +
      '<div style="font-size:11px; color:#64748b; margin-top:4px;">已收现金派息总和</div>' +
    '</div>' +

    // 6. 综合总收益 (富途个股总盈亏)
    '<div style="background:' + (totalCompPnl >= 0 ? '#fef2f2' : '#f0fdf4') + '; padding:12px; border-radius:8px; border:1px solid ' + (totalCompPnl >= 0 ? '#fecaca' : '#bbf7d0') + ';">' +
      '<div style="font-size:11px; color:#475569; font-weight:700;">🏆 累计综合总盈亏 (已实现+浮动+分红)</div>' +
      '<div class="number-font ' + compPnlClass + '" style="font-size:18px; font-weight:700; margin-top:4px;">' + compSign + fmt(totalCompPnl) + '</div>' +
      '<div class="' + compPnlClass + '" style="font-size:11px; font-weight:600; margin-top:4px;">综合收益率: ' + compSign + compRoi.toFixed(2) + '%</div>' +
    '</div>';

  if (isInitialOnly) {
    htmlStats += '<div style="grid-column: 1 / -1; background:#fffbeb; padding:12px 16px; border-radius:8px; border:1px solid #fef3c7; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px;">' +
      '<div>' +
      '<div style="font-size:12px; font-weight:700; color:#b45309;">⚠️ 期初存量股票（流水导入起始日前已建仓持有）</div>' +
      '<div style="font-size:11px; color:#78350f; margin-top:2px;">该股票在导入流水之前已存在持仓，流水中仅记录了后续卖出。若知晓期初开仓成本，可填入以精准计算净盈亏：</div>' +
      '</div>' +
      '<div style="display:flex; align-items:center; gap:8px;">' +
      '<span style="font-size:12px; font-weight:600; color:#92400e;">期初买入均价:</span>' +
      '<input type="number" step="0.0001" min="0" value="' + (initC > 0 ? initC : '') + '" placeholder="如 12.50" onchange="updateInitialCost(\'' + st.code + '\', this.value)" style="width:100px; padding:4px 8px; font-size:13px; font-weight:700; border:1px solid #d97706; border-radius:6px; text-align:right; font-family:monospace; background:#fff;">' +
      '<span style="font-size:12px; color:#92400e;">HKD</span>' +
      '</div>' +
      '</div>';
  }

  if (isHold) {
    htmlStats += '<div style="grid-column: 1 / -1; background:#f0f9ff; padding:12px 16px; border-radius:8px; border:1px solid #bae6fd; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px;">' +
      '<div style="display:flex; align-items:center; gap:8px;">' +
      '<span style="font-size:12px; font-weight:700; color:#0369a1;">✏️ 设置最新市价:</span>' +
      '<input type="number" step="0.0001" min="0" value="' + curP.toFixed(4) + '" onchange="updateHoldingPrice(\'' + st.code + '\', this.value)" style="width:90px; padding:4px 8px; font-size:13px; font-weight:700; border:1px solid #0284c7; border-radius:6px; text-align:right; font-family:monospace; background:#fff;">' +
      '<span style="font-size:12px; color:#64748b;">HKD</span>' +
      '</div>' +
      '<div style="display:flex; align-items:center; gap:16px;">' +
      '<div><span style="font-size:11px; color:#64748b;">持仓最新市值:</span> <strong class="number-font" style="color:#0f172a; margin-left:4px;">' + fmt(mVal) + '</strong></div>' +
      '<div><span style="font-size:11px; color:#64748b;">未实现浮动盈亏:</span> <strong class="number-font ' + uPnlClass + '" style="font-size:14px; margin-left:4px;">' + sign + fmt(uPnl) + ' (' + sign + uRoi.toFixed(2) + '%)</strong></div>' +
      '</div>' +
      '</div>';
  }

  statsBox.innerHTML = htmlStats;

  var modalTbody = document.getElementById('m-trades-tbody');
  modalTbody.innerHTML = '';

  var stockTrades = appData.trade_logs.filter(function(t) { return t.code === st.code; });
  stockTrades.forEach(function(t) {
    var isBuy = t.action === '买入';
    var isSell = t.action === '卖出';
    var isBonus = t.action === '红股获派';
    var isSubOffer = t.action === '供股配股';
    var isDep = t.action === '证券转入';

    var tagStyle = 'background:#f1f5f9;color:#475569;';
    if (isBuy) tagStyle = 'background:#fee2e2;color:#b91c1c;';
    else if (isSell) tagStyle = 'background:#d1fae5;color:#047857;';
    else if (isBonus) tagStyle = 'background:#f3e8ff;color:#7e22ce;';
    else if (isSubOffer) tagStyle = 'background:#e0f2fe;color:#0369a1;';
    else if (isDep) tagStyle = 'background:#ecfdf5;color:#059669;';

    var tPnl = costMethod === 'WAC' ? t.realized_pnl_wac : t.realized_pnl_fifo;
    var tPnlClass = tPnl > 0 ? 'text-gain' : (tPnl < 0 ? 'text-loss' : '');

    var amtDisplay = fmt(t.amount, '');
    if (isBonus && t.amount === 0) amtDisplay = '<span style="color:#7e22ce; font-weight:600;">0.00 (免费获派)</span>';
    else if (isDep && t.amount === 0) amtDisplay = '<span style="color:#059669;">0.00 (转入)</span>';

    var tr = document.createElement('tr');
    tr.innerHTML = '<td style="font-family:monospace;">' + t.date + '</td>' +
      '<td class="text-center" style="white-space:nowrap;"><span class="tag" style="' + tagStyle + '">' + t.action + '</span></td>' +
      '<td class="text-right number-font">' + fmtQty(t.qty) + '</td>' +
      '<td class="text-right number-font">' + (t.price > 0 ? t.price.toFixed(4) : (isBonus ? '0.0000' : '-')) + '</td>' +
      '<td class="text-right number-font">' + amtDisplay + '</td>' +
      '<td class="text-right number-font ' + tPnlClass + '">' + (isSell ? fmt(tPnl, '') : '-') + '</td>' +
      '<td class="text-right number-font">' + fmtQty(t.holdings_after) + '</td>' +
      '<td class="text-right number-font">' + (t.avg_cost_after > 0 ? t.avg_cost_after.toFixed(4) : '-') + '</td>' +
      '<td style="font-size:11px; color:#64748b; max-width:200px; word-break:break-all;">' + (t.remarks || '-') + '</td>';
    modalTbody.appendChild(tr);
  });

  document.getElementById('stock-modal').classList.add('open');
}

function closeStockModal() {
  document.getElementById('stock-modal').classList.remove('open');
}

function closeStockModalOnOutside(e) {
  if (e.target.id === 'stock-modal') closeStockModal();
}

function onTradesSearch() {
  tradePage = 1;
  renderTradesTable();
}

function clearTradesFilter() {
  var input = document.getElementById('trade-search-input');
  if (input) input.value = '';
  tradePage = 1;
  renderTradesTable();
}

function renderYearlyTable() {
  if (!appData) return;
  var tbody = document.getElementById('yearly-tbody');
  var tfoot = document.getElementById('yearly-tfoot');
  tbody.innerHTML = '';

  var sDiv=0, sInt=0, sWac=0, sFifo=0, sSales=0, sDep=0, sWith=0;
  var sortedYears = (appData.yearly_stats || []).slice().sort(function(a, b) { return b.year - a.year; });
  sortedYears.forEach(function(y) {
    sDiv += y.dividend_total; sInt += y.interest_total;
    sWac += y.realized_pnl_wac; sFifo += y.realized_pnl_fifo;
    sSales += y.sales_proceeds; sDep += y.deposits; sWith += y.withdrawals;

    var tr = document.createElement('tr');
    tr.innerHTML = '<td><strong>' + y.year + ' 年</strong></td>' +
      '<td class="text-right number-font" style="color:#b45309; font-weight:600;">' + fmt(y.dividend_total, '') + '</td>' +
      '<td class="text-right number-font" style="color:#1d4ed8; font-weight:600;">' + fmt(y.interest_total, '') + '</td>' +
      '<td class="text-right number-font ' + (y.realized_pnl_wac >= 0 ? 'text-gain' : 'text-loss') + '">' + fmt(y.realized_pnl_wac, '') + '</td>' +
      '<td class="text-right number-font ' + (y.realized_pnl_fifo >= 0 ? 'text-gain' : 'text-loss') + '">' + fmt(y.realized_pnl_fifo, '') + '</td>' +
      '<td class="text-right number-font" style="color:#4338ca; font-weight:700;">' + fmt(y.sales_proceeds, '') + '</td>' +
      '<td class="text-right number-font">' + fmt(y.deposits, '') + '</td>' +
      '<td class="text-right number-font">' + fmt(y.withdrawals, '') + '</td>' +
      '<td class="text-center no-print"><button onclick="setYear(' + y.year + ')" style="padding:4px 10px; font-size:11px; background:#e0f2fe; color:#0369a1; border:none; border-radius:6px; cursor:pointer; font-weight:700;">定位年份</button></td>';
    tbody.appendChild(tr);
  });

  tfoot.innerHTML = '<tr><td>全历史汇总</td>' +
    '<td class="text-right number-font" style="color:#b45309;">' + fmt(sDiv, '') + '</td>' +
    '<td class="text-right number-font" style="color:#1d4ed8;">' + fmt(sInt, '') + '</td>' +
    '<td class="text-right number-font text-gain">' + fmt(sWac, '') + '</td>' +
    '<td class="text-right number-font text-gain">' + fmt(sFifo, '') + '</td>' +
    '<td class="text-right number-font" style="color:#4338ca;">' + fmt(sSales, '') + '</td>' +
    '<td class="text-right number-font">' + fmt(sDep, '') + '</td>' +
    '<td class="text-right number-font">' + fmt(sWith, '') + '</td>' +
    '<td class="no-print"></td></tr>';
}

function renderTradesTable() {
  if (!appData) return;
  var tbody = document.getElementById('trades-tbody');
  tbody.innerHTML = '';
  var q = (document.getElementById('trade-search-input').value || '').trim().toLowerCase();
  var s = document.getElementById('date-start').value || '1970-01-01';
  var e = document.getElementById('date-end').value || '2099-12-31';

  var list = appData.trade_logs.filter(function(t) { return t.date >= s && t.date <= e; });
  if (q) list = list.filter(function(t) { return t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q); });

  var total = list.length;
  var totalPages = Math.ceil(total / tradePageSize) || 1;
  if (tradePage > totalPages) tradePage = totalPages;

  var pageList = list.slice((tradePage - 1) * tradePageSize, tradePage * tradePageSize);

  pageList.forEach(function(t) {
    var isBuy = t.action === '买入';
    var pnl = costMethod === 'WAC' ? t.realized_pnl_wac : t.realized_pnl_fifo;
    var pnlClass = pnl > 0 ? 'text-gain' : (pnl < 0 ? 'text-loss' : '');

    var tr = document.createElement('tr');
    tr.innerHTML = '<td style="font-family:monospace;">' + t.date + '</td>' +
      '<td><strong style="cursor:pointer;" onclick="openStockModal(\'' + t.code + '\')">' + t.code + ' ' + t.name + '</strong></td>' +
      '<td class="text-center"><span class="tag" style="' + (isBuy ? 'background:#fee2e2;color:#b91c1c;' : 'background:#d1fae5;color:#047857;') + '">' + t.action + '</span></td>' +
      '<td class="text-right number-font">' + fmtQty(t.qty) + '</td>' +
      '<td class="text-right number-font">' + t.price.toFixed(4) + '</td>' +
      '<td class="text-right number-font" style="font-weight:600; ' + (isBuy ? 'color:#b91c1c;' : 'color:#047857;') + '">' + fmt(t.amount, '') + '</td>' +
      '<td class="text-right number-font" style="color:#64748b;">' + (!isBuy && t.cost_basis ? fmt(t.cost_basis, '') : '-') + '</td>' +
      '<td class="text-right number-font ' + pnlClass + '">' + (!isBuy ? fmt(pnl, '') : '-') + '</td>' +
      '<td class="text-right number-font">' + fmtQty(t.holdings_after) + '</td>' +
      '<td class="text-right number-font">' + (t.avg_cost_after > 0 ? t.avg_cost_after.toFixed(4) : '-') + '</td>';
    tbody.appendChild(tr);
  });

  renderPagination('trades-pagination', total, tradePage, tradePageSize, function(p) {
    tradePage = p; renderTradesTable();
  }, function(sz) {
    tradePageSize = sz; tradePage = 1; renderTradesTable();
  });
}

function renderDividendsTable() {
  if (!appData) return;
  var tbody = document.getElementById('dividends-tbody');
  tbody.innerHTML = '';
  var s = document.getElementById('date-start').value || '1970-01-01';
  var e = document.getElementById('date-end').value || '2099-12-31';

  var list = appData.dividend_logs.filter(function(d) { return d.date >= s && d.date <= e; });
  var total = list.length;
  var totalPages = Math.ceil(total / divPageSize) || 1;
  if (divPage > totalPages) divPage = totalPages;

  var pageList = list.slice((divPage - 1) * divPageSize, divPage * divPageSize);

  pageList.forEach(function(d) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td style="font-family:monospace; font-weight:600;">' + d.date + '</td>' +
      '<td class="text-right number-font" style="color:#d97706; font-weight:700;">+' + fmt(d.amount) + '</td>' +
      '<td>' + d.remarks + '</td>';
    tbody.appendChild(tr);
  });

  renderPagination('div-pagination', total, divPage, divPageSize, function(p) {
    divPage = p; renderDividendsTable();
  }, function(sz) {
    divPageSize = sz; divPage = 1; renderDividendsTable();
  });
}

function renderInterestTable() {
  if (!appData) return;
  var tbody = document.getElementById('interest-tbody');
  tbody.innerHTML = '';
  var s = document.getElementById('date-start').value || '1970-01-01';
  var e = document.getElementById('date-end').value || '2099-12-31';

  var list = appData.interest_logs.filter(function(i) { return i.date >= s && i.date <= e; });
  var total = list.length;
  var totalPages = Math.ceil(total / intPageSize) || 1;
  if (intPage > totalPages) intPage = totalPages;

  var pageList = list.slice((intPage - 1) * intPageSize, intPage * intPageSize);

  pageList.forEach(function(i) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td style="font-family:monospace; font-weight:600;">' + i.date + '</td>' +
      '<td class="text-right number-font" style="color:#2563eb; font-weight:700;">+' + fmt(i.amount) + '</td>' +
      '<td>' + i.remarks + '</td>';
    tbody.appendChild(tr);
  });

  renderPagination('int-pagination', total, intPage, intPageSize, function(p) {
    intPage = p; renderInterestTable();
  }, function(sz) {
    intPageSize = sz; intPage = 1; renderInterestTable();
  });
}

function renderCashTable() {
  if (!appData) return;
  var tbody = document.getElementById('cash-tbody');
  tbody.innerHTML = '';
  var s = document.getElementById('date-start').value || '1970-01-01';
  var e = document.getElementById('date-end').value || '2099-12-31';

  var list = appData.cash_logs.filter(function(c) { return c.date >= s && c.date <= e; });
  var total = list.length;
  var totalPages = Math.ceil(total / cashPageSize) || 1;
  if (cashPage > totalPages) cashPage = totalPages;

  var pageList = list.slice((cashPage - 1) * cashPageSize, cashPage * cashPageSize);

  pageList.forEach(function(c) {
    var isDep = c.type === '入金';
    var isWith = c.type === '出金';

    var tagBg = isDep ? '#d1fae5' : '#ffe4e6';
    var tagColor = isDep ? '#065f46' : '#be123c';
    var amtColor = isDep ? '#059669' : '#e11d48';
    var sign = isDep ? '+' : '-';

    var tr = document.createElement('tr');
    tr.innerHTML = '<td style="font-family:monospace; font-weight:600;">' + c.date + '</td>' +
      '<td class="text-center"><span class="tag" style="background:' + tagBg + '; color:' + tagColor + '; font-weight:700;">' + (isWith ? '📤 提取出金' : '📥 转账存入') + '</span></td>' +
      '<td class="text-right number-font" style="font-weight:700; color:' + amtColor + ';">' + sign + fmt(c.amount) + '</td>' +
      '<td style="color:' + (isWith ? '#9f1239; font-weight:600;' : 'inherit;') + '">' + c.remarks + '</td>';
    tbody.appendChild(tr);
  });

  renderPagination('cash-pagination', total, cashPage, cashPageSize, function(p) {
    cashPage = p; renderCashTable();
  }, function(sz) {
    cashPageSize = sz; cashPage = 1; renderCashTable();
  });
}

function renderChargesTable() {
  if (!appData) return;
  var tbody = document.getElementById('charges-tbody');
  tbody.innerHTML = '';
  var s = document.getElementById('date-start').value || '1970-01-01';
  var e = document.getElementById('date-end').value || '2099-12-31';

  var list = (appData.charge_logs || []).filter(function(c) { return c.date >= s && c.date <= e; });
  var total = list.length;
  var totalPages = Math.ceil(total / chargesPageSize) || 1;
  if (chargesPage > totalPages) chargesPage = totalPages;

  var pageList = list.slice((chargesPage - 1) * chargesPageSize, chargesPage * chargesPageSize);

  pageList.forEach(function(c) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td style="font-family:monospace; font-weight:600;">' + c.date + '</td>' +
      '<td class="text-center"><span class="tag" style="background:#f1f5f9; color:#64748b; font-weight:700;">🏷️ ' + c.type + '</span></td>' +
      '<td class="text-right number-font" style="font-weight:700; color:#64748b;">-' + fmt(c.amount) + '</td>' +
      '<td style="color:#475569;">' + c.remarks + '</td>';
    tbody.appendChild(tr);
  });

  renderPagination('charges-pagination', total, chargesPage, chargesPageSize, function(p) {
    chargesPage = p; renderChargesTable();
  }, function(sz) {
    chargesPageSize = sz; chargesPage = 1; renderChargesTable();
  });
}

function renderPagination(elemId, total, curPage, pageSize, onPageChange, onSizeChange) {
  var bar = document.getElementById(elemId);
  if (!bar) return;
  if (total === 0) {
    bar.innerHTML = '<span style="color:#94a3b8;">暂无记录</span>';
    return;
  }

  var totalPages = Math.ceil(total / pageSize) || 1;
  var html = '<div>共 <strong style="color:var(--slate-800);">' + total + '</strong> 条记录，第 ' + curPage + ' / ' + totalPages + ' 页</div>' +
    '<div style="display:flex; align-items:center; gap:8px;">' +
    '<span>每页:</span>' +
    '<select class="page-size-select" onchange="window.__onPageSizeChange(\'' + elemId + '\', this.value)">' +
    '<option value="15"' + (pageSize === 15 ? ' selected' : '') + '>15 条</option>' +
    '<option value="30"' + (pageSize === 30 ? ' selected' : '') + '>30 条</option>' +
    '<option value="50"' + (pageSize === 50 ? ' selected' : '') + '>50 条</option>' +
    '</select>' +
    '<button class="page-btn"' + (curPage <= 1 ? ' disabled' : '') + ' onclick="window.__onPageChange(\'' + elemId + '\', ' + (curPage - 1) + ')">上一页</button>' +
    '<button class="page-btn"' + (curPage >= totalPages ? ' disabled' : '') + ' onclick="window.__onPageChange(\'' + elemId + '\', ' + (curPage + 1) + ')">下一页</button>' +
    '</div>';
  bar.innerHTML = html;

  window['__pageCb_' + elemId] = onPageChange;
  window['__sizeCb_' + elemId] = onSizeChange;
}

window.__onPageChange = function(elemId, p) {
  if (window['__pageCb_' + elemId]) window['__pageCb_' + elemId](p);
};
window.__onPageSizeChange = function(elemId, sz) {
  if (window['__sizeCb_' + elemId]) window['__sizeCb_' + elemId](parseInt(sz));
};

function setupDragAndDrop() {
  var overlay = document.getElementById('drop-zone-overlay');
  window.addEventListener('dragover', function(e) {
    e.preventDefault();
    overlay.classList.add('dragover');
  });
  overlay.addEventListener('dragleave', function(e) {
    overlay.classList.remove('dragover');
  });
  window.addEventListener('drop', function(e) {
    e.preventDefault();
    overlay.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  });
}

function handleFileInput(e) {
  if (e.target.files && e.target.files.length > 0) {
    processFile(e.target.files[0]);
  }
}

async function processFile(file) {
  showToast('正在解析上传的流水: ' + file.name + '...', 'info');

  // 优先通过 Web API 上传解析
  try {
    var resp = await fetch('/api/upload', {
      method: 'POST',
      body: file
    });
    if (resp.ok) {
      var serverData = await resp.json();
      if (serverData && !serverData.error && serverData.client_info) {
        appData = serverData;
        initApp();
        showToast('🎉 成功导入 ' + file.name + '！共解析 ' + appData.client_info.total_records + ' 条记录', 'success');
        return;
      }
    }
  } catch (err) {
    console.log('Server upload fallback to pure client-side parser', err);
  }

  // 纯客户端备用解析
  var reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      if (file.name.endsWith('.csv')) {
        var text = new TextDecoder('utf-8').decode(evt.target.result);
        parseCsvText(text, file.name);
      } else {
        var buffer = evt.target.result;
        await parseExcelFileBuffer(buffer, file.name);
      }
    } catch (err) {
      console.error(err);
      showToast('解析流水文件失败: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseCsvLine(line) {
  var result = [];
  var cur = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (c === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim().replace(/^["']|["']$/g, ''));
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim().replace(/^["']|["']$/g, ''));
  return result;
}

function parseCsvText(text, fileName) {
  var lines = text.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
  if (lines.length < 2) throw new Error('CSV 文件内容为空');
  var headers = parseCsvLine(lines[0]);
  
  var rawData = [];
  for (var i = 1; i < lines.length; i++) {
    var cols = parseCsvLine(lines[i]);
    var rowObj = {};
    headers.forEach(function(h, idx) { rowObj[h] = cols[idx] || ''; });
    rawData.push(rowObj);
  }

  var clean = normalizeRawRows(rawData);
  appData = calculateAllFromRecords(clean);
  initApp();
  showToast('🎉 成功导入 ' + fileName + '！共解析 ' + clean.length + ' 条记录', 'success');
}

async function parseExcelFileBuffer(buffer, fileName) {
  var records = await parseXlsxPureJS(buffer);
  if (!records || records.length === 0) {
    showToast('未在文件中发现有效交易流水', 'error');
    return;
  }
  appData = calculateAllFromRecords(records);
  initApp();
  showToast('🎉 成功导入 ' + fileName + '！共解析 ' + records.length + ' 条记录', 'success');
}

function normalizeRawRows(rawData) {
  var clean = [];
  rawData.forEach(function(row) {
    var dateStr = getField(row, 'trade_date');
    if (!dateStr) return;

    var formattedDate = dateStr;
    if (dateStr.includes('-')) {
      var parts = dateStr.trim().split(' ')[0].split('-');
      var mNames = {'Jan':'01','Feb':'02','Mar':'03','Apr':'04','May':'05','Jun':'06','Jul':'07','Aug':'08','Sep':'09','Oct':'10','Nov':'11','Dec':'12'};
      if (parts.length === 3 && mNames[parts[1]]) {
        formattedDate = parts[2] + '-' + mNames[parts[1]] + '-' + parts[0].padStart(2, '0');
      }
    }

    var codeRaw = String(getField(row, 'code')).trim().replace(/^\*/, '');
    // 直接使用 CSV 里的 product_name 字段，绝不进行任何二次翻译
    var sName = String(row['product_name'] || getField(row, 'name')).trim();

    clean.push({
      account_no: String(getField(row, 'account_no')).trim(),
      client_name: String(getField(row, 'client_name')).trim(),
      date_str: formattedDate,
      year: parseInt(formattedDate.substring(0, 4)) || 2026,
      record_type: String(getField(row, 'record_type')).trim(),
      io_type: String(getField(row, 'io_type')).trim(),
      market: String(getField(row, 'market', 'HKEX')).trim(),
      code: codeRaw,
      name: sName,
      remarks: String(getField(row, 'remarks')).trim(),
      qty: parseFloat(getField(row, 'qty') || 0),
      avg_price: parseFloat(getField(row, 'price') || 0),
      ccy: String(getField(row, 'ccy', 'HKD')).trim() || 'HKD',
      deduct_amount: parseFloat(getField(row, 'deduct_amount') || 0),
      deposit_amount: parseFloat(getField(row, 'deposit_amount') || 0)
    });
  });
  return clean;
}

async function parseXlsxPureJS(arrayBuffer) {
  var data = new Uint8Array(arrayBuffer);
  if (data[0] !== 0x50 || data[1] !== 0x4b) throw new Error('文件不是标准的 XLSX 格式');

  var sharedStrings = [];
  var sheetXmlStr = '';

  var i = 0;
  while (i < data.length - 4) {
    if (data[i] === 0x50 && data[i+1] === 0x4b && data[i+2] === 0x03 && data[i+3] === 0x04) {
      var compMethod = data[i+8] | (data[i+9] << 8);
      var compSize = data[i+18] | (data[i+19] << 8) | (data[i+20] << 16) | (data[i+21] << 24);
      var fnLen = data[i+26] | (data[i+27] << 8);
      var extraLen = data[i+28] | (data[i+29] << 8);
      var fnBytes = data.slice(i + 30, i + 30 + fnLen);
      var fileName = new TextDecoder('utf-8').decode(fnBytes);
      var fileDataOffset = i + 30 + fnLen + extraLen;
      var compData = data.slice(fileDataOffset, fileDataOffset + compSize);

      if (fileName === 'xl/sharedStrings.xml' || (fileName.startsWith('xl/worksheets/sheet') && fileName.endsWith('.xml'))) {
        var decompressed = compData;
        if (compMethod === 8) {
          try {
            var ds = new DecompressionStream('deflate-raw');
            var writer = ds.writable.getWriter();
            writer.write(compData);
            writer.close();
            var res = await new Response(ds.readable).arrayBuffer();
            decompressed = new Uint8Array(res);
          } catch(e) {
            console.warn('DecompressionStream error:', e);
          }
        }
        var xmlStr = new TextDecoder('utf-8').decode(decompressed);
        if (fileName === 'xl/sharedStrings.xml') {
          var parser = new DOMParser();
          var doc = parser.parseFromString(xmlStr, 'application/xml');
          var siList = doc.getElementsByTagName('si');
          for (var sIdx = 0; sIdx < siList.length; sIdx++) {
            sharedStrings.push(siList[sIdx].textContent || '');
          }
        } else if (!sheetXmlStr) {
          sheetXmlStr = xmlStr;
        }
      }
      i = fileDataOffset + compSize;
    } else {
      i++;
    }
  }

  if (!sheetXmlStr) throw new Error('未能读取工作表 XML 数据');

  var docParser = new DOMParser();
  var sheetDoc = docParser.parseFromString(sheetXmlStr, 'application/xml');
  var rows = sheetDoc.getElementsByTagName('row');

  var header = {};
  var rawData = [];

  for (var rIndex = 0; rIndex < rows.length; rIndex++) {
    var r = rows[rIndex];
    var rIdx = r.getAttribute('r');
    var cells = r.getElementsByTagName('c');
    var rowObj = {};
    for (var cIndex = 0; cIndex < cells.length; cIndex++) {
      var c = cells[cIndex];
      var ref = c.getAttribute('r');
      var colLetter = ref.replace(/[0-9]/g, '');
      var t = c.getAttribute('t');
      var vElem = c.getElementsByTagName('v')[0];
      var val = vElem ? vElem.textContent : '';
      if (t === 's' && /^\d+$/.test(val)) {
        var idx = parseInt(val);
        if (idx < sharedStrings.length) val = sharedStrings[idx];
      }
      rowObj[colLetter] = val;
    }

    if (rIdx === '1') {
      header = rowObj;
    } else {
      var named = {};
      for (var k in rowObj) {
        named[header[k] || k] = rowObj[k];
      }
      rawData.push(named);
    }
  }

  return normalizeRawRows(rawData);
}

function calculateAllFromRecords(records) {
  window.__lastCleanRecords = records;
  var enhancedRecords = records.slice();

  // 如果投顾录入了期初建仓均价，为期初股票注入期初成本记录
  for (var c in initialCosts) {
    var cCost = initialCosts[c];
    if (cCost > 0) {
      var hasBuy = enhancedRecords.some(function(r) { return String(r.code).replace(/^\*/, '') === c && ['B', 'BUY', '买入', '转入', 'D'].includes(r.io_type); });
      if (!hasBuy) {
        var firstSell = enhancedRecords.find(function(r) { return String(r.code).replace(/^\*/, '') === c && ['S', 'SELL', '卖出'].includes(r.io_type); });
        if (firstSell) {
          var sQty = enhancedRecords.filter(function(r) { return String(r.code).replace(/^\*/, '') === c && ['S', 'SELL', '卖出'].includes(r.io_type); }).reduce(function(a, b) { return a + Math.abs(b.qty); }, 0);
          enhancedRecords.unshift({
            account_no: firstSell.account_no,
            client_name: firstSell.client_name,
            date_str: records[0].date_str,
            year: records[0].year,
            record_type: 'Trade',
            io_type: 'B',
            market: firstSell.market,
            code: c,
            name: firstSell.name,
            remarks: '期初持仓成本补录 (历史均价: HKD ' + cCost.toFixed(4) + ')',
            qty: sQty > 0 ? sQty : 1,
            avg_price: cCost,
            ccy: firstSell.ccy || 'HKD',
            deduct_amount: sQty * cCost,
            deposit_amount: 0
          });
        }
      }
    }
  }

  enhancedRecords.sort(function(a, b) { return a.date_str.localeCompare(b.date_str); });
  var acc = enhancedRecords[0]['account_no'] || '00869909';
  var name = enhancedRecords[0]['client_name'] || '客户';
  var ccy = enhancedRecords[0]['ccy'] || 'HKD';

  // 预扫描公司行动 (Corporate Actions: 私有化退市收购回款、供股认购扣款)
  var privatisationCash = {};
  var subOfferCash = {};

  enhancedRecords.forEach(function(rec) {
    var rt = (rec.record_type || '').toUpperCase();
    var io = (rec.io_type || '').toUpperCase();
    var remarks = rec.remarks || '';
    var remarksUpper = remarks.toUpperCase();
    var cr = rec.deposit_amount || 0;
    var dr = rec.deduct_amount || 0;

    if (rt.includes('CASH') || rt === 'CASH IN/OUT' || rt.includes('资金')) {
      if ((remarksUpper.includes('PRIVATISATION') || remarksUpper.includes('TAKEOVER') || remarksUpper.includes('TENDER OFFER')) && ['D', 'DEPOSIT', '存入'].includes(io) && cr > 0) {
        var m = remarks.match(/#(\d+)/);
        if (m) {
          var cCode = m[1].padStart(5, '0');
          privatisationCash[cCode] = cr;
          privatisationCash[m[1]] = cr;
        }
      } else if ((remarksUpper.includes('SUB OFFER') || remarksUpper.includes('RIGHTS') || remarksUpper.includes('OPEN OFFER')) && ['W', 'WITHDRAW', '提取', '出金'].includes(io) && dr > 0) {
        var mOffer = remarks.match(/#(\d+)/);
        if (mOffer) {
          subOfferCash[mOffer[1]] = dr;
        }
      }
    }
  });

  var allDep = 0, allWith = 0;
  var stocks = {};
  var tradeLogs = [], divLogs = [], intLogs = [], cashLogs = [], chargeLogs = [];
  var yearly = {};

  enhancedRecords.forEach(function(rec) {
    var yr = rec.year;
    if (!yearly[yr]) {
      yearly[yr] = { year: yr, dividend_total: 0, interest_total: 0, sales_proceeds: 0, realized_pnl_wac: 0, realized_pnl_fifo: 0, deposits: 0, withdrawals: 0, trades_count: 0 };
    }

    var rt = (rec.record_type || '').toUpperCase();
    var io = (rec.io_type || '').toUpperCase();
    var remarks = rec.remarks || '';
    var remarksUpper = remarks.toUpperCase();
    var deduct = rec.deduct_amount;
    var deposit = rec.deposit_amount;

    var isCash = rt.includes('CASH') || rt.includes('资金') || rt.includes('现金') || rt === 'CASH IN/OUT';
    var isTrade = rt.includes('TRADE') || rt.includes('交易') || rt.includes('买卖') || rt.includes('证券') || rt.includes('股票转入/转出') || rt.includes('PRODUCT');

    if (isCash) {
      var isPrivatisation = (remarksUpper.includes('PRIVATISATION') || remarksUpper.includes('TAKEOVER') || remarksUpper.includes('TENDER OFFER')) && ['D', 'DEPOSIT', '存入'].includes(io);
      var isSubOfferPay = (remarksUpper.includes('SUB OFFER') || remarksUpper.includes('RIGHTS') || remarksUpper.includes('OPEN OFFER')) && ['W', 'WITHDRAW', '提取', '出金'].includes(io);

      if (isPrivatisation || isSubOfferPay) {
        // 私有化款或供股款直接与证券股份买卖联动，不作为普通分红或普通出金
        return;
      }

      var isDiv = remarksUpper.includes('DIVIDEND') || remarksUpper.includes('DIV') || remarks.includes('股息') || remarks.includes('分红');
      var isInt = remarksUpper.includes('INT.') || remarksUpper.includes('INTEREST') || remarks.includes('利息') || remarks.includes('结息');
      var isChg = remarksUpper.includes('CHARGE') || remarksUpper.includes('CHG') || remarksUpper.includes('FEE') || remarks.includes('手续费') || remarks.includes('收费');

      if (isDiv) {
        divLogs.push({ date: rec.date_str, amount: deposit, remarks: remarks, year: yr });
        yearly[yr].dividend_total += deposit;
        for (var code in stocks) {
          if (code && (remarks.includes(code) || remarks.includes(code.replace(/^0+/, '')))) {
            stocks[code].dividends_total += deposit;
            break;
          }
        }
      } else if (isInt) {
        intLogs.push({ date: rec.date_str, amount: deposit, remarks: remarks, year: yr });
        yearly[yr].interest_total += deposit;
      } else {
        if (['D', 'DEPOSIT', '存入', '入金'].includes(io)) {
          allDep += deposit;
          yearly[yr].deposits += deposit;
          cashLogs.push({ date: rec.date_str, type: '入金', amount: deposit, remarks: remarks, year: yr });
        } else if (['W', 'WITHDRAW', '提取', '出金'].includes(io)) {
          if (isChg) {
            chargeLogs.push({ date: rec.date_str, type: '规费扣除', amount: deduct, remarks: remarks, year: yr });
          } else {
            allWith += deduct;
            yearly[yr].withdrawals += deduct;
            cashLogs.push({ date: rec.date_str, type: '出金', amount: deduct, remarks: remarks, year: yr });
          }
        }
      }
    } else if (isTrade) {
      var rawCode = String(rec.code || '').trim();
      if (!rawCode || rawCode.startsWith('44')) return; // 忽略临时供股权代码

      // 内部换码转换过滤：若为带 * 的代码在换码时转出（如 *02349 转换为 02349）
      if (rawCode.startsWith('*') && rt.includes('PRODUCT')) return;

      var code = rawCode.replace(/^\*/, '');
      var sName = String(rec.name || '').trim();
      var market = rec.market || 'HKEX';
      var qty = rec.qty;
      var price = rec.avg_price;

      if (!stocks[code]) {
        stocks[code] = { code: code, name: sName, market: market, total_buy_qty: 0, total_buy_amount: 0, total_sell_qty: 0, total_sell_amount: 0, current_qty: 0, current_cost_total: 0, realized_pnl_wac: 0, realized_pnl_fifo: 0, dividends_total: 0, trades_count: 0, fifo_lots: [] };
      }
      var st = stocks[code];
      if (!st.name || (!st.name.startsWith('*') && sName && !sName.startsWith('*'))) {
        st.name = sName;
      }

      var isDelisted = remarksUpper.includes('DELISTED') || remarksUpper.includes('PRIVATISATION');
      var isSubOfferDep = remarksUpper.includes('SUB OFFER') && ['D', '转入', 'B'].includes(io);
      var isBonus = (remarksUpper.includes('BONUS') || remarksUpper.includes('SCRIP') || remarks.includes('红股') || remarks.includes('实物分红')) && ['D', '转入', 'B'].includes(io);
      var isPureTransferIn = (rt.includes('PRODUCT') && ['D', '转入'].includes(io) && deduct === 0 && !isSubOfferDep && !isBonus);

      // 非交易性内部换码或无金额转出直接跳过
      var isPureTransferOut = (rt.includes('PRODUCT') && ['W', '提取', '出'].includes(io) && deduct === 0 && deposit === 0 && price === 0 && !isDelisted);
      if (isPureTransferOut) return;

      var isBuy = (['B', 'BUY', '买入', '转入', 'D'].includes(io) || (io === '' && qty > 0)) && !isDelisted;
      var actionLabel = '买入';
      if (isBonus) actionLabel = '红股获派';
      else if (isSubOfferDep) actionLabel = '供股配股';
      else if (isPureTransferIn) actionLabel = '证券转入';
      else if (isBuy) actionLabel = '买入';
      else actionLabel = '卖出';

      var tEntry = { date: rec.date_str, year: yr, code: code, name: st.name, market: market, action: actionLabel, qty: Math.abs(qty), price: price, amount: 0, realized_pnl_wac: 0, realized_pnl_fifo: 0, cost_basis: 0, holdings_after: 0, avg_cost_after: 0, remarks: remarks };

      if (isBuy) {
        var costIn = deduct;
        if (costIn <= 0 && price > 0) {
          costIn = Math.abs(qty) * price;
        } else if (costIn <= 0 && isSubOfferDep) {
          var mO = remarks.match(/#(\d+)/);
          if (mO && subOfferCash[mO[1]]) {
            costIn = subOfferCash[mO[1]];
          } else {
            for (var kO in subOfferCash) { costIn = subOfferCash[kO]; break; }
          }
        }

        tEntry.price = price > 0 ? price : (Math.abs(qty) > 0 ? costIn / Math.abs(qty) : 0);
        tEntry.amount = costIn;
        st.total_buy_qty += Math.abs(qty);
        st.total_buy_amount += costIn;
        st.current_qty += Math.abs(qty);
        st.current_cost_total += costIn;
        st.fifo_lots.push({ qty: Math.abs(qty), unit_cost: Math.abs(qty) > 0 ? costIn / Math.abs(qty) : 0 });

        st.trades_count++;
        yearly[yr].trades_count++;
        tEntry.holdings_after = st.current_qty;
        tEntry.avg_cost_after = st.current_cost_total / st.current_qty;
      } else {
        var sQty = Math.abs(qty);
        var proceeds = deposit;
        if (proceeds <= 0 && price > 0) {
          proceeds = sQty * price;
        } else if (proceeds <= 0 && (isDelisted || privatisationCash[code] || privatisationCash[code.replace(/^0+/, '')])) {
          proceeds = privatisationCash[code] || privatisationCash[code.replace(/^0+/, '')] || 0;
        }

        // 严格防御：无回款且非私有化，不作为卖出产生虚假亏损
        if (proceeds <= 0 && price <= 0) return;

        tEntry.price = price > 0 ? price : (sQty > 0 ? proceeds / sQty : 0);
        tEntry.amount = proceeds;
        st.total_sell_qty += sQty;
        st.total_sell_amount += proceeds;
        yearly[yr].sales_proceeds += proceeds;

        if (st.current_qty > 0) {
          var uWac = st.current_cost_total / st.current_qty;
          var cWac = uWac * sQty;
          var pWac = proceeds - cWac;
          st.realized_pnl_wac += pWac;
          st.current_qty -= sQty;
          st.current_cost_total -= cWac;
          yearly[yr].realized_pnl_wac += pWac;
          tEntry.realized_pnl_wac = pWac;
          tEntry.cost_basis = cWac;
        } else {
          tEntry.realized_pnl_wac = proceeds;
        }

        var rem = sQty;
        var cFifo = 0;
        while (rem > 0 && st.fifo_lots.length > 0) {
          var lot = st.fifo_lots[0];
          if (lot.qty <= rem) {
            cFifo += lot.qty * lot.unit_cost;
            rem -= lot.qty;
            st.fifo_lots.shift();
          } else {
            cFifo += rem * lot.unit_cost;
            lot.qty -= rem;
            rem = 0;
          }
        }
        var pFifo = proceeds - cFifo;
        st.realized_pnl_fifo += pFifo;
        yearly[yr].realized_pnl_fifo += pFifo;
        tEntry.realized_pnl_fifo = pFifo;

        tEntry.holdings_after = st.current_qty;
        tEntry.avg_cost_after = st.current_qty > 0 ? st.current_cost_total / st.current_qty : 0;
      }
      tradeLogs.push(tEntry);
    }
  });

  var stockList = Object.values(stocks).map(function(st) {
    var avgCost = st.current_qty > 1e-4 ? st.current_cost_total / st.current_qty : 0;
    var avgBuyPrice = st.total_buy_qty > 0 ? st.total_buy_amount / st.total_buy_qty : 0;
    var avgSellPrice = st.total_sell_qty > 0 ? st.total_sell_amount / st.total_sell_qty : 0;
    var dilutedCost = st.current_qty > 1e-4 ? (st.total_buy_amount - st.total_sell_amount - st.dividends_total) / st.current_qty : 0;
    var roi = st.total_buy_amount > 0 ? (st.realized_pnl_wac / st.total_buy_amount * 100) : 0;
    return {
      code: st.code,
      name: st.name,
      market: st.market,
      status: st.current_qty > 1e-4 ? '持仓中' : '已清仓',
      current_qty: st.current_qty,
      avg_cost: avgCost,
      diluted_cost: dilutedCost,
      avg_buy_price: avgBuyPrice,
      avg_sell_price: avgSellPrice,
      current_cost_total: st.current_cost_total,
      total_buy_qty: st.total_buy_qty,
      total_buy_amount: st.total_buy_amount,
      total_sell_qty: st.total_sell_qty,
      total_sell_amount: st.total_sell_amount,
      realized_pnl_wac: st.realized_pnl_wac,
      realized_pnl_fifo: st.realized_pnl_fifo,
      dividends_total: st.dividends_total,
      roi_wac: parseFloat(roi.toFixed(2)),
      trades_count: st.trades_count
    };
  });
  stockList.sort(function(a, b) { return b.realized_pnl_wac - a.realized_pnl_wac; });

  return {
    client_info: {
      account_no: acc,
      client_name: name,
      currency: ccy,
      total_records: records.length,
      earliest_date: records[0].date_str,
      latest_date: records[records.length - 1].date_str
    },
    all_time_totals: {
      deposit_total: allDep,
      withdrawal_total: allWith,
      net_deposit: allDep - allWith,
      dividend_total: divLogs.reduce(function(a, b) { return a + b.amount; }, 0),
      interest_total: intLogs.reduce(function(a, b) { return a + b.amount; }, 0),
      sales_proceeds_total: tradeLogs.filter(function(t) { return t.action === '卖出'; }).reduce(function(a, b) { return a + b.amount; }, 0),
      realized_pnl_wac_total: tradeLogs.filter(function(t) { return t.action === '卖出'; }).reduce(function(a, b) { return a + b.realized_pnl_wac; }, 0),
      realized_pnl_fifo_total: tradeLogs.filter(function(t) { return t.action === '卖出'; }).reduce(function(a, b) { return a + b.realized_pnl_fifo; }, 0)
    },
    yearly_stats: Object.values(yearly).sort(function(a, b) { return a.year - b.year; }),
    stocks: stockList,
    trade_logs: tradeLogs,
    dividend_logs: divLogs,
    interest_logs: intLogs,
    cash_logs: cashLogs,
    charge_logs: chargeLogs
  };
}

function exportToExcel() {
  if (!appData) return;
  var csvContent = 'data:text/csv;charset=utf-8,\uFEFF';
  csvContent += '【CRS 年度涉税收益申报汇总】\r\n';
  csvContent += '申报年度,股息总额(HKD),利息总额(HKD),股票已实现盈亏_加权平均(HKD),股票已实现盈亏_先进先出(HKD),出售金融资产总额(HKD),当年入金(HKD),当年出金(HKD)\r\n';
  appData.yearly_stats.forEach(function(y) {
    csvContent += y.year + '年,' + y.dividend_total + ',' + y.interest_total + ',' + y.realized_pnl_wac + ',' + y.realized_pnl_fifo + ',' + y.sales_proceeds + ',' + y.deposits + ',' + y.withdrawals + '\r\n';
  });

  csvContent += '\r\n【单只股票全景盈亏与持仓透视】\r\n';
  csvContent += '股票代码,股票名称,持仓状态,累计买入金额,累计卖出金额,已实现盈亏_WAC,已实现盈亏_FIFO,盈亏比例(%),累计分红,当前持股数量,持仓成本均价,持仓总成本,交易笔数\r\n';
  appData.stocks.forEach(function(s) {
    csvContent += s.code + ',' + s.name + ',' + s.status + ',' + s.total_buy_amount + ',' + s.total_sell_amount + ',' + s.realized_pnl_wac + ',' + s.realized_pnl_fifo + ',' + s.roi_wac + '%,' + s.dividends_total + ',' + s.current_qty + ',' + s.avg_cost + ',' + s.current_cost_total + ',' + s.trades_count + '\r\n';
  });

  var encodedUri = encodeURI(csvContent);
  var link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', 'CRS涉税收益申报汇总_' + (appData.client_info.client_name || '客户') + '_' + (appData.client_info.account_no || '1801606') + '.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('申报 Excel 数据已成功导出！', 'success');
}
