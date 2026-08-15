"""本地开发服务器：禁用缓存，python serve.py [端口]"""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8133
    print(f'Serving http://127.0.0.1:{port} with cache disabled')
    HTTPServer(('127.0.0.1', port), NoCacheHandler).serve_forever()
