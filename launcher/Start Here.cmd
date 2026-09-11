@echo off
rem  Double-clickable entry point for the install.
rem
rem  Setup.ps1 cannot be the front door. A .ps1 that arrives by email or Teams
rem  is refused by PowerShell's execution policy, and right-clicking it closes
rem  the window before the error can be read. A .cmd has neither problem: it
rem  runs whatever the policy is, and it can hold the window open.
setlocal
cd /d "%~dp0"

echo.
echo   Installing Ganit Attendance...
echo.

rem Files extracted from a zip are marked as "from the internet", which is what
rem makes PowerShell refuse the script. Clear that on everything in the folder.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%~dp0.' -Recurse -File | Unblock-File -ErrorAction SilentlyContinue" 2>nul

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup.ps1" -NoPause
set RC=%ERRORLEVEL%

echo.
if not "%RC%"=="0" (
  echo   Setup did not finish. The message above says why.
  echo   Send a photo of this window if it is not clear.
  echo.
)
pause
