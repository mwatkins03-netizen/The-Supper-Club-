#!/usr/bin/env python3
"""Local stand-in for proxy/worker.js. Holds the Levanto Sage key and fetches NYPL scans with CORS.
Key: SAGE_API_KEY in the environment, or a line SAGE_API_KEY=... in ~/.config/menu-lab/sage.env (never in this repo).
Usage:  python3 -I proxy/dev-proxy.py 8791
Routes:
  GET  /             health + features
  GET  /img?id=N&t=q NYPL derivative image (t = w 760px, q 1600px, r 300px) with CORS, so the page can resize it
  POST /sage         body {"requests":[...]} forwarded to https://sage.levanto.ai/decide/batch
Jev is called directly at the Jev Sandbox Worker (it already allows any origin).
"""
import json, os, re, sys, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8791
KEY = os.environ.get("SAGE_API_KEY")
if not KEY:
    f = Path.home() / ".config/menu-lab/sage.env"
    if f.exists():
        m = re.search(r"SAGE_API_KEY=(\S+)", f.read_text())
        KEY = m and m.group(1)
SAGE = "https://sage.levanto.ai/decide/batch"
MAX_BODY = 24_000_000
IMG_CACHE = {}

class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    def _json(self, status, obj):
        b = obj if isinstance(obj, bytes) else json.dumps(obj).encode()
        self.send_response(status); self._cors(); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_GET(self):
        path, _, qs = self.path.partition("?")
        if path.rstrip("/").endswith("/img"):
            q = dict(p.split("=", 1) for p in qs.split("&") if "=" in p)
            iid, t = q.get("id", ""), q.get("t", "q")
            if not iid.isdigit() or t not in ("w", "q", "r"):
                return self._json(400, {"error": "id must be digits, t one of w q r"})
            key = (iid, t)
            if key not in IMG_CACHE:
                req = urllib.request.Request(f"https://images.nypl.org/index.php?id={iid}&t={t}", headers={"User-Agent": "menu-lab-dev-proxy"})
                try:
                    with urllib.request.urlopen(req, timeout=60) as r:
                        IMG_CACHE[key] = (r.headers.get("Content-Type", "image/jpeg"), r.read())
                except urllib.error.HTTPError as e:
                    return self._json(e.code, {"error": f"NYPL returned {e.code}"})
            ctype, body = IMG_CACHE[key]
            self.send_response(200); self._cors(); self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "public, max-age=604800"); self.end_headers(); self.wfile.write(body); return
        self._json(200, {"ok": True, "service": "menu-lab-dev-proxy", "features": ["sage", "img"], "sage_key": bool(KEY)})
    def do_POST(self):
        if not self.path.rstrip("/").endswith("/sage"):
            return self._json(404, {"error": "POST /sage only"})
        n = int(self.headers.get("Content-Length", 0))
        if n > MAX_BODY: return self._json(413, {"error": "Request too large"})
        raw = self.rfile.read(n)
        if not KEY: return self._json(500, {"error": "SAGE_API_KEY not set"})
        try:
            j = json.loads(raw); reqs = j.get("requests")
            assert isinstance(reqs, list) and 1 <= len(reqs) <= 4
            assert all(1 <= len(g.get("questions", [])) <= 8 for g in reqs)
        except Exception:
            return self._json(400, {"error": "Body must be {requests:[1-4 groups of 1-8 questions]}"})
        req = urllib.request.Request(SAGE, data=raw, method="POST",
                                     headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=90) as r: status, body = r.status, r.read()
        except urllib.error.HTTPError as e: status, body = e.code, e.read()
        self._json(status, body)
    def log_message(self, fmt, *a):
        sys.stderr.write(time.strftime("%H:%M:%S ") + (fmt % a) + "\n")

print(f"menu-lab dev proxy on http://localhost:{PORT}  sage key={'set' if KEY else 'MISSING'}", flush=True)
ThreadingHTTPServer(("", PORT), H).serve_forever()
