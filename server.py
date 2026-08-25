#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CRS 涉税金融资产与证券交易盈亏核算系统 - 本地 HTTP Web 服务
"""

import http.server
import socketserver
import os
import sys
import json
import urllib.parse
import urllib.request
from tax_calculator import calculate_file, calculate_tax_and_pnl

PORT = 8888
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def map_symbol_to_tencent(code, market=""):
    code = str(code).strip().replace("'", "").replace('"', '')
    market = str(market).strip().upper()
    
    # 1. 若代码已自带市场前缀 (如 hk00700, usAAPL, sh600519)
    low = code.lower()
    if len(low) > 2 and low.startswith(('hk', 'us', 'sh', 'sz', 'bj')):
        prefix = low[:2]
        rest = code[2:]
        if prefix == 'hk' and rest.isdigit():
            return f"hk{rest.zfill(5)}", code
        return f"{prefix}{rest}", code
    
    # 2. 港股判定 (市场为 HKEX/HK/SEHK 或纯数字且长度<=5位)
    if market in ['HK', 'HKEX', 'SEHK'] or (code.isdigit() and len(code) <= 5):
        padded = code.zfill(5)
        return f"hk{padded}", code
    
    # 3. A股判定 (6位纯数字)
    if code.isdigit() and len(code) == 6:
        if code.startswith(('60', '68', '90')):
            return f"sh{code}", code
        elif code.startswith(('00', '30', '20')):
            return f"sz{code}", code
        elif code.startswith(('8', '4', '92')):
            return f"bj{code}", code
            
    # 4. 美股判定 (市场为 US/NASDAQ/NYSE 或英文字母)
    if market in ['US', 'NASDAQ', 'NYSE', 'AMEX', 'USA'] or code.isalpha():
        return f"us{code.upper()}", code
        
    return (f"hk{code.zfill(5)}" if code.isdigit() else f"us{code.upper()}"), code

def fetch_tencent_quotes(stock_items):
    symbol_map = {}
    tencent_symbols = []
    
    for item in stock_items:
        if isinstance(item, dict):
            c = item.get('code', '')
            m = item.get('market', '')
        else:
            c = str(item)
            m = ''
        if not c:
            continue
        tsym, orig_code = map_symbol_to_tencent(c, m)
        symbol_map[tsym.lower()] = orig_code
        symbol_map[orig_code] = orig_code
        if tsym not in tencent_symbols:
            tencent_symbols.append(tsym)
            
    if not tencent_symbols:
        return {}
        
    url = f"https://qt.gtimg.cn/q={','.join(tencent_symbols)}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    
    results = {}
    try:
        with urllib.request.urlopen(req, timeout=6) as response:
            content = response.read().decode('gbk', errors='ignore')
            for line in content.strip().split(';'):
                line = line.strip()
                if not line or '=' not in line:
                    continue
                var_name, data = line.split('=', 1)
                data = data.strip().strip('"')
                parts = data.split('~')
                if len(parts) > 4:
                    tsym_key = var_name.replace('v_', '').strip().lower()
                    name = parts[1].strip()
                    resp_code = parts[2].strip()
                    try:
                        price = float(parts[3]) if parts[3] else 0.0
                    except ValueError:
                        price = 0.0
                    try:
                        prev_close = float(parts[4]) if parts[4] else 0.0
                    except ValueError:
                        prev_close = 0.0
                    try:
                        open_price = float(parts[5]) if len(parts) > 5 and parts[5] else 0.0
                    except ValueError:
                        open_price = 0.0
                    
                    change = 0.0
                    change_pct = 0.0
                    if len(parts) > 32 and parts[32]:
                        try:
                            change_pct = float(parts[32])
                            change = float(parts[31]) if len(parts) > 31 and parts[31] else (price - prev_close)
                        except Exception:
                            if prev_close > 0 and price > 0:
                                change = price - prev_close
                                change_pct = round((change / prev_close) * 100, 2)
                    elif prev_close > 0 and price > 0:
                        change = price - prev_close
                        change_pct = round((change / prev_close) * 100, 2)
                        
                    trade_time = parts[30] if len(parts) > 30 and parts[30] else ''
                    orig_code = symbol_map.get(tsym_key, resp_code)
                    
                    quote_data = {
                        'code': orig_code,
                        'name': name,
                        'price': price,
                        'prev_close': prev_close,
                        'open': open_price,
                        'change': round(change, 4),
                        'change_pct': round(change_pct, 2),
                        'time': trade_time,
                        'tencent_sym': tsym_key
                    }
                    results[orig_code] = quote_data
                    results[resp_code] = quote_data
                    if orig_code.isdigit():
                        results[orig_code.zfill(5)] = quote_data
                        results[orig_code.lstrip('0')] = quote_data
    except Exception as e:
        print(f"Error fetching quotes from Tencent: {e}", file=sys.stderr)
        
    return results

def fetch_tencent_fx_rates():
    """
    从腾讯财经外汇行情源抓取实时外币兑港币 (HKD) 汇率
    whUSDHKD: 美元兑港币 (如 7.8371)
    whHKDCNY: 港币兑人民币 (如 0.8569 -> 1 CNY = 1/0.8569 ≈ 1.1670 HKD)
    whEURHKD: 欧元兑港币 (如 9.1487)
    whGBPHKD: 英镑兑港币 (如 10.6899)
    whJPYHKD: 百日元兑港币 (如 4.9212 -> 1 JPY ≈ 0.0492 HKD)
    whCADHKD: 加元兑港币 (如 5.6658)
    whAUDHKD: 澳元兑港币 (如 5.6089)
    """
    default_rates = {
        'HKD': 1.0,
        'USD': 7.8300,
        'CNY': 1.1650,
        'RMB': 1.1650,
        'EUR': 9.1500,
        'GBP': 10.6500,
        'JPY': 0.0492,
        'CAD': 5.6600,
        'AUD': 5.6000
    }
    
    url = "https://qt.gtimg.cn/q=whUSDHKD,whHKDCNY,whEURHKD,whGBPHKD,whJPYHKD,whCADHKD,whAUDHKD"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    
    rates = dict(default_rates)
    update_time = ''
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            content = response.read().decode('gbk', errors='ignore')
            for line in content.strip().split(';'):
                line = line.strip()
                if not line or '=' not in line:
                    continue
                var_name, data = line.split('=', 1)
                data = data.strip().strip('"')
                parts = data.split('~')
                if len(parts) > 3:
                    sym = var_name.replace('v_', '').strip()
                    try:
                        val = float(parts[3]) if parts[3] else 0.0
                    except ValueError:
                        val = 0.0
                    if val > 0:
                        if sym == 'whUSDHKD':
                            rates['USD'] = round(val, 4)
                        elif sym == 'whHKDCNY':
                            cny_rate = round(1.0 / val, 4)
                            rates['CNY'] = cny_rate
                            rates['RMB'] = cny_rate
                        elif sym == 'whEURHKD':
                            rates['EUR'] = round(val, 4)
                        elif sym == 'whGBPHKD':
                            rates['GBP'] = round(val, 4)
                        elif sym == 'whJPYHKD':
                            rates['JPY'] = round(val / 100.0, 6)
                        elif sym == 'whCADHKD':
                            rates['CAD'] = round(val, 4)
                        elif sym == 'whAUDHKD':
                            rates['AUD'] = round(val, 4)
                    if len(parts) > 21 and parts[21]:
                        update_time = parts[21]
    except Exception as e:
        print(f"Error fetching fx rates from Tencent: {e}", file=sys.stderr)
        
    return {
        'base': 'HKD',
        'rates': rates,
        'update_time': update_time,
        'source': 'Tencent Finance FX'
    }

class TaxServiceHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # 禁用浏览器缓存，保证数据与交互实时生效
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/rates':
            fx_data = fetch_tencent_fx_rates()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps(fx_data, ensure_ascii=False).encode('utf-8'))
            return

        if parsed.path == '/api/quotes':
            params = urllib.parse.parse_qs(parsed.query)
            symbols_raw = params.get('symbols', [''])[0]
            symbols = [s.strip() for s in symbols_raw.split(',') if s.strip()]
            quotes = fetch_tencent_quotes(symbols)
            fx_data = fetch_tencent_fx_rates()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({'quotes': quotes, 'rates': fx_data.get('rates', {}), 'fx_info': fx_data, 'status': 'success'}, ensure_ascii=False).encode('utf-8'))
            return
            
        if self.path == '/api/template' or self.path == '/template/C1900.csv' or self.path == '/C1900_template.csv':
            tpl_path = os.path.join(DIRECTORY, 'C1900_template.csv')
            if os.path.exists(tpl_path):
                with open(tpl_path, 'rb') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/csv; charset=utf-8')
                self.send_header('Content-Disposition', 'attachment; filename="C1900_template_blank.csv"')
                self.end_headers()
                self.wfile.write(content)
                return
            else:
                self.send_response(404)
                self.end_headers()
                return
        super().do_GET()

    def do_POST(self):
        if self.path == '/api/rates':
            fx_data = fetch_tencent_fx_rates()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps(fx_data, ensure_ascii=False).encode('utf-8'))
            return

        if self.path == '/api/quotes':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                payload = json.loads(body.decode('utf-8')) if body else {}
                stocks = payload.get('stocks', payload.get('symbols', []))
                quotes = fetch_tencent_quotes(stocks)
                fx_data = fetch_tencent_fx_rates()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'quotes': quotes, 'rates': fx_data.get('rates', {}), 'fx_info': fx_data, 'status': 'success'}, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e), 'quotes': {}}, ensure_ascii=False).encode('utf-8'))
            return

        if self.path == '/api/upload':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                
                # 判断是 CSV 还是 XLSX
                is_zip = len(body) > 4 and body[0] == 0x50 and body[1] == 0x4b
                ext = '.xlsx' if is_zip else '.csv'
                temp_path = os.path.join(DIRECTORY, f'_temp_uploaded{ext}')
                with open(temp_path, 'wb') as f:
                    f.write(body)
                
                calc_res = calculate_file(temp_path)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps(calc_res, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}, ensure_ascii=False).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def run_server(port=PORT):
    for p in range(port, port + 10):
        try:
            socketserver.TCPServer.allow_reuse_address = True
            with socketserver.TCPServer(("", p), TaxServiceHandler) as httpd:
                print(f"============================================================")
                print(f"🚀 【CRS 涉税金融资产智能核算工作台】Web 网站服务已就绪！")
                print(f"👉 网站访问地址: http://127.0.0.1:{p}")
                print(f"👉 局域网访问地址: http://localhost:{p}")
                print(f"============================================================")
                httpd.serve_forever()
                break
        except OSError:
            print(f"端口 {p} 已被占用，正在尝试下一个端口...")
            continue

if __name__ == '__main__':
    port_arg = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    run_server(port_arg)
