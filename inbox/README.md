# Boîte de réception du site

Perplexity dépose ici les éléments préparés à partir des e-mails `[DEVIS]` envoyés depuis l'appli.
L'appli lit `inbox/index.json` et propose l'import dans l'onglet **Assistant**.

## `index.json`
```json
{"items":[{"id":"2026-09-29-abc123","type":"devis","title":"Devis salle de bain Dupont","date":"2026-09-29","file":"inbox/2026-09-29-abc123.json","note":"3 prix estimés"}]}
```
`type` : `devis` (défaut) · `f` (facture) · `cat` (tarifs) · `plan` (planning) · `info` (message).

## Fichier d'un devis / facture
```json
{"type":"devis","note":"…","client":{"nom":"","adresse":"","cp_ville":"","tel":""},"objet":"",
 "F":[{"d":"Chauffe-eau 200 L","q":1,"p":420}],
 "M":[{"d":"Pose et raccordement","q":3,"p":55}]}
```
`F` = fournitures/matériels, `M` = main-d'œuvre. `p` = prix unitaire HT (nombre).

## Fichier de tarifs (`type: cat`)
```json
{"type":"cat","note":"Raccords laiton — Sider","items":[{"d":"Raccord laiton 15x21 M/F","t":"F","pa":2.10,"mg":35,"ref":"SD-12345","fo":"Sider"}]}
```
`pa` = prix d'achat HT ; `mg` = marge % (défaut 35) ; le prix de vente `p` est calculé par l'appli si absent.

## Fichier de planning (`type: plan`)
```json
{"type":"plan","items":[{"date":"2026-10-03","hs":"08:30","he":"12:00","cn":"M. Dupont","sa":"12 rue X, 54200 Toul","o":"Remplacement chauffe-eau","nt":"Devis DEV-2026-004"}]}
```
