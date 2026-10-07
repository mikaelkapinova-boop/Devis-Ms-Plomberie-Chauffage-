#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ms Plomberie & Chauffage – pont local entre l'appli et Perplexity Computer.

Rôle :
  1. Sert l'application (index.html du dépôt) sur http://127.0.0.1:8765
     et accepte aussi les appels venant du site GitHub Pages (CORS).
  2. Connecte l'application à Perplexity Computer via le serveur MCP officiel
     (https://www.perplexity.ai/rest/computer/mcp) avec OAuth 2.0 + PKCE.
     -> aucune clé API : tu te connectes avec ton compte Perplexity, une seule fois.
  3. Relaie les messages du tchat de l'application vers Computer et renvoie les réponses.

Dépendances : Python 3.9+ uniquement (bibliothèque standard, rien à installer).
Lancement   : python serveur.py
"""

import base64
import hashlib
import json
import os
import re
import secrets
import sys
import threading
import concurrent.futures
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Importer les connecteurs si disponibles
try:
    from api.connectors import DocumentExtractor, APIConnector, validate_file, get_file_type, format_file_size
    HAS_CONNECTORS = True
except ImportError:
    HAS_CONNECTORS = False

# ----------------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------------
HOTE = "127.0.0.1"
PORT = 8765
DOSSIER = os.path.dirname(os.path.abspath(__file__))
FICHIER_TOKENS = os.path.join(DOSSIER, "tokens.json")  # ignoré par git (.gitignore)
ORIGINES = {"https://mikaelkapinova-boop.github.io", f"http://{HOTE}:{PORT}", f"http://localhost:{PORT}"}
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".png": "image/png",
         ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8"}
INTERDITS = {"tokens.json", "perplexity_jobs.json", "perplexity_jobs.json.tmp", "serveur.py", "lancer.bat"}

# Configuration pour l'importation de documents
MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 Mo
UPLOAD_FOLDER = os.path.join(DOSSIER, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

MCP_URL = "https://www.perplexity.ai/rest/computer/mcp"
REDIRECT_URI = f"http://{HOTE}:{PORT}/oauth/callback"
NOM_CLIENT = "Ms Plomberie Devis (application locale)"
TIMEOUT_TACHE = 900  # secondes d'attente max pour une réponse de Computer

# ----------------------------------------------------------------------------
# Stockage des jetons (fichier local, jamais envoyé ailleurs qu'à Perplexity)
# ----------------------------------------------------------------------------
_verrou = threading.Lock()


def lire_tokens():
    try:
        with open(FICHIER_TOKENS, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def ecrire_tokens(data):
    with _verrou:
        with open(FICHIER_TOKENS, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)


# ----------------------------------------------------------------------------
# Utilitaires HTTP
# ----------------------------------------------------------------------------
def http_json(url, data=None, headers=None, methode=None, timeout=60, form=False):
    """Requête HTTP ; renvoie (statut, en-têtes, corps bytes)."""
    headers = dict(headers or {})
    corps = None
    if data is not None:
        if form:
            corps = urllib.parse.urlencode(data).encode()
            headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
        else:
            corps = json.dumps(data).encode()
            headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=corps, headers=headers, method=methode or ("POST" if corps else "GET"))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


# ----------------------------------------------------------------------------
# OAuth 2.0 (découverte, enregistrement dynamique, PKCE, rafraîchissement)
# ----------------------------------------------------------------------------
_meta_cache = {}


def metadonnees_oauth():
    """Découverte des points de terminaison OAuth du serveur MCP."""
    if _meta_cache:
        return _meta_cache
    u = urllib.parse.urlparse(MCP_URL)
    base = f"{u.scheme}://{u.netloc}"
    # 1) métadonnées de la ressource protégée -> serveur d'autorisation
    st, _, corps = http_json(f"{base}/.well-known/oauth-protected-resource{u.path}")
    issuer = MCP_URL
    if st == 200:
        try:
            issuer = json.loads(corps)["authorization_servers"][0]
        except Exception:
            pass
    iu = urllib.parse.urlparse(issuer)
    candidats = [
        f"{iu.scheme}://{iu.netloc}/.well-known/oauth-authorization-server{iu.path}",
        f"{iu.scheme}://{iu.netloc}/.well-known/oauth-authorization-server",
        f"{issuer.rstrip('/')}/.well-known/oauth-authorization-server",
    ]
    for c in candidats:
        st, _, corps = http_json(c)
        if st == 200:
            try:
                m = json.loads(corps)
                if "authorization_endpoint" in m:
                    _meta_cache.update(m)
                    return _meta_cache
            except Exception:
                continue
    raise RuntimeError("Impossible de découvrir les points de terminaison OAuth.")


def enregistrer_client(meta):
    """Enregistrement dynamique du client (RFC 7591) – aucun secret nécessaire."""
    tk = lire_tokens()
    if tk.get("client_id"):
        return tk["client_id"]
    st, _, corps = http_json(meta["registration_endpoint"], {
        "client_name": NOM_CLIENT,
        "redirect_uris": [REDIRECT_URI],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
    })
    if st not in (200, 201):
        raise RuntimeError(f"Enregistrement OAuth refusé ({st}) : {corps[:300]!r}")
    cid = json.loads(corps)["client_id"]
    tk["client_id"] = cid
    ecrire_tokens(tk)
    return cid


_pkce = {}  # state -> code_verifier


def url_autorisation():
    meta = metadonnees_oauth()
    cid = enregistrer_client(meta)
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).decode().rstrip("=")
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    state = secrets.token_urlsafe(24)
    _pkce[state] = verifier
    params = {
        "response_type": "code",
        "client_id": cid,
        "redirect_uri": REDIRECT_URI,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": state,
        "scope": " ".join(meta.get("scopes_supported", []) or []),
        "resource": MCP_URL,
    }
    return meta["authorization_endpoint"] + "?" + urllib.parse.urlencode(params)


def echanger_code(code, state):
    meta = metadonnees_oauth()
    verifier = _pkce.pop(state, None)
    if not verifier:
        raise RuntimeError("État OAuth inconnu (relance la connexion).")
    tk = lire_tokens()
    st, _, corps = http_json(meta["token_endpoint"], {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "client_id": tk["client_id"],
        "code_verifier": verifier,
        "resource": MCP_URL,
    }, form=True)
    if st != 200:
        raise RuntimeError(f"Échange du code refusé ({st}) : {corps[:300]!r}")
    _enregistrer_reponse_token(json.loads(corps))


def _enregistrer_reponse_token(rep):
    tk = lire_tokens()
    tk["access_token"] = rep["access_token"]
    if rep.get("refresh_token"):
        tk["refresh_token"] = rep["refresh_token"]
    tk["expires_at"] = time.time() + int(rep.get("expires_in", 3600)) - 60
    tk.pop("mcp_session", None)
    ecrire_tokens(tk)


def rafraichir():
    tk = lire_tokens()
    if not tk.get("refresh_token"):
        return False
    meta = metadonnees_oauth()
    st, _, corps = http_json(meta["token_endpoint"], {
        "grant_type": "refresh_token",
        "refresh_token": tk["refresh_token"],
        "client_id": tk["client_id"],
        "resource": MCP_URL,
    }, form=True)
    if st != 200:
        return False
    _enregistrer_reponse_token(json.loads(corps))
    return True


def jeton_valide():
    tk = lire_tokens()
    if not tk.get("access_token"):
        return None
    if time.time() > tk.get("expires_at", 0):
        if not rafraichir():
            return None
        tk = lire_tokens()
    return tk["access_token"]


# ----------------------------------------------------------------------------
# Client MCP (Streamable HTTP, JSON-RPC 2.0)
# ----------------------------------------------------------------------------
class ErreurMCP(Exception):
    pass


def _parser_reponse_mcp(headers, corps, id_attendu):
    """Gère JSON simple ou flux SSE ; renvoie le résultat JSON-RPC."""
    ctype = (headers.get("Content-Type") or headers.get("content-type") or "").lower()
    texte = corps.decode("utf-8", "replace")
    messages = []
    if "text/event-stream" in ctype:
        for bloc in texte.split("\n\n"):
            data = "\n".join(l[5:].strip() for l in bloc.splitlines() if l.startswith("data:"))
            if data:
                try:
                    messages.append(json.loads(data))
                except Exception:
                    pass
    else:
        if texte.strip():
            try:
                m = json.loads(texte)
                messages = m if isinstance(m, list) else [m]
            except Exception:
                raise ErreurMCP(f"Réponse MCP illisible : {texte[:300]}")
    for m in messages:
        if isinstance(m, dict) and m.get("id") == id_attendu:
            if "error" in m:
                raise ErreurMCP(m["error"].get("message", str(m["error"])))
            return m.get("result")
    raise ErreurMCP("Aucune réponse JSON-RPC correspondante (délai dépassé côté serveur ?).")


def _envoyer_mcp(methode, params, timeout, session=None, notification=False):
    token = jeton_valide()
    if not token:
        raise ErreurMCP("non_connecte")
    rid = None if notification else str(uuid.uuid4())
    msg = {"jsonrpc": "2.0", "method": methode, "params": params}
    if rid:
        msg["id"] = rid
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
    }
    if session:
        headers["Mcp-Session-Id"] = session
    st, h, corps = http_json(MCP_URL, msg, headers, timeout=timeout)
    if st == 401:
        # jeton expiré ou révoqué -> on tente un rafraîchissement puis on rejoue
        if rafraichir():
            headers["Authorization"] = f"Bearer {jeton_valide()}"
            st, h, corps = http_json(MCP_URL, msg, headers, timeout=timeout)
        if st == 401:
            tk = lire_tokens()
            for k in ("access_token", "refresh_token", "expires_at", "mcp_session"):
                tk.pop(k, None)
            ecrire_tokens(tk)
            raise ErreurMCP("non_connecte")
    if st == 404 and session:
        raise ErreurMCP("session_perdue")
    if st >= 400:
        raise ErreurMCP(f"Erreur MCP {st} : {corps[:300].decode('utf-8', 'replace')}")
    if notification:
        return None
    return _parser_reponse_mcp(h, corps, rid), h


def session_mcp(forcer=False):
    tk = lire_tokens()
    if tk.get("mcp_session") and not forcer:
        return tk["mcp_session"]
    res, h = _envoyer_mcp("initialize", {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": NOM_CLIENT, "version": "1.0"},
    }, timeout=60)
    session = h.get("Mcp-Session-Id") or h.get("mcp-session-id")
    try:
        _envoyer_mcp("notifications/initialized", {}, timeout=30, session=session, notification=True)
    except Exception:
        pass
    tk = lire_tokens()
    tk["mcp_session"] = session
    ecrire_tokens(tk)
    return session


def appeler_outil(nom, arguments, timeout=TIMEOUT_TACHE):
    """Appelle un outil MCP et renvoie le JSON renvoyé par Computer."""
    for tentative in (1, 2):
        session = session_mcp(forcer=(tentative == 2))
        try:
            res, _ = _envoyer_mcp("tools/call", {"name": nom, "arguments": arguments}, timeout=timeout, session=session)
            break
        except ErreurMCP as e:
            if str(e) == "session_perdue" and tentative == 1:
                continue
            raise
    # Le résultat contient content[] (texte) et souvent structuredContent
    if res is None:
        raise ErreurMCP("Réponse vide.")
    if res.get("structuredContent"):
        return res["structuredContent"]
    for c in res.get("content", []):
        if c.get("type") == "text":
            try:
                return json.loads(c["text"])
            except Exception:
                return {"event": "complete", "text": c["text"]}
    if res.get("isError"):
        raise ErreurMCP(json.dumps(res)[:500])
    return res


def televerser_fichier(nom_fichier, mime, octets):
    """Crée une enveloppe S3 via MCP puis envoie le fichier ; renvoie l'URL de pièce jointe."""
    env = appeler_outil("create_attachment_upload", {
        "filename": nom_fichier, "mime_type": mime or "application/octet-stream", "size_bytes": len(octets)
    }, timeout=120)
    if "upload_url" not in env:
        raise ErreurMCP("Enveloppe d'envoi invalide : " + json.dumps(env)[:300])
    frontiere = "----MsPlomberie" + uuid.uuid4().hex
    parties = []
    for k, v in (env.get("upload_fields") or {}).items():
        parties.append(f"--{frontiere}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    parties.append((f"--{frontiere}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{nom_fichier}\"\r\n"
                    f"Content-Type: {mime or 'application/octet-stream'}\r\n\r\n").encode())
    parties.append(octets)
    parties.append(f"\r\n--{frontiere}--\r\n".encode())
    corps = b"".join(parties)
    req = urllib.request.Request(env["upload_url"], data=corps, method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={frontiere}"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            if r.status not in (200, 201, 204):
                raise ErreurMCP(f"Envoi S3 refusé ({r.status})")
    except urllib.error.HTTPError as e:
        raise ErreurMCP(f"Envoi S3 refusé ({e.code}) : {e.read()[:200]!r}")
    return env["attachment_url"]


# ----------------------------------------------------------------------------
# Perplexity API directe (clé locale + file d'attente persistante)
# ----------------------------------------------------------------------------
FICHIER_JOBS = os.path.join(DOSSIER, "perplexity_jobs.json")
PYRAMID_MAX_WORKERS = max(1, min(int(os.environ.get("MS_PYRAMID_WORKERS", "24")), 64))
JOB_LOCK = threading.Lock()

def api_key():
    """Retourne la clé API Perplexity conservée localement, jamais dans Git."""
    return str(lire_tokens().get("perplexity_api_key") or "").strip()

def lire_jobs():
    try:
        with open(FICHIER_JOBS, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []

def ecrire_jobs(data):
    tmp = FICHIER_JOBS + ".tmp"
    with JOB_LOCK:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, FICHIER_JOBS)

def mettre_job(job):
    jobs = lire_jobs()
    jobs.append(job)
    ecrire_jobs(jobs[-100:])

def trouver_job(job_id):
    return next((j for j in lire_jobs() if j.get("id") == job_id), None)

def maj_job(job_id, **changes):
    jobs = lire_jobs()
    for j in jobs:
        if j.get("id") == job_id:
            j.update(changes)
            break
    ecrire_jobs(jobs)

def _perplexity_model(requested, reasoning=None):
    # Les identifiants provider/model historiques de l'application ne sont
    # pas tous des identifiants API Perplexity. Sonar sert de repli sûr.
    valid = {"sonar", "sonar-pro", "sonar-reasoning", "sonar-reasoning-pro", "sonar-deep-research"}
    req = str(requested or "")
    if req in valid:
        return req
    if reasoning == "high":
        return "sonar-deep-research"
    if reasoning == "medium":
        return "sonar-reasoning-pro"
    return "sonar-pro"

def _perplexity_call(body):
    key = api_key()
    if not key:
        return {"_err": 1, "_st": 401, "_msg": "Clé API Perplexity absente. Enregistre-la dans Assistant → IA → Perplexity."}

    requested = body.get("model")
    model = _perplexity_model(requested, (body.get("reasoning") or {}).get("effort"))
    instructions = body.get("instructions") or ""
    raw_input = body.get("input") or ""
    messages = []
    if instructions:
        messages.append({"role": "system", "content": instructions})

    if isinstance(raw_input, list):
        for item in raw_input:
            if not isinstance(item, dict):
                continue
            role = item.get("role", "user")
            content = item.get("content", "")
            if isinstance(content, list):
                # Convertit le format Responses de l'application vers Chat Completions.
                parts = []
                for p in content:
                    if not isinstance(p, dict):
                        continue
                    if p.get("type") in ("input_text", "text"):
                        parts.append({"type": "text", "text": str(p.get("text", ""))})
                    elif p.get("type") == "input_image" and p.get("image_url"):
                        parts.append({"type": "image_url", "image_url": {"url": p["image_url"]}})
                content = parts or ""
            messages.append({"role": role, "content": content})
    elif raw_input:
        messages.append({"role": "user", "content": str(raw_input)})

    payload = {
        "model": model,
        "messages": messages or [{"role": "user", "content": "Réponds à la demande."}],
        "max_tokens": int(body.get("max_output_tokens") or 4000),
    }
    # Sonar est le moteur de recherche de Perplexity : active la recherche
    # quand le corps original demandait des outils web.
    if any(isinstance(x, dict) and x.get("type") == "web_search" for x in (body.get("tools") or [])):
        payload["web_search_options"] = {"search_context_size": "high"}

    try:
        status, headers, raw = http_json(
            "https://api.perplexity.ai/chat/completions",
            payload,
            {"Authorization": "Bearer " + key, "Content-Type": "application/json"},
            timeout=300,
        )
        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            data = {"error": {"message": raw.decode("utf-8", "replace")[:1000]}}
        if status < 200 or status >= 300:
            err = data.get("error") if isinstance(data, dict) else {}
            return {"_err": 1, "_st": status, "_msg": (err.get("message") if isinstance(err, dict) else None) or "Erreur API Perplexity"}
        text = (((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "")
        return {"output_text": text, "model": model, "usage": data.get("usage"), "citations": data.get("citations", [])}
    except Exception as e:
        return {"_err": 1, "_st": 502, "_msg": str(e)}

_PYRAMID_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=PYRAMID_MAX_WORKERS, thread_name_prefix="pplx-soldier")

def _job_execute(job):
    maj_job(job["id"], status="running", started_at=time.time())
    result = _perplexity_call(job.get("body") or {})
    if result.get("_err"):
        maj_job(job["id"], status="failed", finished_at=time.time(), error=result.get("_msg"), error_status=result.get("_st"))
    else:
        maj_job(job["id"], status="completed", finished_at=time.time(), result=result)

def job_worker():
    futures = set()
    while True:
        try:
            for f in list(futures):
                if f.done():
                    futures.discard(f)
                    try: f.result()
                    except Exception: pass
            capacity = max(0, PYRAMID_MAX_WORKERS - len(futures))
            if capacity:
                jobs = lire_jobs()
                queued = [j for j in jobs if j.get("status") == "queued"][:capacity]
                for job in queued:
                    # Marquage immédiat pour éviter qu'un autre cycle ne double la tâche.
                    maj_job(job["id"], status="dispatching", dispatched_at=time.time())
                    futures.add(_PYRAMID_EXECUTOR.submit(_job_execute, job))
            time.sleep(0.15 if futures else 0.5)
        except Exception:
            time.sleep(1)

# ----------------------------------------------------------------------------
# Serveur HTTP local
# ----------------------------------------------------------------------------
class Gestionnaire(BaseHTTPRequestHandler):
    server_version = "MsPlomberie/1.0"

    def log_message(self, fmt, *args):  # journal compact
        sys.stdout.write("%s - %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    # --- helpers ---
    def _cors(self):
        o = self.headers.get("Origin")
        if o in ORIGINES:
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Filename, X-Mime")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _origine_ok(self):
        o = self.headers.get("Origin")
        return o is None or o in ORIGINES

    def _statique(self, chemin):
        rel = urllib.parse.unquote(chemin).lstrip("/") or "index.html"
        if rel.endswith("/"):
            rel += "index.html"
        cible = os.path.realpath(os.path.join(DOSSIER, rel))
        if not cible.startswith(DOSSIER + os.sep) or os.path.basename(cible) in INTERDITS or "/.git" in cible.replace(os.sep, "/"):
            return self._json(404, {"erreur": "inconnu"})
        if not os.path.isfile(cible):
            return self._json(404, {"erreur": "inconnu"})
        with open(cible, "rb") as f:
            corps = f.read()
        self.send_response(200)
        self.send_header("Content-Type", TYPES.get(os.path.splitext(cible)[1].lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(corps)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(corps)

    def _json(self, code, data):
        corps = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corps)

    def _html(self, code, texte):
        corps = texte.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corps)

    def _lire_corps(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def _lire_json(self):
        try:
            return json.loads(self._lire_corps().decode("utf-8") or "{}")
        except Exception:
            return {}

    # --- GET ---
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        if u.path == "/api/status":
            tk = lire_tokens()
            jobs = lire_jobs()
            return self._json(200, {"connecte": bool(jeton_valide()), "api_configuree": bool(api_key()),
                                    "client_id": tk.get("client_id"), "mcp_url": MCP_URL,
                                    "jobs": {"queued": sum(j.get("status") == "queued" for j in jobs),
                                             "running": sum(j.get("status") == "running" for j in jobs)}})
        if u.path.startswith("/api/jobs/"):
            job = trouver_job(u.path.rsplit("/", 1)[-1])
            if not job:
                return self._json(404, {"erreur": "job_introuvable"})
            safe = dict(job)
            safe.pop("body", None)
            if safe.get("status") == "completed":
                safe["result"] = job.get("result")
            return self._json(200, safe)
            tk = lire_tokens()
            return self._json(200, {"connecte": bool(jeton_valide()), "client_id": tk.get("client_id"),
                                    "mcp_url": MCP_URL})
        if u.path == "/oauth/start":
            try:
                url = url_autorisation()
            except Exception as e:
                return self._html(500, f"<h1>Erreur OAuth</h1><pre>{e}</pre>")
            self.send_response(302)
            self.send_header("Location", url)
            self.end_headers()
            return
        if u.path == "/oauth/callback":
            if "error" in q:
                return self._html(400, f"<h1>Connexion refusée</h1><p>{q.get('error_description', q['error'])[0]}</p>"
                                       f"<p><a href='/'>Retour à l'application</a></p>")
            try:
                echanger_code(q["code"][0], q.get("state", [""])[0])
            except Exception as e:
                return self._html(500, f"<h1>Erreur OAuth</h1><pre>{e}</pre><p><a href='/'>Retour</a></p>")
            return self._html(200, "<!doctype html><meta charset='utf-8'><body style='font-family:system-ui;padding:30px'>"
                                   "<h2>Connexion à Perplexity Computer réussie</h2>"
                                   "<p>Tu peux fermer cet onglet et revenir à l'application.</p>"
                                   "</body>")
        if u.path.startswith("/api/"):
            return self._json(404, {"erreur": "inconnu"})
        
        # Servir la page d'importation
        if u.path == "/import.html" or u.path == "/import":
            return self._statique("/import.html")
        
        return self._statique(u.path)

    # --- POST ---
    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if not self._origine_ok():
            return self._json(403, {"erreur": "origine refusée"})
        try:
            if u.path == "/api/config":
                d = self._lire_json()
                key = str(d.get("api_key") or "").strip()
                if key:
                    tk = lire_tokens()
                    tk["perplexity_api_key"] = key
                    ecrire_tokens(tk)
                return self._json(200, {"ok": True, "api_configuree": bool(api_key())})
            
            # ===== API d'importation de documents =====
            if u.path == "/api/upload-document":
                return self._handle_document_upload()
            if u.path == "/api/extract-document":
                return self._handle_document_extraction()
            if u.path == "/api/import/status":
                return self._json(200, {"ok": True, "import_enabled": HAS_CONNECTORS})
            if u.path == "/api/clients/check":
                return self._handle_client_check()
            if u.path == "/api/items/check":
                return self._handle_item_check()
            if u.path == "/api/transfer-data":
                return self._handle_data_transfer()
            
            if u.path == "/api/jobs":
                d = self._lire_json()
                body = d.get("body")
                if not isinstance(body, dict):
                    return self._json(400, {"erreur": "body_invalide"})
                if not api_key():
                    return self._json(401, {"erreur": "api_key_absente"})
                job = {"id": uuid.uuid4().hex, "status": "queued", "created_at": time.time(),
                       "thread_id": d.get("thread_id") or "", "body": body}
                mettre_job(job)
                return self._json(202, {"id": job["id"], "status": "queued"})
            if u.path == "/api/chat":
                d = self._lire_json()
                args = {"message": d.get("message", "")}
                if d.get("thread_id"):
                    args["thread_id"] = d["thread_id"]
                if d.get("attachment_urls"):
                    args["attachment_urls"] = d["attachment_urls"]
                return self._json(200, appeler_outil("call_perplexity_computer", args))
            if u.path == "/api/answer":
                d = self._lire_json()
                return self._json(200, appeler_outil("answer_question", {
                    "thread_id": d["thread_id"], "answers": d.get("answers") or {"reponse": d.get("texte", "")}}))
            if u.path == "/api/approve":
                d = self._lire_json()
                return self._json(200, appeler_outil("confirm_action_approve", {
                    "thread_id": d["thread_id"], "result": d.get("texte") or "Approuvé depuis l'application"}))
            if u.path == "/api/deny":
                d = self._lire_json()
                return self._json(200, appeler_outil("confirm_action_deny", {
                    "thread_id": d["thread_id"], "result": d.get("texte") or "Refusé depuis l'application"}))
            if u.path == "/api/connected":
                d = self._lire_json()
                return self._json(200, appeler_outil("notify_connected", {
                    "thread_id": d["thread_id"], "message": d.get("texte") or "Service connecté"}))
            if u.path == "/api/upload":
                nom = urllib.parse.unquote(self.headers.get("X-Filename") or "fichier")
                mime = self.headers.get("X-Mime") or self.headers.get("Content-Type") or "application/octet-stream"
                octets = self._lire_corps()
                if len(octets) > 200 * 1024 * 1024:
                    return self._json(413, {"erreur": "Fichier > 200 Mo"})
                return self._json(200, {"attachment_url": televerser_fichier(nom, mime, octets), "nom": nom})
            if u.path == "/api/logout":
                tk = lire_tokens()
                for k in ("access_token", "refresh_token", "expires_at", "mcp_session"):
                    tk.pop(k, None)
                ecrire_tokens(tk)
                return self._json(200, {"ok": True})
            return self._json(404, {"erreur": "inconnu"})
        except ErreurMCP as e:
            if str(e) == "non_connecte":
                return self._json(401, {"erreur": "non_connecte", "message": "Connecte-toi à Perplexity Computer."})
            return self._json(502, {"erreur": "mcp", "message": str(e)})
        except Exception as e:
            return self._json(500, {"erreur": "interne", "message": f"{type(e).__name__}: {e}"})

    # ===== Méthodes pour l'importation de documents =====
    
    def _handle_document_upload(self):
        """Gère l'upload de documents pour extraction"""
        if not HAS_CONNECTORS:
            return self._json(503, {"erreur": "service_indisponible", "message": "Le service d'importation n'est pas disponible"})
        
        # Vérifier la taille du fichier
        content_length = int(self.headers.get("Content-Length") or 0)
        if content_length > MAX_UPLOAD_SIZE:
            return self._json(413, {"erreur": "fichier_trop_gros", "message": f"Fichier trop volumineux (max {MAX_UPLOAD_SIZE // (1024*1024)} Mo)"})
        
        # Lire les données du fichier
        file_data = self._lire_corps()
        if not file_data or len(file_data) === 0:
            return self._json(400, {"erreur": "fichier_vide", "message": "Aucun fichier reçu"})
        
        # Générer un nom de fichier unique
        filename = self.headers.get("X-Filename") or f"upload_{uuid.uuid4().hex}"
        file_ext = os.path.splitext(filename)[1].lower()
        
        # Valider le type de fichier
        if file_ext not in [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"]:
            return self._json(400, {"erreur": "type_invalide", "message": "Type de fichier non supporté"})
        
        # Sauvegarder le fichier temporairement
        temp_filepath = os.path.join(UPLOAD_FOLDER, f"{uuid.uuid4().hex}{file_ext}")
        try:
            with open(temp_filepath, "wb") as f:
                f.write(file_data)
            
            # Valider le fichier
            is_valid, error_msg = validate_file(temp_filepath)
            if not is_valid:
                os.remove(temp_filepath)
                return self._json(400, {"erreur": "fichier_invalide", "message": error_msg})
            
            # Extraire les données
            extractor = DocumentExtractor()
            file_type = get_file_type(filename)
            
            if file_type == "pdf":
                result = extractor.extract_from_pdf(temp_filepath)
            elif file_type in ["image/jpeg", "image/png"]:
                result = extractor.extract_from_image(temp_filepath)
            elif file_type == "document/docx":
                result = extractor.extract_from_docx(temp_filepath)
            else:
                result = extractor.extract_from_text(file_data.decode('utf-8', 'replace'), filename)
            
            # Nettoyer
            os.remove(temp_filepath)
            
            if not result.success:
                return self._json(500, {"erreur": "extraction_echouee", "message": result.errors[0] if result.errors else "Erreur d'extraction"})
            
            # Convertir le résultat en format JSON
            response_data = self._extraction_result_to_dict(result)
            return self._json(200, response_data)
            
        except Exception as e:
            # Nettoyer en cas d'erreur
            if os.path.exists(temp_filepath):
                os.remove(temp_filepath)
            return self._json(500, {"erreur": "extraction_erreur", "message": str(e)})
    
    def _handle_document_extraction(self):
        """Gère l'extraction de données depuis un document existant"""
        if not HAS_CONNECTORS:
            return self._json(503, {"erreur": "service_indisponible", "message": "Le service d'importation n'est pas disponible"})
        
        d = self._lire_json()
        text = d.get("text")
        source = d.get("source", "api")
        
        if not text:
            return self._json(400, {"erreur": "texte_manquant", "message": "Aucun texte à analyser"})
        
        try:
            extractor = DocumentExtractor()
            result = extractor.extract_from_text(text, source)
            
            if not result.success:
                return self._json(500, {"erreur": "extraction_echouee", "message": result.errors[0] if result.errors else "Erreur d'extraction"})
            
            response_data = self._extraction_result_to_dict(result)
            return self._json(200, response_data)
            
        except Exception as e:
            return self._json(500, {"erreur": "extraction_erreur", "message": str(e)})
    
    def _handle_client_check(self):
        """Vérifie si un client existe déjà"""
        d = self._lire_json()
        client_name = d.get("name")
        
        if not client_name:
            return self._json(400, {"erreur": "nom_manquant", "message": "Le nom du client est requis"})
        
        # Dans une vraie implémentation, on vérifierait dans la base de données
        # Pour l'instant, on retourne une réponse par défaut
        return self._json(200, {
            "exists": False,
            "name": client_name,
            "suggestions": []
        })
    
    def _handle_item_check(self):
        """Vérifie si un item existe déjà"""
        d = self._lire_json()
        item_name = d.get("name")
        item_type = d.get("type", "service")
        
        if not item_name:
            return self._json(400, {"erreur": "nom_manquant", "message": "Le nom de l'item est requis"})
        
        # Dans une vraie implémentation, on vérifierait dans la base de données
        return self._json(200, {
            "exists": False,
            "name": item_name,
            "type": item_type,
            "suggestions": []
        })
    
    def _handle_data_transfer(self):
        """Gère le transfert des données extraites vers la base de données"""
        d = self._lire_json()
        
        # Validation des données
        if not d.get("data"):
            return self._json(400, {"erreur": "donnees_manquantes", "message": "Aucune donnée à transférer"})
        
        # Dans une vraie implémentation, on sauvegarderait les données
        # Pour l'instant, on retourne une confirmation
        return self._json(200, {
            "ok": True,
            "message": "Données transférées avec succès",
            "transferred": {
                "client": d.get("transfer_client", True),
                "addresses": d.get("transfer_addresses", True),
                "items": d.get("transfer_items", True),
                "document": d.get("transfer_document", True)
            }
        })
    
    def _extraction_result_to_dict(self, result):
        """Convertit un résultat d'extraction en dictionnaire JSON"""
        doc = result.document
        
        return {
            "success": result.success,
            "warnings": result.warnings,
            "errors": result.errors,
            "processing_time": result.processing_time,
            "document": {
                "type": doc.document_type,
                "number": doc.document_number,
                "date": doc.date,
                "source": doc.source,
                "currency": doc.currency,
                "total": doc.total,
                "tax": doc.tax,
                "notes": doc.notes,
                "client": {
                    "name": doc.client.name,
                    "company": doc.client.company,
                    "siret": doc.client.siret,
                    "tva": doc.client.tva,
                    "email": doc.client.email,
                    "phone": doc.client.phone
                },
                "addresses": [
                    {
                        "street": addr.street,
                        "postal_code": addr.postal_code,
                        "city": addr.city,
                        "country": addr.country,
                        "type": addr.address_type,
                        "full_address": addr.full_address
                    }
                    for addr in doc.addresses
                ],
                "items": [
                    {
                        "name": item.name,
                        "description": item.description,
                        "type": item.item_type,
                        "quantity": item.quantity,
                        "unit": item.unit,
                        "unit_price": item.unit_price,
                        "total": item.total,
                        "category": item.category
                    }
                    for item in doc.items
                ]
            }
        }


_worker = threading.Thread(target=job_worker, name="perplexity-worker", daemon=True)

def main():
    global _worker
    serveur = ThreadingHTTPServer((HOTE, PORT), Gestionnaire)
    if not _worker.is_alive():
        _worker.start()
    serveur.daemon_threads = True
    url = f"http://{HOTE}:{PORT}/"
    print("=" * 60)
    print(" Ms Plomberie & Chauffage – pont Computer")
    print(f" Ouverte sur {url}")
    print(" Utilisable aussi depuis le site GitHub Pages (onglet Assistant)")
    print(" Arrêt : Ctrl+C")
    print("=" * 60)
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt.")


if __name__ == "__main__":
    main()
