@echo off
title CamArcade browser test
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0test-browsers.ps1"
pause
