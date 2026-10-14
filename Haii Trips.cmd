@echo off
setlocal
title Haii Trips

rem One click: starts the server, waits for it, opens a real app window, and cleans up on exit.
rem
rem The window is Chrome in --app mode: no tabs, no address bar, no browser furniture. It runs on
rem its own profile directory so it cannot inherit extensions, pinned tabs or a signed-in account
rem from the normal browser, which is what makes it look like an app rather than a page.

cd /d "%~dp0"

rem Node runs the server. Without it the server window closes at once and shows nothing.
where node >nul 2>&1
if errorlevel 1 goto nonode

set "PORT=4830"
set "URL=http://localhost:%PORT%"
rem The app window's own browser profile. Delete the HaiiTrips folder to remove it.
set "PROFILE=%LOCALAPPDATA%\HaiiTrips\profile"

rem Pick a browser. Chrome first, Edge as the fallback. Both support --app.
set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

rem If a server already answers on the port, reuse it and leave it running on exit, so a second
rem launch does not stop the server the first one is using.
set "OWNSERVER=1"
powershell -NoProfile -Command "try{$c=New-Object Net.Sockets.TcpClient;$c.Connect('127.0.0.1',%PORT%);$c.Close();exit 0}catch{exit 1}" >nul 2>&1
if not errorlevel 1 set "OWNSERVER="

rem Start the server in a minimised window we can find again by title.
if defined OWNSERVER start "haii-trips-server" /min cmd /c "node server.js"

rem Wait for the port rather than guessing with a sleep. A fixed timeout either wastes seconds or
rem opens a window onto a server that is not listening yet, which looks broken.
echo Starting Haii Trips...
set /a TRIES=0
:waitloop
set /a TRIES+=1
powershell -NoProfile -Command "try{$c=New-Object Net.Sockets.TcpClient;$c.Connect('127.0.0.1',%PORT%);$c.Close();exit 0}catch{exit 1}" >nul 2>&1
if not errorlevel 1 goto ready
if %TRIES% GEQ 30 goto failed
timeout /t 1 /nobreak >nul
goto waitloop

:ready
if not defined BROWSER goto nobrowser
rem 440x940 is the phone shape the layout is designed for, plus a little for the window frame.
"%BROWSER%" --app=%URL% --user-data-dir="%PROFILE%" --window-size=440,940 --no-first-run --no-default-browser-check
goto cleanup

:nobrowser
echo No Chrome or Edge found. Opening in your default browser instead.
start "" %URL%
echo.
echo Close this window when you are done.
pause >nul
goto cleanup

:failed
echo.
echo The server did not start within 30 seconds.
echo Open a terminal in this folder and run "node server.js" to see why.
echo.
pause
goto :eof

:nonode
echo Node.js was not found. Install Node 18 or newer from https://nodejs.org and run this again.
echo.
pause
goto :eof

:cleanup
rem The app window has closed, so stop the server this launch started rather than leaving it
rem holding the port.
if defined OWNSERVER taskkill /FI "WINDOWTITLE eq haii-trips-server*" /T /F >nul 2>&1
endlocal
