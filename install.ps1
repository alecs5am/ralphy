# ralphy installer for Windows (PowerShell).
#
# Installs the prebuilt ralphy.exe to %LOCALAPPDATA%\Programs\ralphy and
# appends that directory to the user PATH so new shells see it.
#
# Usage:
#   irm https://raw.githubusercontent.com/alecs5am/ralphy/main/install.ps1 | iex
#
# Override defaults via env:
#   $env:RALPHY_REPO = "<user>/<repo>"        repo override
#   $env:RALPHY_VERSION = "v1.2.3"            install a specific tag
#   $env:RALPHY_BIN_DIR = "C:\path\to\dir"    install directory
#   $env:RALPHY_NO_PATH = "1"                 skip PATH update

#Requires -Version 5.1

$ErrorActionPreference = "Stop"

# --- config ------------------------------------------------------------------
$Repo    = if ($env:RALPHY_REPO)    { $env:RALPHY_REPO }    else { "alecs5am/ralphy" }
$Version = if ($env:RALPHY_VERSION) { $env:RALPHY_VERSION } else { "latest" }
$BinDir  = if ($env:RALPHY_BIN_DIR) { $env:RALPHY_BIN_DIR } else { Join-Path $env:LOCALAPPDATA "Programs\ralphy" }
$BinName = "ralphy.exe"
$DestPath = Join-Path $BinDir $BinName

# --- detect arch -------------------------------------------------------------
# Windows ARM64 currently runs x64 binaries via emulation; ship x64 to cover
# both. If we add an arm64 build later, flip the asset name accordingly.
$Arch = "x64"
$Asset = "ralphy-windows-$Arch.exe"

# --- detect prior install ----------------------------------------------------
$PrevVersion = $null
if (Test-Path $DestPath) {
  try {
    $PrevVersion = (& $DestPath --version 2>$null | Select-Object -First 1).Trim()
  } catch {
    $PrevVersion = $null
  }
}

# --- resolve version ---------------------------------------------------------
if ($Version -eq "latest") {
  Write-Host "-> Resolving latest release for $Repo..."
  try {
    $latest = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -UseBasicParsing
    $Version = $latest.tag_name
  } catch {
    Write-Error "Could not query GitHub API for $Repo. Check your internet connection or pass `$env:RALPHY_VERSION explicitly."
    exit 1
  }
  if (-not $Version) {
    Write-Error "No published release found for $Repo."
    exit 1
  }
}

$Url = "https://github.com/$Repo/releases/download/$Version/$Asset"
Write-Host "-> Downloading ralphy $Version (windows/$Arch)..."
Write-Host "   $Url"

# --- download ----------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
$Tmp = New-TemporaryFile

try {
  # -UseBasicParsing keeps the cmdlet working on stripped Server SKUs that
  # don't have IE's HTML engine. ProgressPreference suppresses the slow,
  # noisy progress bar that the cmdlet defaults to.
  $ProgressPreference = "SilentlyContinue"
  Invoke-WebRequest -Uri $Url -OutFile $Tmp.FullName -UseBasicParsing
} catch {
  Remove-Item $Tmp.FullName -ErrorAction SilentlyContinue
  Write-Error "Download failed. Check that the release asset exists at $Url"
  exit 1
}

# --- install -----------------------------------------------------------------
Move-Item -Force -Path $Tmp.FullName -Destination $DestPath

# Mark Authenticode-unsigned binaries as user-trusted by stripping the MOTW
# (mark-of-the-web) ADS the download added. Without this, Windows SmartScreen
# may prompt on first run. Idempotent: missing zone means no-op.
try {
  Unblock-File -Path $DestPath -ErrorAction SilentlyContinue
} catch {}

# --- post-install verification -----------------------------------------------
$NewVersion = $null
try {
  $NewVersion = (& $DestPath --version 2>$null | Select-Object -First 1).Trim()
} catch {}

if (-not $NewVersion) {
  Write-Error "Binary installed but '$DestPath --version' returned no output. Try: Get-Item $DestPath"
  exit 1
}

Write-Host ""
if ($PrevVersion -and $PrevVersion -ne $NewVersion) {
  Write-Host "OK  Upgraded ralphy $PrevVersion -> $NewVersion ($DestPath)"
} elseif ($PrevVersion) {
  Write-Host "OK  Reinstalled ralphy $NewVersion ($DestPath)"
} else {
  Write-Host "OK  Installed ralphy $NewVersion -> $DestPath"
}

# --- PATH update -------------------------------------------------------------
if ($env:RALPHY_NO_PATH -ne "1") {
  # Use [Environment]::GetEnvironmentVariable so we read the *persisted* user
  # PATH (HKCU:\Environment), not the broadcast-merged $env:PATH which
  # commingles process / user / machine scopes.
  $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
  if (-not $userPath) { $userPath = "" }

  $segments = $userPath -split ';' | Where-Object { $_ -and ($_.TrimEnd('\') -ne $BinDir.TrimEnd('\')) }
  $alreadyOnPath = ($segments.Count -lt ($userPath -split ';' | Where-Object { $_ }).Count)

  if (-not $alreadyOnPath) {
    $newPath = if ($userPath) { "$BinDir;$userPath" } else { $BinDir }
    [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
    Write-Host "OK  Added $BinDir to your user PATH (HKCU\Environment)."
    Write-Host "    Open a NEW terminal window to pick it up — or run:"
    Write-Host "    `$env:PATH = `"$BinDir;`$env:PATH`""
  }
}

# --- next step ---------------------------------------------------------------
Write-Host ""
Write-Host "Next:"
Write-Host "  ralphy setup       # interactive setup wizard (API keys + profiles)"
Write-Host "  ralphy status      # what's enabled"
Write-Host "  ralphy help        # all commands"
Write-Host ""
