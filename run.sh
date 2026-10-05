#!/usr/bin/env bash
# Linux / macOS launcher
cd "$(dirname "$0")"
if [ ! -d .venv ]; then python3 -m venv .venv; fi
. .venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
python app.py
