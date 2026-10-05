@echo off
cd /d "%~dp0"
if not exist .venv (python -m venv .venv)
call .venv\Scripts\activate.bat
python -m pip install -q --upgrade pip
pip install -q -r requirements.txt
python app.py
pause
