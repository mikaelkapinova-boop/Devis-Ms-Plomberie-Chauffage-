#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ms Plomberie & Chauffage – pont local entre l'appli, Perplexity Computer et ChatGPT.

Rôle :
  1. Sert l'application (index.html du dépôt) sur http://127.0.0.1:8765
     et accepte aussi les appels venant du site GitHub Pages (CORS).
  2. Connecte l'application à Perplexity Computer via le serveur MCP officiel
     (https://www.perplexity.ai/rest/computer/mcp) avec OAuth 2.0 + PKCE.
     -> aucune clé API : tu te connectes avec ton compte Perplexity, une seule fois.
  3. Relaie les messages du tchat vers Computer ou l'API Responses officielle de ChatGPT.

Dépendances : Python 3.9+ uniquement (bibliothèque standard, rien à installer).
Lancement   : python serveur.py
"""

import base64
import hashlib
import html
import json
import os
import secrets
import tempfile
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

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
INTERDITS = {"tokens.json", "serveur.py", "lancer.bat"}

MCP_URL = "https://www.perplexity.ai/rest/computer/mcp"
REDIRECT_URI = f"http://{HOTE}:{PORT}/oauth/callback"
NOM_CLIENT = "Ms Plomberie Devis (application locale)"
TIMEOUT_TACHE = 900  # secondes d'attente max pour une réponse de Computer

# Connexion officielle Sign in with ChatGPT (client public, callback boucle locale).
GPT_AUTH = "https://auth.openai.com/api/accounts/authorize"
GPT_TOKEN = "https://auth.openai.com/api/accounts/oauth/token"
GPT_API = "https://api.openai.com/v1"
GPT_RESOURCE = GPT_API
GPT_REDIRECT_URI = f"http://{HOTE}:{PORT}/auth/callback"
GPT_SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"

# ----------------------------------------------------------------------------
# Jetons locaux ignorés par Git ; chaque jeton reste réservé au service qui l'a émis.
# ----------------------------------------------------------------------------
_verrou = threading.Lock()
_gpt_token_lock = threading.Lock()
_gpt_pending_lock = threading.Lock()
_gpt_pending = {}
_gpt_discovery_cache = {}
_gpt_jwks_cache = {"loaded": 0, "keys": []}
_gpt_models_cache = {"loaded": 0, "subject": "", "models": []}


def lire_tokens():
    try:
        with open(FICHIER_TOKENS, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def ecrire_tokens(data):
    """Écriture atomique ; protège les jetons locaux sous Unix."""
    with _verrou:
        fd, chemin = tempfile.mkstemp(prefix=".tokens-", suffix=".tmp", dir=DOSSIER)
        try:
            if os.name != "nt":
                os.fchmod(fd, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            os.replace(chemin, FICHIER_TOKENS)
            if os.name != "nt":
                os.chmod(FICHIER_TOKENS, 0o600)
        finally:
            if os.path.exists(chemin):
                os.remove(chemin)


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
# Sign in with ChatGPT : OAuth public, vérification OIDC et Responses API
# ----------------------------------------------------------------------------
def _gpt_credential():
    return lire_tokens().get("chatgpt") or {}


def _gpt_discovery(force=False):
    now = time.time()
    if not force and _gpt_discovery_cache.get("loaded", 0) > now - 600:
        return _gpt_discovery_cache
    st, _, body = http_json("https://auth.openai.com/.well-known/openid-configuration", timeout=20)
    if st != 200:
        raise RuntimeError("Découverte OAuth ChatGPT indisponible.")
    meta = json.loads(body)
    if meta.get("issuer") != "https://auth.openai.com":
        raise RuntimeError("Émetteur OAuth ChatGPT inattendu.")
    for key in ("authorization_endpoint", "token_endpoint", "jwks_uri"):
        u = urllib.parse.urlparse(meta.get(key, ""))
        if u.scheme != "https" or u.hostname != "auth.openai.com":
            raise RuntimeError("Métadonnées OAuth ChatGPT non fiables.")
    _gpt_discovery_cache.clear()
    _gpt_discovery_cache.update(meta)
    _gpt_discovery_cache["loaded"] = now
    return _gpt_discovery_cache


def _gpt_b64u_decode(value):
    return base64.urlsafe_b64decode((value + "=" * (-len(value) % 4)).encode("ascii"))


def _gpt_jwk(kid, force=False):
    cache = _gpt_jwks_cache
    if force or cache.get("loaded", 0) <= time.time() - 600:
        meta = _gpt_discovery(force=force)
        st, _, body = http_json(meta["jwks_uri"], timeout=20)
        if st != 200:
            raise RuntimeError("Clés de signature ChatGPT indisponibles.")
        data = json.loads(body)
        cache["keys"] = data.get("keys") or []
        cache["loaded"] = time.time()
    key = next((k for k in cache.get("keys", []) if k.get("kid") == kid and
                k.get("kty") == "RSA" and k.get("use", "sig") == "sig" and
                k.get("alg", "RS256") == "RS256"), None)
    if key is None and not force:
        return _gpt_jwk(kid, True)
    if key is None:
        raise RuntimeError("Clé de signature ChatGPT inconnue.")
    return key


def _gpt_verify_id_token(token, client_id, nonce):
    parts = (token or "").split(".")
    if len(parts) != 3 or not all(parts):
        raise RuntimeError("Jeton d'identité ChatGPT invalide.")
    try:
        head = json.loads(_gpt_b64u_decode(parts[0]))
        claims = json.loads(_gpt_b64u_decode(parts[1]))
        signature = _gpt_b64u_decode(parts[2])
    except Exception:
        raise RuntimeError("Jeton d'identité ChatGPT illisible.")
    if head.get("alg") != "RS256" or head.get("crit"):
        raise RuntimeError("Algorithme de signature ChatGPT non pris en charge.")
    key = _gpt_jwk(str(head.get("kid") or ""))
    n = int.from_bytes(_gpt_b64u_decode(key["n"]), "big")
    e = int.from_bytes(_gpt_b64u_decode(key["e"]), "big")
    size = (n.bit_length() + 7) // 8
    if len(signature) != size:
        raise RuntimeError("Signature du jeton d'identité ChatGPT invalide.")
    block = pow(int.from_bytes(signature, "big"), e, n).to_bytes(size, "big")
    digest_info = bytes.fromhex("3031300d060960864801650304020105000420") + hashlib.sha256(
        (parts[0] + "." + parts[1]).encode("ascii")).digest()
    padding = size - len(digest_info) - 3
    expected = b"\x00\x01" + b"\xff" * padding + b"\x00" + digest_info
    if padding < 8 or not secrets.compare_digest(block, expected):
        raise RuntimeError("Signature du jeton d'identité ChatGPT invalide.")
    meta = _gpt_discovery()
    aud = claims.get("aud")
    audiences = aud if isinstance(aud, list) else [aud]
    now = time.time()
    if claims.get("iss") != meta["issuer"] or client_id not in audiences:
        raise RuntimeError("Émetteur ou audience ChatGPT invalide.")
    if len(audiences) > 1 and claims.get("azp") != client_id:
        raise RuntimeError("Audience autorisée ChatGPT invalide.")
    if not isinstance(claims.get("exp"), (int, float)) or claims["exp"] < now - 5:
        raise RuntimeError("Jeton d'identité ChatGPT expiré.")
    if not isinstance(claims.get("iat"), (int, float)) or claims["iat"] > now + 5:
        raise RuntimeError("Date du jeton d'identité ChatGPT invalide.")
    if claims.get("nonce") != nonce or not isinstance(claims.get("sub"), str) or not claims["sub"]:
        raise RuntimeError("Nonce ou identité ChatGPT invalide.")
    return claims


def chatgpt_auth_url():
    meta = _gpt_discovery()
    tk = lire_tokens()
    cred = tk.get("chatgpt") or {}
    host_id = tk.get("chatgpt_host_id")
    if not host_id:
        host_id = "urn:uuid:" + str(uuid.uuid4())
        tk["chatgpt_host_id"] = host_id
        ecrire_tokens(tk)
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).decode().rstrip("=")
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    client_id = cred.get("client_id") or "dynamic_agent_client"
    pending = {"verifier": verifier, "nonce": nonce, "client_id": client_id, "created": time.time()}
    with _gpt_pending_lock:
        for old_state in list(_gpt_pending):
            if _gpt_pending[old_state].get("created", 0) < time.time() - 600:
                _gpt_pending.pop(old_state, None)
        _gpt_pending[state] = pending
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": GPT_REDIRECT_URI,
        "scope": GPT_SCOPES,
        "resource": GPT_RESOURCE,
        "state": state,
        "nonce": nonce,
        "code_challenge_method": "S256",
        "code_challenge": challenge,
        "ext_agent_host_id": host_id,
    }
    if client_id == "dynamic_agent_client":
        params["agent_name_hint"] = "Devis MS Plomberie"
    elif cred.get("id_token"):
        params["id_token_hint"] = cred["id_token"]
    return meta["authorization_endpoint"] + "?" + urllib.parse.urlencode(params)


def chatgpt_callback(code, state, callback_client_id=None, oauth_error=None):
    with _gpt_pending_lock:
        pending = _gpt_pending.pop(state, None)
    if not pending or pending.get("created", 0) < time.time() - 600:
        raise RuntimeError("État OAuth ChatGPT inconnu ou expiré. Relance la connexion.")
    if oauth_error:
        raise RuntimeError("Connexion ChatGPT refusée ou annulée.")
    if not code:
        raise RuntimeError("Code OAuth ChatGPT manquant.")
    old = _gpt_credential()
    saved_id = pending["client_id"]
    if saved_id == "dynamic_agent_client":
        client_id = callback_client_id
        if not client_id or client_id == "dynamic_agent_client":
            raise RuntimeError("Inscription ChatGPT incomplète : identifiant client absent.")
    else:
        if callback_client_id and callback_client_id != saved_id:
            raise RuntimeError("Cette connexion ChatGPT ne correspond pas au compte enregistré.")
        client_id = saved_id
    meta = _gpt_discovery()
    status, _, body = http_json(meta["token_endpoint"], {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": client_id,
        "redirect_uri": GPT_REDIRECT_URI,
        "code_verifier": pending["verifier"],
        "resource": GPT_RESOURCE,
    }, form=True, timeout=30)
    if status != 200:
        raise RuntimeError("Échange OAuth ChatGPT refusé (HTTP %s)." % status)
    rep = json.loads(body)
    token = rep.get("access_token")
    id_token = rep.get("id_token")
    if not token or not id_token:
        raise RuntimeError("La réponse OAuth ChatGPT ne contient pas les jetons requis.")
    scopes = rep.get("scope", "")
    scopes = scopes.split() if isinstance(scopes, str) else list(scopes or [])
    if "chatgpt.tokens.use.direct" not in scopes:
        raise RuntimeError("Le compte n’a pas accordé l’accès ChatGPT pour cette application.")
    claims = _gpt_verify_id_token(id_token, client_id, pending["nonce"])
    if old.get("subject") and old["subject"] != claims["sub"]:
        raise RuntimeError("Le compte ChatGPT sélectionné a changé. Déconnecte l'ancien compte avant d'en choisir un autre.")
    cred = {
        "client_id": client_id,
        "subject": claims["sub"],
        "email": claims.get("email", ""),
        "id_token": id_token,
        "access_token": token,
        "refresh_token": rep.get("refresh_token") or old.get("refresh_token", ""),
        "expires_at": time.time() + int(rep.get("expires_in", 3600)) - 60,
        "scopes": scopes,
        "token_type": rep.get("token_type", "Bearer"),
    }
    tk = lire_tokens()
    tk["chatgpt"] = cred
    ecrire_tokens(tk)
    _gpt_models_cache.update({"loaded": 0, "subject": claims["sub"], "models": []})


def chatgpt_access_token():
    with _gpt_token_lock:
        cred = _gpt_credential()
        if not cred.get("access_token") or "chatgpt.tokens.use.direct" not in cred.get("scopes", []):
            return None
        if cred.get("expires_at", 0) > time.time() + 30:
            return cred["access_token"]
        if not cred.get("refresh_token"):
            return None
        status, _, body = http_json(_gpt_discovery()["token_endpoint"], {
            "grant_type": "refresh_token",
            "refresh_token": cred["refresh_token"],
            "client_id": cred["client_id"],
            "resource": GPT_RESOURCE,
        }, form=True, timeout=30)
        if status != 200:
            return None
        rep = json.loads(body)
        token = rep.get("access_token")
        if not token:
            return None
        scopes = rep.get("scope", cred.get("scopes", []))
        scopes = scopes.split() if isinstance(scopes, str) else list(scopes or [])
        if "chatgpt.tokens.use.direct" not in scopes:
            return None
        cred.update({
            "access_token": token,
            "refresh_token": rep.get("refresh_token") or cred["refresh_token"],
            "expires_at": time.time() + int(rep.get("expires_in", 3600)) - 60,
            "scopes": scopes,
        })
        tk = lire_tokens()
        tk["chatgpt"] = cred
        ecrire_tokens(tk)
        return token


def chatgpt_status():
    token = chatgpt_access_token()
    return {"connecte": bool(token)}


def chatgpt_models():
    token = chatgpt_access_token()
    if not token:
        raise PermissionError("Connecte-toi à ChatGPT sur le PC qui héberge l'application.")
    cred = _gpt_credential()
    cache = _gpt_models_cache
    if cache.get("subject") == cred.get("subject") and cache.get("loaded", 0) > time.time() - 300:
        return cache["models"]
    req = urllib.request.Request(GPT_API + "/models", headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read())
    except urllib.error.HTTPError as error:
        if error.code == 401:
            raise PermissionError("La connexion ChatGPT a expiré. Reconnecte-toi.")
        raise RuntimeError("Liste des modèles ChatGPT indisponible (HTTP %s)." % error.code)
    models = []
    for model in data.get("models", []):
        slug = model.get("slug")
        name = model.get("display_name")
        if model.get("visibility") == "list" and isinstance(slug, str) and slug and isinstance(name, str) and name:
            models.append({"slug": slug, "display_name": name})
    if not models:
        raise RuntimeError("Aucun modèle ChatGPT n'est disponible sur ce compte.")
    cache.update({"loaded": time.time(), "subject": cred.get("subject", ""), "models": models})
    return models


def chatgpt_response(data):
    token = chatgpt_access_token()
    if not token:
        raise PermissionError("Connecte-toi à ChatGPT sur le PC qui héberge l'application.")
    model = data.get("model")
    available = {item["slug"] for item in chatgpt_models()}
    if model not in available:
        raise ValueError("Choisis un modèle disponible dans le menu ChatGPT.")
    messages = data.get("input")
    if not isinstance(messages, list) or not messages:
        raise ValueError("La conversation est vide.")
    for item in messages:
        if not isinstance(item, dict) or item.get("role") not in ("system", "user", "assistant"):
            raise ValueError("Format de conversation invalide.")
    payload = {"model": model, "input": messages, "store": False, "stream": True}
    request = urllib.request.Request(
        GPT_API + "/responses",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
        method="POST")
    chunks = []
    completed = False
    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            for raw in response:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                event_data = line[5:].strip()
                if not event_data or event_data == "[DONE]":
                    continue
                event = json.loads(event_data)
                kind = event.get("type")
                if kind == "response.output_text.delta":
                    chunks.append(event.get("delta", ""))
                elif kind == "response.failed":
                    err = ((event.get("response") or {}).get("error") or {})
                    code = err.get("code", "unknown_error")
                    if code in ("subscription_sharing_usage_limit_exceeded", "subscription_sharing_usage_unavailable"):
                        raise RuntimeError("Limite d’utilisation du forfait ChatGPT atteinte ou indisponible.")
                    raise RuntimeError("La réponse ChatGPT a échoué (%s)." % code)
                elif kind == "response.incomplete":
                    raise RuntimeError("La réponse ChatGPT est incomplète.")
                elif kind == "response.completed":
                    completed = True
                    if not chunks:
                        output = (event.get("response") or {}).get("output") or []
                        for item in output:
                            for part in item.get("content", []):
                                if part.get("type") == "output_text":
                                    chunks.append(part.get("text", ""))
    except urllib.error.HTTPError as error:
        try:
            detail = json.loads(error.read()).get("error", {}).get("code", "http_error")
        except Exception:
            detail = "http_error"
        if error.code == 401:
            raise PermissionError("La connexion ChatGPT a expiré. Reconnecte-toi.")
        if detail in ("subscription_sharing_usage_limit_exceeded", "subscription_sharing_usage_unavailable"):
            raise RuntimeError("Limite d’utilisation du forfait ChatGPT atteinte ou indisponible.")
        raise RuntimeError("Erreur de l’API ChatGPT (HTTP %s, %s)." % (error.code, detail))
    if not completed:
        raise RuntimeError("Le flux ChatGPT s'est interrompu avant la fin.")
    return "".join(chunks)


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
# Serveur HTTP local
# ----------------------------------------------------------------------------
class Gestionnaire(BaseHTTPRequestHandler):
    server_version = "MsPlomberie/1.0"

    def log_message(self, fmt, *args):  # ne jamais journaliser un code OAuth de retour
        message = fmt % args
        if "?" in self.path:
            message = message.replace(self.path, self.path.split("?", 1)[0] + "?[redacted]")
        sys.stdout.write("%s - %s\n" % (time.strftime("%H:%M:%S"), message))

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
        if u.path == "/api/chatgpt/status":
            try:
                return self._json(200, chatgpt_status())
            except Exception:
                return self._json(200, {"connecte": False})
        if u.path == "/api/chatgpt/models":
            try:
                return self._json(200, {"models": chatgpt_models()})
            except PermissionError as e:
                return self._json(401, {"erreur": "non_connecte", "message": str(e)})
            except Exception as e:
                return self._json(502, {"erreur": "chatgpt", "message": str(e)})
        if u.path == "/api/status":
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
        if u.path == "/auth/chatgpt/start":
            try:
                location = chatgpt_auth_url()
            except Exception:
                return self._html(500, "<!doctype html><meta charset='utf-8'><h2>Connexion ChatGPT indisponible</h2><p>Relance le serveur puis réessaie.</p>")
            self.send_response(302)
            self.send_header("Location", location)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        if u.path == "/auth/callback":
            try:
                chatgpt_callback(q.get("code", [""])[0], q.get("state", [""])[0],
                                 q.get("client_id", [None])[0], q.get("error", [None])[0])
            except Exception as e:
                return self._html(400, "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width'><body style='font-family:system-ui;padding:30px'><h2>Connexion ChatGPT non terminée</h2><p>" + html.escape(str(e)) + "</p><p>Ferme cet onglet et réessaie depuis l’application ouverte sur le PC.</p></body>")
            return self._html(200, "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width'><body style='font-family:system-ui;padding:30px'><h2>Connexion à ChatGPT réussie</h2><p>Tu peux fermer cet onglet et revenir à l’application.</p></body>")
        if u.path.startswith("/api/"):
            return self._json(404, {"erreur": "inconnu"})
        return self._statique(u.path)

    # --- POST ---
    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if not self._origine_ok():
            return self._json(403, {"erreur": "origine refusée"})
        try:
            if u.path == "/api/chatgpt/chat":
                n = int(self.headers.get("Content-Length") or 0)
                if n <= 0 or n > 48 * 1024 * 1024:
                    return self._json(413, {"erreur": "taille", "message": "Message trop volumineux (limite 48 Mo)."})
                return self._json(200, {"text": chatgpt_response(self._lire_json())})
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
        except PermissionError as e:
            return self._json(401, {"erreur": "non_connecte", "message": str(e)})
        except ValueError as e:
            return self._json(400, {"erreur": "requete", "message": str(e)})
        except ErreurMCP as e:
            if str(e) == "non_connecte":
                return self._json(401, {"erreur": "non_connecte", "message": "Connecte-toi à Perplexity Computer."})
            return self._json(502, {"erreur": "mcp", "message": str(e)})
        except Exception as e:
            return self._json(500, {"erreur": "interne", "message": f"{type(e).__name__}: {e}"})


def main():
    serveur = ThreadingHTTPServer((HOTE, PORT), Gestionnaire)
    serveur.daemon_threads = True
    url = f"http://{HOTE}:{PORT}/"
    print("=" * 60)
    print(" Ms Plomberie & Chauffage – pont Computer + ChatGPT")
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
