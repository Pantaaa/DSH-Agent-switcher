# dsh-agent-switcher — one-command installer for DeepSeek Harness (Web profile)
#
# Verified against real failure modes:
#   - Node ESM cannot import a directory (ERR_MODULE_NOT_FOUND / ERR_UNSUPPORTED_DIR_IMPORT),
#     so the patch `name` must be a bare package name, not a folder path.
#   - The loader resolves bare names from the PROFILE's own node_modules chain
#     (~/.dsh/profiles/<profile>/node_modules), NOT from the npm global prefix
#     when DSH was installed with a custom --prefix. So the reliable install is a
#     directory junction inside the profile node_modules that points at the
#     plugin source (single copy, edits apply without reinstall).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -ProfileName web -PluginDir D:\path\to\dsh-agent-switcher
#
# What it does:
#   1. resolves the plugin source directory (default: this repo root)
#   2. creates profile\node_modules\dsh-agent-switcher junction -> source
#   3. registers `name: dsh-agent-switcher` in profile\cordis.patch.yml (with backup)
#   4. prints the restart reminder
param(
    [string]$ProfileName = 'web',
    [string]$PluginDir = ''
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$msg) { Write-Host "[dsh-agent-switcher] $msg" }

# 1. plugin source directory
if ($PluginDir -eq '') {
    $PluginDir = Split-Path -Parent $PSScriptRoot   # repo root when run as scripts\install.ps1
}
if (-not (Test-Path $PluginDir)) { throw "plugin directory not found: $PluginDir" }
$PluginDir = (Resolve-Path $PluginDir).Path
if (-not (Test-Path (Join-Path $PluginDir 'package.json'))) {
    throw "package.json not found in $PluginDir — point -PluginDir at the plugin root"
}
Write-Step "source: $PluginDir"

# 2. profile root
$profileRoot = Join-Path $env:USERPROFILE ".dsh\profiles\$ProfileName"
if (-not (Test-Path $profileRoot)) { throw "DSH profile not found: $profileRoot" }
$nmRoot = Join-Path $profileRoot 'node_modules'
if (-not (Test-Path $nmRoot)) { New-Item -ItemType Directory -Path $nmRoot -Force | Out-Null }
Write-Step "profile: $profileRoot"

# 3. junction into the profile dependency tree
$link = Join-Path $nmRoot 'dsh-agent-switcher'
if (Test-Path $link) {
    $item = Get-Item $link
    if ($item.LinkType -eq 'Junction') {
        Write-Step "junction already present: $link -> $($item.Target)"
    } else {
        throw "$link exists but is not a junction — remove it manually and re-run"
    }
}
else {
    New-Item -ItemType Junction -Path $link -Target $PluginDir | Out-Null
    Write-Step "created junction: $link -> $PluginDir"
}

# 4. register in the profile patch (bare package name — ESM loader + client scan requirement)
$patch = Join-Path $profileRoot 'cordis.patch.yml'
$block = @'

# ── Agent switcher (dsh-agent-switcher) ────────────────────────────────────
# In-session agent preset switcher: composer chip left of the model selector,
# force recompose for started sessions, historical tool-call compat views.
- insert:
    - id: agent-switcher
      name: dsh-agent-switcher
'@
if (Test-Path $patch) {
    $text = Get-Content $patch -Raw
    if ($text -match '(?ms)^\s*-\s*insert:\s*$[\s\S]*name:\s*dsh-agent-switcher\s*$') {
        Write-Step 'patch already registers dsh-agent-switcher'
    }
    else {
        $backup = "$patch.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
        Copy-Item $patch $backup
        Add-Content -Path $patch -Value $block -Encoding UTF8
        Write-Step "patch updated (backup: $backup)"
    }
}
else {
    Set-Content -Path $patch -Value $block -Encoding UTF8
    Write-Step "patch created: $patch"
}

Write-Step ''
Write-Step 'DONE. Fully quit DSH and relaunch it (dsh --profile web).'
Write-Step 'Verify: the Agent chip appears in the composer row, left of the model selector.'
Write-Step 'Uninstall: remove the junction and the insert block, then restart.'
