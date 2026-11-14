@echo off
setlocal
cd /d "%~dp0"
if exist "sqlite\sql-wasm.js" if exist "sqlite\sql-wasm.wasm" (
    echo SQLite files already exist. They have not been changed.
    echo The app will try these files first and use the pinned CDN if necessary.
    exit /b 0
)
set "BASE=https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/"
set "TMPDIR=%TEMP%\worklog-sqlite-%RANDOM%-%RANDOM%"
mkdir "%TMPDIR%" || exit /b 1
curl.exe --fail --location --retry 2 --connect-timeout 10 "%BASE%sql-wasm.js" --output "%TMPDIR%\sql-wasm.js"
if errorlevel 1 goto failed
curl.exe --fail --location --retry 2 --connect-timeout 10 "%BASE%sql-wasm.wasm" --output "%TMPDIR%\sql-wasm.wasm"
if errorlevel 1 goto failed
if not exist "sqlite" mkdir "sqlite"
copy /y "%TMPDIR%\sql-wasm.js" "sqlite\sql-wasm.js" >nul
if errorlevel 1 goto failed
copy /y "%TMPDIR%\sql-wasm.wasm" "sqlite\sql-wasm.wasm" >nul
if errorlevel 1 goto failed
rmdir /s /q "%TMPDIR%"
echo Installed sql.js 1.13.0 and its matching WASM file.
echo Start the local server: py -m http.server 8000
exit /b 0
:failed
rmdir /s /q "%TMPDIR%" 2>nul
echo SQLite download failed. Check the network or use the existing working library.
exit /b 1
