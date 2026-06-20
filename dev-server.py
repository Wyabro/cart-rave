"""Static dev server for Cart Rave with caching disabled.

`python -m http.server` lets browsers heuristically cache ES modules, so edits to
main.js / cart.js / src/*.js silently never reload (only ?v=-busted files refresh).
This server sends no-store headers so every reload pulls fresh code.

Usage:
    python dev-server.py            # serves cwd on http://localhost:8085
    python dev-server.py 8090       # custom port
"""

import http.server
import socketserver
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """Serves files identically to SimpleHTTPRequestHandler but forbids caching."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8085

    class Server(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True

    with Server(("", port), NoCacheHandler) as httpd:
        print("Serving Cart Rave (no-cache) on http://localhost:{0}".format(port))
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down.")


if __name__ == "__main__":
    main()
