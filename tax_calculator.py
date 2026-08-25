# -*- coding: utf-8 -*-
"""
CRS 涉税金融资产与证券交易盈亏通用核算引擎
支持全格式券商 Excel / CSV 流水
内置公司行动与换码智能识别（私有化退市收购回款、供股认购结转、内部换码转仓、除净派息分红与红股）
"""

import sys, os, json, zipfile, csv, re
import xml.etree.ElementTree as ET
from datetime import datetime
from collections import defaultdict

ALIAS_MAP = {
    'account_no': ['account_no', 'account', '账号', '客户账号', '证券账号', 'a/c no'],
    'client_name': ['account_name_chi', 'client_name', 'name', '姓名', '客户名称', '名称', '户名', 'account_name', 'account_name_eng'],
    'trade_date': ['trade_date', 'tx_date', 'date', '交易日期', '日期', '成交日期', '结息日期', '入账日期'],
    'record_type': ['record_type', 'type', '业务类型', '记录类型', '交易类型'],
    'io_type': ['io_type', 'io', 'direction', '收支类型', '买卖方向', '方向'],
    'market': ['exchange_code', 'market', '市场', '交易市场', '交易所'],
    'code': ['product_code', 'stock_code', 'symbol', 'code', '股票代码', '证券代码', '代码', '产品代码'],
    'name': ['product_name', 'stock_name', '股票名称', '证券名称', '产品名称'],
    'remarks': ['remark', 'remarks', 'description', '备注', '摘要', '说明'],
    'qty': ['qty', 'quantity', 'shares', '数量', '成交数量', '股数'],
    'price': ['average_price', 'avg_price', 'price', '平均价', '成交均价', '成交价', '单价'],
    'ccy': ['ccy', 'currency', '币种', '结算币种', '货币'],
    'deduct_amount': ['dr_amount', 'debit_amount', 'deduct_amount', 'deduct', '扣除金额', '支出金额', '借方金额', '扣款金额'],
    'deposit_amount': ['cr_amount', 'credit_amount', 'deposit_amount', 'deposit', '存入金额', '收入金额', '贷方金额', '收款金额']
}

def get_field(row, standard_field, default=''):
    for alias in ALIAS_MAP[standard_field]:
        if alias in row and str(row[alias]).strip() != '':
            return row[alias]
        for k in row:
            if k.strip().lower() == alias:
                return row[k]
    return default

def parse_csv_file(file_path):
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        reader = csv.DictReader(f)
        raw_rows = list(reader)
    return process_raw_rows(raw_rows)

def parse_xlsx(file_path):
    with zipfile.ZipFile(file_path, 'r') as z:
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            ss_xml = ET.fromstring(z.read('xl/sharedStrings.xml'))
            ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
            for si in ss_xml.findall(f'{ns}si'):
                shared_strings.append(''.join(si.itertext()))

        sheet_xml = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
        ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
        rows = sheet_xml.findall(f'.//{ns}row')

        header = {}
        raw_rows = []
        for r in rows:
            row_dict = {}
            for c in r.findall(f'{ns}c'):
                cell_ref = c.attrib.get('r')
                col_letter = ''.join([ch for ch in cell_ref if ch.isalpha()])
                cell_type = c.attrib.get('t')
                val = c.find(f'{ns}v')
                val_text = val.text if val is not None else ''
                if cell_type == 's' and val_text.isdigit():
                    idx = int(val_text)
                    if idx < len(shared_strings):
                        val_text = shared_strings[idx]
                row_dict[col_letter] = val_text

            if r.attrib.get('r') == '1':
                header = row_dict
            else:
                named_row = {header.get(k, k): v for k, v in row_dict.items()}
                raw_rows.append(named_row)

    return process_raw_rows(raw_rows)

