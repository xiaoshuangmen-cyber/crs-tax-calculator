#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一键启动 Web 网站并在默认浏览器中自动打开
"""

import os
import sys
import time
import webbrowser
import threading
from server import run_server, PORT

def open_browser():
    time.sleep(0.8)
    url = f"http://127.0.0.1:{PORT}"
    print(f"正在自动打开默认浏览器访问网站: {url} ...")
    webbrowser.open(url)

if __name__ == '__main__':
    t = threading.Thread(target=open_browser)
    t.daemon = True
    t.start()
    run_server(PORT)
