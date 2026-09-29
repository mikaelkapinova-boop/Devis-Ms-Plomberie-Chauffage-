#!/usr/bin/env python3
"""Chiffre / déchiffre un fichier JSON au format lu par l'appli (AES-GCM 256, clé PBKDF2-SHA256 dérivée du mot de passe).

Usage :
  MSVAULT_PASSWORD='…' python3 tools/msvault.py encrypt entree.json sortie.json
  MSVAULT_PASSWORD='…' python3 tools/msvault.py decrypt data/store.json clair.json
Dépendance : pip install cryptography
"""
import base64, json, os, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

KSALT = base64.b64decode("gIRolpAOEHxumriSyVGOpw==")   # doit rester identique à AUTH.ksalt dans js/auth.js
ITER = 150000

def key(password: str) -> bytes:
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=KSALT, iterations=ITER).derive(password.encode())

def encrypt(obj, password: str) -> dict:
    iv = os.urandom(12)
    ct = AESGCM(key(password)).encrypt(iv, json.dumps(obj, ensure_ascii=False).encode(), None)
    return {"enc": 1, "alg": "AES-GCM-256/PBKDF2-SHA256", "iv": base64.b64encode(iv).decode(), "ct": base64.b64encode(ct).decode()}

def decrypt(blob: dict, password: str):
    if not isinstance(blob, dict) or blob.get("enc") != 1:
        return blob
    pt = AESGCM(key(password)).decrypt(base64.b64decode(blob["iv"]), base64.b64decode(blob["ct"]), None)
    return json.loads(pt.decode())

if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] not in ("encrypt", "decrypt"):
        print(__doc__); sys.exit(1)
    pw = os.environ.get("MSVAULT_PASSWORD")
    if not pw:
        print("Définis MSVAULT_PASSWORD"); sys.exit(1)
    with open(sys.argv[2], encoding="utf-8") as f:
        data = json.load(f)
    out = encrypt(data, pw) if sys.argv[1] == "encrypt" else decrypt(data, pw)
    with open(sys.argv[3], "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("OK ->", sys.argv[3])
