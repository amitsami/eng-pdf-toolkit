"""Loopback proxy for HTML conversion: deny private/link-local destinations."""
import ipaddress
import select
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

_lock = threading.Lock()
_server = None

def connect_public(host, port):
    if port not in (80, 443):
        raise ValueError('Only public HTTP/HTTPS websites are allowed')
    addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('Private, local and cloud metadata addresses are blocked')
    for family, kind, proto, _, address in addresses:
        s = socket.socket(family, kind, proto)
        s.settimeout(15)
        try:
            s.connect(address)
            return s
        except OSError:
            s.close()
    raise OSError('Website unavailable')

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def relay(self, upstream):
        sockets = (self.connection, upstream)
        deadline = time.monotonic() + 90
        total = 0
        while time.monotonic() < deadline and total < 32 * 1024 * 1024:
            ready, _, _ = select.select(sockets, [], [], 5)
            for src in ready:
                data = src.recv(65536)
                if not data:
                    return
                total += len(data)
                (upstream if src is self.connection else self.connection).sendall(data)

    def do_CONNECT(self):
        try:
            dest = urlsplit('//' + self.path)
            with connect_public(dest.hostname, dest.port or 443) as upstream:
                self.send_response(200, 'Connection established')
                self.end_headers()
                self.relay(upstream)
        except (ValueError, OSError):
            self.send_error(403, 'Only public HTTP/HTTPS destinations are allowed')

    def do_GET(self):
        try:
            dest = urlsplit(self.path)
            if dest.scheme != 'http' or dest.username or dest.password:
                raise ValueError('Invalid URL')
            with connect_public(dest.hostname, dest.port or 80) as upstream:
                path = dest.path or '/'
                if dest.query:
                    path += '?' + dest.query
                lines = [f'GET {path} HTTP/1.1', f'Host: {dest.netloc}', 'Connection: close']
                for key, value in self.headers.items():
                    if key.lower() not in ('host','connection','proxy-connection','proxy-authorization','transfer-encoding','content-length'):
                        lines.append(f'{key}: {value}')
                upstream.sendall(('\r\n'.join(lines) + '\r\n\r\n').encode('latin-1'))
                self.relay(upstream)
        except (ValueError, OSError):
            self.send_error(403, 'Only public HTTP/HTTPS destinations are allowed')

    def do_POST(self):
        self.send_error(405, 'Read-only conversion proxy')

def proxy_url():
    global _server
    with _lock:
        if _server is None:
            _server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
            _server.daemon_threads = True
            threading.Thread(target=_server.serve_forever, daemon=True).start()
        return f'http://127.0.0.1:{_server.server_port}'


def validate_public_url(url):
    dest = urlsplit(url)
    if dest.scheme not in ("http", "https") or not dest.hostname or dest.username or dest.password:
        raise ValueError("Only public HTTP/HTTPS websites are allowed")
    port = dest.port or (443 if dest.scheme == "https" else 80)
    if port not in (80, 443):
        raise ValueError("Only standard HTTP/HTTPS ports are allowed")
    addresses = socket.getaddrinfo(dest.hostname, port, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError("Private, local and cloud metadata addresses are blocked")

from urllib.request import HTTPRedirectHandler
class PublicRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_public_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)
