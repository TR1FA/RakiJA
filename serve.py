"""Lokalni server za testiranje RakiJA na telefonu (telefon i računar na istom Wi-Fi-ju).

Pokretanje:  python serve.py      (port se mijenja sa PORT=9000)
"""
import http.server
import os
import socket

PORT = int(os.environ.get("PORT", "8080"))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript",
    }

    def end_headers(self):
        # Tokom testiranja telefon uvijek uzima najnoviju verziju fajlova.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"RakiJA radi na: http://{lan_ip()}:{PORT}/  (otvori na telefonu)")
    http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