def process_raw_rows(raw_rows):
    clean_data = []
    for d in raw_rows:
        raw_date = str(get_field(d, 'trade_date')).strip()
        if not raw_date:
            continue
        try:
            if '-' in raw_date and any(m in raw_date for m in ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']):
                dt = datetime.strptime(raw_date[:20].strip(), '%d-%b-%Y %H:%M:%S')
            elif '-' in raw_date and len(raw_date) >= 10 and raw_date[4] == '-':
                dt = datetime.strptime(raw_date[:10], '%Y-%m-%d')
            else:
                dt = datetime.fromisoformat(raw_date.replace(' ', 'T'))
        except Exception:
            try:
                dt = datetime.strptime(raw_date[:11].strip(), '%d-%b-%Y')
            except Exception:
                dt = datetime(1970, 1, 1)

        raw_code = str(get_field(d, 'code')).strip()
        name = str(d.get('product_name') or get_field(d, 'name')).strip()

        item = {
            'account_no': str(get_field(d, 'account_no')).strip(),
            'client_name': str(get_field(d, 'client_name')).strip(),
            'parsed_date': dt,
            'date_str': dt.strftime('%Y-%m-%d'),
            'year': dt.year,
            'record_type': str(get_field(d, 'record_type')).strip(),
            'io_type': str(get_field(d, 'io_type')).strip(),
            'market': str(get_field(d, 'market', 'HKEX')).strip(),
            'code': raw_code,
            'name': name,
            'remarks': str(get_field(d, 'remarks')).strip(),
            'qty': float(get_field(d, 'qty') or 0),
            'avg_price': float(get_field(d, 'price') or 0),
            'ccy': str(get_field(d, 'ccy', 'HKD')).strip() or 'HKD',
            'deduct_amount': float(get_field(d, 'deduct_amount') or 0),
            'deposit_amount': float(get_field(d, 'deposit_amount') or 0)
        }
        clean_data.append(item)

    clean_data.sort(key=lambda x: x['parsed_date'])
    return clean_data

def calculate_file(file_path):
    if file_path.lower().endswith('.csv'):
        records = parse_csv_file(file_path)
    else:
        records = parse_xlsx(file_path)
    return calculate_tax_and_pnl(records)

def calculate_tax_and_pnl(records, start_date=None, end_date=None):
    if not records:
        return {}

    account_no = records[0].get('account_no') or '00869909'
    client_name = records[0].get('client_name') or '客户'
    currency = records[0].get('ccy') or 'HKD'

    # 预扫描公司行动 (Corporate Actions: 私有化退市收购回款、供股认购扣款)
    privatisation_cash = {}
    sub_offer_cash = {}

    for rec in records:
        rt = rec.get('record_type', '').upper()
        io = rec.get('io_type', '').upper()
        remarks = rec.get('remarks', '')
        remarks_upper = remarks.upper()
        cr = rec['deposit_amount']
        dr = rec['deduct_amount']

        if 'CASH' in rt or rt == 'CASH IN/OUT' or '资金' in rt:
            if ('PRIVATISATION' in remarks_upper or 'TAKEOVER' in remarks_upper or 'TENDER OFFER' in remarks_upper) and io in ['D', 'DEPOSIT', '存入'] and cr > 0:
                m = re.search(r'#(\d+)', remarks)
                if m:
                    c_code = m.group(1).zfill(5)
                    privatisation_cash[c_code] = cr
                    privatisation_cash[m.group(1)] = cr

            elif ('SUB OFFER' in remarks_upper or 'RIGHTS' in remarks_upper or 'OPEN OFFER' in remarks_upper) and io in ['W', 'WITHDRAW', '提取', '出金'] and dr > 0:
                m = re.search(r'#(\d+)', remarks)
                if m:
                    o_code = m.group(1)
                    sub_offer_cash[o_code] = dr

    all_time_deposit = 0.0
    all_time_withdraw = 0.0

    stocks = defaultdict(lambda: {
        'code': '',
        'name': '',
        'market': 'HKEX',
        'total_buy_qty': 0.0,
        'total_buy_amount': 0.0,
        'total_sell_qty': 0.0,
        'total_sell_amount': 0.0,
        'current_qty': 0.0,
        'current_cost_total': 0.0,
        'realized_pnl_wac': 0.0,
        'realized_pnl_fifo': 0.0,
        'dividends_total': 0.0,
        'trades_count': 0,
        'history_trades': [],
        'fifo_lots': []
    })

    trade_logs = []
    dividend_logs = []
    interest_logs = []
    cash_logs = []
    charge_logs = []

    yearly_stats = defaultdict(lambda: {
        'year': 0,
        'dividend_total': 0.0,
        'dividend_charges': 0.0,
        'interest_total': 0.0,
        'sales_proceeds': 0.0,
        'realized_pnl_wac': 0.0,
        'realized_pnl_fifo': 0.0,
        'deposits': 0.0,
        'withdrawals': 0.0,
        'trades_count': 0
    })

    for rec in records:
        dt = rec['parsed_date']
        yr = rec['year']
        yearly_stats[yr]['year'] = yr
        rt = rec.get('record_type', '').upper()
        io = rec.get('io_type', '').upper()
        remarks = rec.get('remarks', '')
        remarks_upper = remarks.upper()
        deduct = rec['deduct_amount']
        deposit = rec['deposit_amount']

        is_cash = 'CASH' in rt or '资金' in rt or '现金' in rt or rt == 'CASH IN/OUT'
        is_trade = 'TRADE' in rt or '交易' in rt or '买卖' in rt or '证券' in rt or '股票转入/转出' in rec.get('record_type', '') or 'PRODUCT' in rt

        if is_cash:
            is_privatisation = ('PRIVATISATION' in remarks_upper or 'TAKEOVER' in remarks_upper or 'TENDER OFFER' in remarks_upper) and io in ['D', 'DEPOSIT', '存入']
            is_sub_offer_pay = ('SUB OFFER' in remarks_upper or 'RIGHTS' in remarks_upper or 'OPEN OFFER' in remarks_upper) and io in ['W', 'WITHDRAW', '提取', '出金']

            if is_privatisation:
                # 私有化收购款直接作为对应股票的卖出回款
                continue

            if is_sub_offer_pay:
                # 供股认购款直接结转为获配股票的买入成本
                continue

            is_div = 'DIVIDEND' in remarks_upper or 'DIV ' in remarks_upper or '股息' in remarks or '分红' in remarks
            is_int = 'INT.' in remarks_upper or 'INTEREST' in remarks_upper or '利息' in remarks or '结息' in remarks
            is_ipo = 'IPO' in remarks_upper or 'EIPO' in remarks_upper or 'APP #' in remarks_upper or 'REFUND #' in remarks_upper or 'LOAN INT' in remarks_upper or 'ALLOTMENT' in remarks_upper or '新股' in remarks or '申购' in remarks
            is_charge = is_ipo or 'CHARGE' in remarks_upper or 'CHG' in remarks_upper or 'FEE' in remarks_upper or 'SERVICE' in remarks_upper or 'POSTAGE' in remarks_upper or '手续费' in remarks or '收费' in remarks or '服务费' in remarks or '邮费' in remarks

            if is_div:
                dividend_logs.append({
                    'date': rec['date_str'],
                    'amount': deposit,
                    'remarks': remarks,
                    'year': yr
                })
                yearly_stats[yr]['dividend_total'] += deposit
                for code in stocks:
                    if code and (code in remarks or code.lstrip('0') in remarks):
                        stocks[code]['dividends_total'] += deposit
                        break

            elif is_int and not is_ipo:
                interest_logs.append({
                    'date': rec['date_str'],
                    'amount': deposit,
                    'remarks': remarks,
                    'year': yr
                })
                yearly_stats[yr]['interest_total'] += deposit

            elif is_charge:
                amt = deduct if io in ['W', 'WITHDRAW', '提取', '出金'] else deposit
                c_type = '规费扣除'
                if is_ipo:
                    if 'REFUND' in remarks_upper:
                        c_type = 'eIPO退款'
                    elif 'LOAN INT' in remarks_upper:
                        c_type = 'eIPO融资利息'
                    elif 'COMMISSION' in remarks_upper:
                        c_type = 'eIPO退佣金'
                    elif 'HANDLING FEE' in remarks_upper or 'FEE' in remarks_upper:
                        c_type = 'eIPO手续费'
                    elif io in ['W', 'WITHDRAW', '提取', '出金'] or 'APP #' in remarks_upper:
                        c_type = 'eIPO申购扣款'
                    else:
                        c_type = 'eIPO往来'
                yearly_stats[yr]['dividend_charges'] += (deduct - deposit)
                charge_logs.append({'date': rec['date_str'], 'type': c_type, 'amount': amt, 'io': io, 'remarks': remarks, 'year': yr})

            else:
                if io in ['D', 'DEPOSIT', '存入', '入金']:
                    all_time_deposit += deposit
                    yearly_stats[yr]['deposits'] += deposit
                    cash_logs.append({'date': rec['date_str'], 'type': '入金', 'amount': deposit, 'remarks': remarks, 'year': yr})
                elif io in ['W', 'WITHDRAW', '提取', '出金']:
                    all_time_withdraw += deduct
                    yearly_stats[yr]['withdrawals'] += deduct
                    cash_logs.append({'date': rec['date_str'], 'type': '出金', 'amount': deduct, 'remarks': remarks, 'year': yr})

        elif is_trade:
            raw_code = rec['code']
            if not raw_code or raw_code.startswith('44'):
                # 忽略供股权临时代码
                continue

            # 内部换码转换过滤：若为带 * 的代码在同日或供股转换（如 *02349 转换为 02349）
            if raw_code.startswith('*') and 'Product In/Out' in rec['record_type']:
                # 供股换码内部转仓，不重复入账
                continue

            code = raw_code.lstrip('*')
            name = rec['name']
            market = rec['market']
            qty = rec['qty']
            price = rec['avg_price']
            st = stocks[code]
            st['code'] = code
            if not st['name'] or (name and not name.startswith('*')):
                st['name'] = name
            st['market'] = market

            is_delisted = 'DELISTED' in remarks_upper or 'PRIVATISATION' in remarks_upper
            is_sub_offer_dep = 'SUB OFFER' in remarks_upper and io in ['D', '转入', 'B']
            is_bonus = ('BONUS' in remarks_upper or 'SCRIP' in remarks_upper or '红股' in remarks or '实物分红' in remarks) and io in ['D', '转入', 'B']
            is_pure_transfer_in = ('Product In/Out' in rec['record_type'] and io in ['D', '转入'] and deduct == 0 and not is_sub_offer_dep and not is_bonus)

            # 判断是否为非交易性内部换码或无金额转出
            is_pure_transfer_out = ('Product In/Out' in rec['record_type'] and io in ['W', '提取', '出'] and deduct == 0 and deposit == 0 and price == 0 and not is_delisted)
            if is_pure_transfer_out:
                # 内部换码转出或非交易转出，绝对不计入卖出交易与盈亏
                continue

            is_buy = (io in ['B', 'BUY', '买入', '转入', 'D'] or (io == '' and qty > 0)) and not is_delisted
            if is_bonus:
                action_label = '红股获派'
            elif is_sub_offer_dep:
                action_label = '供股配股'
            elif is_pure_transfer_in:
                action_label = '证券转入'
            elif is_buy:
                action_label = '买入'
            else:
                action_label = '卖出'

            trade_entry = {
                'date': rec['date_str'],
                'year': yr,
                'code': code,
                'name': st['name'],
                'market': market,
                'action': action_label,
                'qty': abs(qty),
                'price': price,
                'amount': 0.0,
                'realized_pnl_wac': 0.0,
                'realized_pnl_fifo': 0.0,
                'cost_basis': 0.0,
                'holdings_after': 0.0,
                'avg_cost_after': 0.0,
                'remarks': remarks
            }

            if is_buy:
                cost_in = deduct
                if cost_in <= 0 and price > 0:
                    cost_in = abs(qty) * price
                elif cost_in <= 0 and is_sub_offer_dep:
                    # 匹配供股认购扣款
                    m = re.search(r'#(\d+)', remarks)
                    if m and m.group(1) in sub_offer_cash:
                        cost_in = sub_offer_cash[m.group(1)]
                    else:
                        for o_amt in sub_offer_cash.values():
                            cost_in = o_amt
                            break

                trade_entry['price'] = price if price > 0 else (cost_in / abs(qty) if abs(qty) > 0 else 0)
                trade_entry['amount'] = cost_in
                st['total_buy_qty'] += abs(qty)
                st['total_buy_amount'] += cost_in
                st['current_qty'] += abs(qty)
                st['current_cost_total'] += cost_in
                st['fifo_lots'].append({'qty': abs(qty), 'unit_cost': cost_in / abs(qty) if abs(qty) > 0 else 0})

                st['trades_count'] += 1
                yearly_stats[yr]['trades_count'] += 1
                trade_entry['holdings_after'] = st['current_qty']
                trade_entry['avg_cost_after'] = st['current_cost_total'] / st['current_qty'] if st['current_qty'] > 0 else 0.0

            else:
                sell_qty = abs(qty)
                proceeds = deposit
                if proceeds <= 0 and price > 0:
                    proceeds = sell_qty * price
                elif proceeds <= 0 and (is_delisted or code in privatisation_cash or code.lstrip('0') in privatisation_cash):
                    # 私有化退市回款关联匹配
                    proceeds = privatisation_cash.get(code, privatisation_cash.get(code.lstrip('0'), 0.0))

                # 严格防御：如果确实没有任何回款且非私有化，绝不能作为卖出产生虚假亏损
                if proceeds <= 0 and price <= 0:
                    continue

                trade_entry['price'] = price if price > 0 else (proceeds / sell_qty if sell_qty > 0 else 0)
                trade_entry['amount'] = proceeds
                st['total_sell_qty'] += sell_qty
                st['total_sell_amount'] += proceeds
                yearly_stats[yr]['sales_proceeds'] += proceeds

                # WAC
                if st['current_qty'] > 0:
                    unit_wac = st['current_cost_total'] / st['current_qty']
                    cost_basis_wac = unit_wac * sell_qty
                    pnl_wac = proceeds - cost_basis_wac
                    st['realized_pnl_wac'] += pnl_wac
                    st['current_qty'] -= sell_qty
                    st['current_cost_total'] -= cost_basis_wac
                    yearly_stats[yr]['realized_pnl_wac'] += pnl_wac
                    trade_entry['realized_pnl_wac'] = pnl_wac
                    trade_entry['cost_basis'] = cost_basis_wac
                else:
                    trade_entry['realized_pnl_wac'] = proceeds

                # FIFO
                rem_qty = sell_qty
                cost_basis_fifo = 0.0
                while rem_qty > 0 and st['fifo_lots']:
                    lot = st['fifo_lots'][0]
                    if lot['qty'] <= rem_qty:
                        cost_basis_fifo += lot['qty'] * lot['unit_cost']
                        rem_qty -= lot['qty']
                        st['fifo_lots'].pop(0)
                    else:
                        cost_basis_fifo += rem_qty * lot['unit_cost']
                        lot['qty'] -= rem_qty
                        rem_qty = 0

                pnl_fifo = proceeds - cost_basis_fifo
                st['realized_pnl_fifo'] += pnl_fifo
                yearly_stats[yr]['realized_pnl_fifo'] += pnl_fifo
                trade_entry['realized_pnl_fifo'] = pnl_fifo

                st['trades_count'] += 1
                yearly_stats[yr]['trades_count'] += 1
                trade_entry['holdings_after'] = st['current_qty']
                trade_entry['avg_cost_after'] = st['current_cost_total'] / st['current_qty'] if st['current_qty'] > 0 else 0.0

            trade_logs.append(trade_entry)
            st['history_trades'].append(trade_entry)

    stock_summary = []
    for code, s in stocks.items():
        avg_cost = s['current_cost_total'] / s['current_qty'] if s['current_qty'] > 1e-4 else 0.0
        avg_buy_price = s['total_buy_amount'] / s['total_buy_qty'] if s['total_buy_qty'] > 0 else 0.0
        avg_sell_price = s['total_sell_amount'] / s['total_sell_qty'] if s['total_sell_qty'] > 0 else 0.0
        diluted_cost = (s['total_buy_amount'] - s['total_sell_amount'] - s['dividends_total']) / s['current_qty'] if s['current_qty'] > 1e-4 else 0.0
        roi_wac = (s['realized_pnl_wac'] / s['total_buy_amount'] * 100) if s['total_buy_amount'] > 0 else 0.0
        stock_summary.append({
            'code': code,
            'name': s['name'],
            'market': s['market'],
            'status': '持仓中' if s['current_qty'] > 1e-4 else '已清仓',
            'current_qty': s['current_qty'],
            'avg_cost': avg_cost,
            'diluted_cost': diluted_cost,
            'avg_buy_price': avg_buy_price,
            'avg_sell_price': avg_sell_price,
            'current_cost_total': s['current_cost_total'],
            'total_buy_qty': s['total_buy_qty'],
            'total_buy_amount': s['total_buy_amount'],
            'total_sell_qty': s['total_sell_qty'],
            'total_sell_amount': s['total_sell_amount'],
            'realized_pnl_wac': s['realized_pnl_wac'],
            'realized_pnl_fifo': s['realized_pnl_fifo'],
            'dividends_total': s['dividends_total'],
            'roi_wac': round(roi_wac, 2),
            'trades_count': s['trades_count']
        })

    stock_summary.sort(key=lambda x: x['realized_pnl_wac'], reverse=True)
    yearly_list = sorted(list(yearly_stats.values()), key=lambda x: x['year'])

    total_sales_proceeds = sum(t['amount'] for t in trade_logs if t['action'] == '卖出')
    total_realized_pnl_wac = sum(t['realized_pnl_wac'] for t in trade_logs if t['action'] == '卖出')
    total_realized_pnl_fifo = sum(t['realized_pnl_fifo'] for t in trade_logs if t['action'] == '卖出')
    total_dividends = sum(d['amount'] for d in dividend_logs)
    total_interest = sum(i['amount'] for i in interest_logs)

    return {
        'client_info': {
            'account_no': account_no,
            'client_name': client_name,
            'currency': currency,
            'total_records': len(records),
            'earliest_date': records[0]['date_str'] if records else '',
            'latest_date': records[-1]['date_str'] if records else ''
        },
        'all_time_totals': {
            'deposit_total': all_time_deposit,
            'withdrawal_total': all_time_withdraw,
            'net_deposit': all_time_deposit - all_time_withdraw,
            'dividend_total': total_dividends,
            'interest_total': total_interest,
            'sales_proceeds_total': total_sales_proceeds,
            'realized_pnl_wac_total': total_realized_pnl_wac,
            'realized_pnl_fifo_total': total_realized_pnl_fifo
        },
        'yearly_stats': yearly_list,
        'stocks': stock_summary,
        'trade_logs': trade_logs,
        'dividend_logs': dividend_logs,
        'interest_logs': interest_logs,
        'cash_logs': cash_logs,
        'charge_logs': charge_logs
    }

if __name__ == '__main__':
    file_path = sys.argv[1] if len(sys.argv) > 1 else 'C1900.csv'
    res = calculate_file(file_path)
    with open('calculated_data.json', 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    print(f"Successfully processed {file_path} and updated calculated_data.json!")
