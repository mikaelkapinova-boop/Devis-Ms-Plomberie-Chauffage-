@echo off
cd /d "%~dp0"
echo Pont Computer - Ms Plomberie ^& Chauffage
python serveur.py
if errorlevel 1 py -3 serveur.py
pause
