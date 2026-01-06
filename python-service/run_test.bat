@echo off
REM Run test_live_recognition.py using the venv Python
cd /d "%~dp0"
call venv\Scripts\activate.bat
python test_live_recognition.py




