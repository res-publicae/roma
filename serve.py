#!/usr/bin/env python3
"""Local web server for the Rome model.

Same as `python3 -m http.server`, but tells the browser never to cache, so an edited
file is always picked up on the next reload.
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    print(f"Serving on http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), NoCache).serve_forever()
