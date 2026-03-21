@echo off
echo.
echo   Takeout Viewer - Setup
echo   -------------------------------------

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo   Node.js is not installed.
    echo   Download it from: https://nodejs.org
    echo   Install v18 or newer, then re-run this script.
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node -e "process.stdout.write(process.versions.node)"') do set NODE_VER=%%v
echo   Node.js %NODE_VER% found

:: Install dependencies
echo.
echo   Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo   npm install failed. Check the error above.
    pause
    exit /b 1
)

:: Start
echo.
echo   -------------------------------------
echo   Open http://localhost:3000 in your browser
echo   (Press Ctrl+C to stop the server)
echo   -------------------------------------
echo.
npm start
