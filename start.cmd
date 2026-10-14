@echo off
setlocal
rem One click: start the local server and open Haii Trips in your default browser.
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install Node 18 or newer from https://nodejs.org and run this again.
  pause
  exit /b 1
)
if not defined PORT set "PORT=4830"
start "" http://localhost:%PORT%
node server.js
rem Keep the window open when the server stops with an error, so the reason can be read.
if errorlevel 1 pause
endlocal
