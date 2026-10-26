@echo off
cd /d "%~dp0"
echo Assistant local Qwen via Ollama - Ms Plomberie ^& Chauffage
set DEVIS_DISABLE_COMPUTER_WORKER=1
python serveur.py
if errorlevel 1 py -3 serveur.py
pause
