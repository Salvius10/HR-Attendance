<#
.SYNOPSIS
  Installs Ganit Attendance on this machine and puts a clickable shortcut on
  the Desktop and in the Start menu.

.DESCRIPTION
  The app ships with everything it needs: the built UI, a small bundled server
  and its own copy of node.exe. Nothing is installed system-wide, no admin
  rights are needed and no Node has to be present - everything goes under the
  current user's AppData.

  A local server is needed (rather than just opening an .html file) because
  sending the attendance emails talks SMTP to Microsoft 365, which a browser
  cannot do on its own. It listens on 127.0.0.1 only, so nothing on the
  network can reach it.

  The shortcut starts that server and opens the app in an Edge app window -
  no address bar, no tabs. Closing the app window stops the server.

  Normally nobody runs this file directly: double-click "Start Here.cmd",
  which clears the internet mark that a zip leaves on these files and then
  calls this script with the execution policy bypassed.

  To remove it again:
      powershell -ExecutionPolicy Bypass -File Setup.ps1 -Uninstall
#>
#Requires -Version 5.1
[CmdletBinding()]
param(
  [string] $AppName = 'Ganit Attendance',
  [switch] $Uninstall,
  [switch] $NoPause   # set by "Start Here.cmd", which holds the window open itself
)

$ErrorActionPreference = 'Stop'

