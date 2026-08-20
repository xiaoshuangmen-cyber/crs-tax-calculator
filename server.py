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
from tax_calculator import calculate_file, calculate_tax_and_pnl

PORT = 8888
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class TaxServiceHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # 禁用浏览器缓存，保证数据与交互实时生效
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_GET(self):
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
