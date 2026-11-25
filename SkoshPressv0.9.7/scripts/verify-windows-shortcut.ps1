$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$packagePath = Join-Path $projectRoot 'package.json'
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
$shortcutName = [string]$package.build.nsis.shortcutName
$filename = "$shortcutName.lnk"
$desktopFolders = @(
    [Environment]::GetFolderPath('DesktopDirectory')
    [Environment]::GetFolderPath('CommonDesktopDirectory')
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique

$paths = @($desktopFolders | ForEach-Object { Join-Path $_ $filename })
$existing = @($paths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
if ($existing.Count -eq 0) {
    throw "No $filename shortcut found. Checked: $($paths -join ', '). Install Skosh Press using the Windows setup executable first."
}

$shell = New-Object -ComObject WScript.Shell
foreach ($shortcutPath in $existing) {
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $target = [string]$shortcut.TargetPath
    if ([string]::IsNullOrWhiteSpace($target) -or -not (Test-Path -LiteralPath $target -PathType Leaf)) {
        throw "Desktop shortcut has a missing target: $shortcutPath -> $target"
    }
    if ([IO.Path]::GetExtension($target) -ine '.exe') {
        throw "Desktop shortcut does not target an executable: $shortcutPath -> $target"
    }
    $expectedExe = "$($package.productName).exe"
    if ([IO.Path]::GetFileName($target) -ine $expectedExe) {
        throw "Desktop shortcut points to an unexpected executable: $shortcutPath -> $target"
    }
    Write-Host "Verified desktop shortcut: $shortcutPath"
    Write-Host "Target: $target"
}