$InstallDir   = Join-Path $env:LOCALAPPDATA 'Ganit\Attendance'
$IconPath     = Join-Path $InstallDir 'app.ico'
$DesktopLnk   = Join-Path ([Environment]::GetFolderPath('Desktop')) "$AppName.lnk"
$StartMenuLnk = Join-Path ([Environment]::GetFolderPath('StartMenu')) "Programs\$AppName.lnk"
$ScriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step($msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  $msg" -ForegroundColor Yellow }

# Nothing here may end without the reader seeing why. A .ps1 started by
# right-click closes the instant it finishes, taking any error with it.
function Wait-BeforeClosing {
  if ($NoPause) { return }
  Write-Host ''
  Read-Host '  Press Enter to close' | Out-Null
}

function Show-Diagnostics {
  Write-Host ''
  Write-Host '  --- details to send back ------------------------------' -ForegroundColor DarkGray
  Write-Host "  Windows        : $([Environment]::OSVersion.Version) $env:PROCESSOR_ARCHITECTURE" -ForegroundColor DarkGray
  Write-Host "  PowerShell     : $($PSVersionTable.PSVersion)" -ForegroundColor DarkGray
  Write-Host "  ExecutionPolicy: $(Get-ExecutionPolicy)" -ForegroundColor DarkGray
  Write-Host "  Running from   : $ScriptDir" -ForegroundColor DarkGray
  Write-Host '  -------------------------------------------------------' -ForegroundColor DarkGray
}

try {
  # -------------------------------------------------------------- uninstall
  if ($Uninstall) {
    Write-Host "`nRemoving $AppName...`n" -ForegroundColor White
    foreach ($lnk in @($DesktopLnk, $StartMenuLnk)) {
      if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-Ok "Removed shortcut: $lnk" }
    }
    if (Test-Path $InstallDir) {
      Remove-Item $InstallDir -Recurse -Force
      Write-Ok "Removed $InstallDir"
    }
    Write-Host "`nDone. $AppName has been removed.`n" -ForegroundColor Green
    Wait-BeforeClosing
    return
  }

  Write-Host "`nInstalling $AppName...`n" -ForegroundColor White

  # ---------------------------------------------------- locate the app files
  # The "app" folder and node.exe sit next to this script in the handed-over
  # folder. When they are missing it is almost always the same mistake:
  # the script was launched from inside the zip, which extracts that one file
  # to a temp folder and leaves the rest behind.
  $sourceApp  = Join-Path $ScriptDir 'app'
  $sourceNode = Join-Path $ScriptDir 'node.exe'
  $entry      = Join-Path $sourceApp 'ganit-attendance.cjs'

  $missing = @()
  if (-not (Test-Path $sourceApp))  { $missing += 'the "app" folder' }
  if (-not (Test-Path $sourceNode)) { $missing += 'node.exe' }
  if ((Test-Path $sourceApp) -and -not (Test-Path $entry)) { $missing += 'app\ganit-attendance.cjs' }

  if ($missing.Count -gt 0) {
    $looksLikeZip = $ScriptDir -like "$env:TEMP*" -or $ScriptDir -like '*\Temp\*' -or $ScriptDir -like '*.zip*'
    Write-Host ''
    Write-Host "  Cannot install: $($missing -join ' and ') " -ForegroundColor Red -NoNewline
    Write-Host "not found next to this script." -ForegroundColor Red
    Write-Host ''
    if ($looksLikeZip) {
      Write-Host '  This looks like it was started from INSIDE the zip file.' -ForegroundColor Yellow
      Write-Host '  Windows only unpacks the one file you double-click.' -ForegroundColor Yellow
      Write-Host ''
    }
    Write-Host '  Do this instead:' -ForegroundColor White
    Write-Host '    1. Right-click the zip file  ->  Extract All...' -ForegroundColor White
    Write-Host '    2. Open the folder it creates.' -ForegroundColor White
    Write-Host '    3. Double-click "Start Here.cmd" in that folder.' -ForegroundColor White
    Show-Diagnostics
    Wait-BeforeClosing
    exit 1
  }

  # 32-bit Windows cannot run the 64-bit node.exe that ships here. ARM64 can,
  # through Windows' built-in x64 emulation, so only x86 is a hard stop.
  if ($env:PROCESSOR_ARCHITECTURE -eq 'x86' -and -not $env:PROCESSOR_ARCHITEW6432) {
    Write-Host ''
    Write-Host '  Cannot install: this is 32-bit Windows, and the bundled' -ForegroundColor Red
    Write-Host '  Node runtime is 64-bit. Ask for a 32-bit build.' -ForegroundColor Red
    Show-Diagnostics
    Wait-BeforeClosing
    exit 1
  }

  $sizeMb = [math]::Round(((Get-ChildItem $ScriptDir -Recurse -File | Measure-Object Length -Sum).Sum) / 1MB, 1)
  Write-Step "Found the app ($sizeMb MB including its own Node runtime)"

  # ----------------------------------------------------------------- install
  # Wipe first: a stale bundle from an older version must not survive an
  # upgrade. The browser profile lives in there and is disposable.
  if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

  Copy-Item $sourceApp (Join-Path $InstallDir 'app') -Recurse -Force
  Copy-Item $sourceNode (Join-Path $InstallDir 'node.exe') -Force

  # A file that came out of a zip is tagged "downloaded from the internet",
  # which makes Windows block node.exe with a SmartScreen prompt. The tag
  # follows the copy, so it has to be cleared here too.
  Get-ChildItem $InstallDir -Recurse -File | Unblock-File -ErrorAction SilentlyContinue
  Write-Ok "Installed to $InstallDir"

  $nodeExe    = Join-Path $InstallDir 'node.exe'
  $entryPoint = Join-Path $InstallDir 'app\ganit-attendance.cjs'

  # Prove the runtime actually executes before building shortcuts around it.
  # This is where antivirus or an IT policy that blocks programs in AppData
  # shows up, and the message needs to say so rather than "it didn't work".
  try {
    $nodeVersion = & $nodeExe -v 2>&1
    if ($LASTEXITCODE -ne 0) { throw "node.exe exited with code $LASTEXITCODE : $nodeVersion" }
    Write-Ok "Node runtime works ($nodeVersion)"
  } catch {
    Write-Host ''
    Write-Host '  Cannot install: the bundled Node runtime would not start.' -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ''
    Write-Host '  This is usually antivirus or a company policy blocking' -ForegroundColor Yellow
    Write-Host '  programs that run from AppData. Show IT this path:' -ForegroundColor Yellow
    Write-Host "    $nodeExe" -ForegroundColor Yellow
    Show-Diagnostics
    Wait-BeforeClosing
    exit 1
  }

  # -------------------------------------------------------------- build icon
  # The app icon is drawn here rather than shipped as a file: a clock face in
  # the app's brand blue, matching the wordmark in the top bar.
  $iconBuilt = $false
  try {
    Add-Type -AssemblyName System.Drawing
    $size   = 256
    $canvas = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($canvas)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([System.Drawing.Color]::Transparent)

    $brand = [System.Drawing.Color]::FromArgb(255, 26, 0, 208)
    $fill  = New-Object System.Drawing.SolidBrush $brand
    $g.FillEllipse($fill, 8, 8, $size - 16, $size - 16)

    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 20
    $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
    $c = $size / 2
    $g.DrawLine($pen, $c, $c, $c, $c - 62)          # hour hand, straight up
    $g.DrawLine($pen, $c, $c, $c + 46, $c + 26)     # minute hand
    $g.Dispose()

    $pngMs = New-Object System.IO.MemoryStream
    $canvas.Save($pngMs, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $pngMs.ToArray()

    # Minimal ICO wrapper around a single PNG frame (supported since Vista):
    # 6-byte header, one 16-byte directory entry, then the PNG payload.
    $icoMs = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($icoMs)
    $bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]1)
    $bw.Write([Byte]0)    # width  0 means 256
    $bw.Write([Byte]0)    # height 0 means 256
    $bw.Write([Byte]0); $bw.Write([Byte]0)
    $bw.Write([UInt16]1); $bw.Write([UInt16]32)
    $bw.Write([UInt32]$pngBytes.Length)
    $bw.Write([UInt32]22)
    $bw.Write($pngBytes)
    $bw.Flush()
    [System.IO.File]::WriteAllBytes($IconPath, $icoMs.ToArray())

    $canvas.Dispose(); $pngMs.Dispose(); $icoMs.Dispose()
    $iconBuilt = $true
    Write-Ok "Created app icon"
  } catch {
    Write-Warn "Could not build the icon ($($_.Exception.Message)) - using the default."
  }

  # --------------------------------------------------------------- shortcuts
  # The shortcut runs node.exe minimised: it is a console program, so a window
  # always appears. That window is the app's off switch, and the launcher
  # closes it automatically when the app window is closed.
  $shell = New-Object -ComObject WScript.Shell

  foreach ($lnkPath in @($DesktopLnk, $StartMenuLnk)) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $lnkPath) | Out-Null
    $lnk = $shell.CreateShortcut($lnkPath)
    $lnk.TargetPath       = $nodeExe
    $lnk.Arguments        = "`"$entryPoint`""
    $lnk.WorkingDirectory = $InstallDir
    $lnk.Description      = 'Attendance dashboard from the swipe report'
    $lnk.WindowStyle      = 7      # start minimised
    if ($iconBuilt) { $lnk.IconLocation = "$IconPath,0" }
    $lnk.Save()
  }
  Write-Ok "Desktop shortcut:    $DesktopLnk"
  Write-Ok "Start menu shortcut: $StartMenuLnk"

  # ------------------------------------------------------------ sanity check
  # Start the server the way the shortcut will, confirm it answers, then stop.
  Write-Step "Checking the app starts..."
  $proc = Start-Process -FilePath $nodeExe -ArgumentList "`"$entryPoint`"", '--no-browser' `
    -WorkingDirectory $InstallDir -WindowStyle Hidden -PassThru
  $responded = $false
  foreach ($i in 1..20) {
    Start-Sleep -Milliseconds 400
    foreach ($port in 7331..7335) {
      try {
        $r = Invoke-WebRequest "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $responded = $true }
      } catch {}
      if ($responded) { break }
    }
    if ($responded -or $proc.HasExited) { break }
  }
  if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }

  if ($responded) {
    Write-Ok "The app starts and answers correctly"
  } else {
    Write-Warn "Could not confirm the app started."
    Write-Warn "The shortcut is installed - try it, and report what the black window says."
  }

  Write-Host "`nDone. Double-click '$AppName' on the Desktop to start.`n" -ForegroundColor Green
  Write-Host "A small black window appears while the app runs - that is normal." -ForegroundColor DarkGray
  Write-Host "Leave it alone; it closes by itself when you close the app.`n" -ForegroundColor DarkGray
  Wait-BeforeClosing
}
catch {
  Write-Host ''
  Write-Host '  Setup failed.' -ForegroundColor Red
  Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
  if ($_.InvocationInfo.ScriptLineNumber) {
    Write-Host "  (line $($_.InvocationInfo.ScriptLineNumber))" -ForegroundColor DarkGray
  }
  Show-Diagnostics
  Wait-BeforeClosing
  exit 1
}
