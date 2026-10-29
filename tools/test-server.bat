@echo off
title CamArcade server test
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0test-server.ps1"
pause
