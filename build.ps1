# build.ps1 - Ollama Agent build script
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir
$Node22 = "C:\tools\node22"
$jsonPath = Join-Path $ScriptDir "package.json"

# Read current version (strip BOM if present)
$rawBytes = [System.IO.File]::ReadAllBytes($jsonPath)
if ($rawBytes[0] -eq 0xEF -and $rawBytes[1] -eq 0xBB -and $rawBytes[2] -eq 0xBF) {
    $content = [System.Text.Encoding]::UTF8.GetString($rawBytes, 3, $rawBytes.Length - 3)
} else {
    $content = [System.Text.Encoding]::UTF8.GetString($rawBytes)
}
$pkg = $content | ConvertFrom-Json
$currentVersion = $pkg.version

# Increment patch version
if ($currentVersion -match "^(\d+)\.(\d+)\.(\d+)") {
    $major = [int]$matches[1]
    $minor = [int]$matches[2]
    $patch = [int]$matches[3] + 1
    $newVersion = "$major.$minor.$patch"
} else {
    Write-Error "Invalid version format: $currentVersion"
    exit 1
}

# Update package.json (no BOM)
$pkg.version = $newVersion
$newJson = $pkg | ConvertTo-Json -Depth 4
$newBytes = [System.Text.Encoding]::UTF8.GetBytes($newJson)
[System.IO.File]::WriteAllBytes($jsonPath, $newBytes)
Write-Host "Version: $currentVersion -> $newVersion" -ForegroundColor Green

# Compile TypeScript
Write-Host "Compiling TypeScript..." -ForegroundColor Cyan
& "$Node22\npx.cmd" tsc
if ($LASTEXITCODE -ne 0) { Write-Error "tsc failed"; exit 1 }

# Package VSIX
Write-Host "Packaging VSIX..." -ForegroundColor Cyan
& "$Node22\npx.cmd" vsce package --allow-missing-repository
if ($LASTEXITCODE -ne 0) { Write-Error "vsce package failed"; exit 1 }

# Install
$vsix = Get-ChildItem "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($vsix) {
    Write-Host "Installing: $($vsix.Name)" -ForegroundColor Cyan
    code --install-extension $vsix.FullName
    Write-Host "Done! Reload VS Code window to activate." -ForegroundColor Green
} else {
    Write-Error "No VSIX found"
    exit 1
}
