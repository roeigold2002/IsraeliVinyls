# Vinyl Store - PowerShell Installer
# This is a more modern installer for the Vinyl Store application
# Run this with: powershell -ExecutionPolicy Bypass -File Install-VinylStore.ps1

param(
    [switch]$Silent = $false,
    [string]$InstallPath = "$env:ProgramFiles\Vinyl Store"
)

function Write-Host-Color {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

# Check for Admin privileges
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host-Color "ERROR: This installer requires Administrator privileges!" "Red"
    Write-Host "Please run PowerShell as Administrator and try again."
    Write-Host "To do this: Right-click PowerShell and select 'Run as Administrator'"
    if (-not $Silent) { Read-Host "Press Enter to exit" }
    exit 1
}

# Define paths
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourcePath = Join-Path $scriptPath "dist\win-unpacked"
$sourceExe = Join-Path $sourcePath "Vinyl Store.exe"

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "Vinyl Store - Installation" -ForegroundColor Cyan
Write-Host "Version 1.0.0" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host ""

# Validate source files
Write-Host-Color "Checking source files..." "Yellow"
if (-not (Test-Path $sourceExe)) {
    Write-Host-Color "ERROR: Application files not found!" "Red"
    Write-Host "Expected location: $sourceExe"
    Write-Host ""
    Write-Host "Make sure you're running this installer from the project directory."
    if (-not $Silent) { Read-Host "Press Enter to exit" }
    exit 1
}
Write-Host-Color "✓ Source files verified" "Green"

# Create installation directory
Write-Host-Color "Creating installation directory..." "Yellow"
if (Test-Path $InstallPath) {
    Write-Host-Color "Directory already exists" "Gray"
} else {
    try {
        New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
        Write-Host-Color "✓ Directory created" "Green"
    } catch {
        Write-Host-Color "ERROR: Failed to create directory" "Red"
        Write-Host "Details: $_"
        if (-not $Silent) { Read-Host "Press Enter to exit" }
        exit 1
    }
}

# Copy application files
Write-Host-Color "Copying application files..." "Yellow"
try {
    Copy-Item -Path (Join-Path $sourcePath "*") -Destination $InstallPath -Recurse -Force -ErrorAction Stop
    Write-Host-Color "✓ Files copied successfully" "Green"
} catch {
    Write-Host-Color "ERROR: Failed to copy files" "Red"
    Write-Host "Details: $_"
    if (-not $Silent) { Read-Host "Press Enter to exit" }
    exit 1
}

# Create shortcuts
Write-Host-Color "Creating shortcuts..." "Yellow"

# Get Start Menu path
$startMenuPath = [System.IO.Path]::Combine([System.Environment]::GetFolderPath("ApplicationData"), "Microsoft\Windows\Start Menu\Programs\Vinyl Store")
$desktopPath = [System.Environment]::GetFolderPath("Desktop")

# Create Start Menu folder
if (-not (Test-Path $startMenuPath)) {
    New-Item -ItemType Directory -Path $startMenuPath -Force | Out-Null
}

# Function to create shortcut
function New-Shortcut {
    param([string]$LinkPath, [string]$TargetPath, [string]$WorkingDir)
    
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($LinkPath)
    $shortcut.TargetPath = $TargetPath
    $shortcut.WorkingDirectory = $WorkingDir
    $shortcut.IconLocation = $TargetPath
    $shortcut.Save()
}

# Create application shortcut
$appShortcut = Join-Path $startMenuPath "Vinyl Store.lnk"
New-Shortcut -LinkPath $appShortcut -TargetPath $sourceExe -WorkingDir $InstallPath

# Create Desktop shortcut
$desktopShortcut = Join-Path $desktopPath "Vinyl Store.lnk"
New-Shortcut -LinkPath $desktopShortcut -TargetPath $sourceExe -WorkingDir $InstallPath

Write-Host-Color "✓ Shortcuts created" "Green"

# Create Uninstaller
Write-Host-Color "Creating uninstaller..." "Yellow"
$uninstallerScript = @"
`# Uninstall script for Vinyl Store
Write-Host "Uninstalling Vinyl Store..."
Start-Sleep -Seconds 2

`# Close running instances
Stop-Process -Name "Vinyl Store" -ErrorAction SilentlyContinue
Get-Process | Where-Object { `$_.MainWindowTitle -like "*Vinyl Store*" } | Stop-Process -ErrorAction SilentlyContinue

`# Remove installation directory
if (Test-Path "$InstallPath") {
    Remove-Item -Path "$InstallPath" -Recurse -Force
}

`# Remove shortcuts
`$startMenuPath = [System.IO.Path]::Combine([System.Environment]::GetFolderPath("ApplicationData"), "Microsoft\Windows\Start Menu\Programs\Vinyl Store")
if (Test-Path `$startMenuPath) {
    Remove-Item -Path `$startMenuPath -Recurse -Force
}

`$desktopShortcut = Join-Path ([System.Environment]::GetFolderPath("Desktop")) "Vinyl Store.lnk"
if (Test-Path `$desktopShortcut) {
    Remove-Item -Path `$desktopShortcut -Force
}

Write-Host "Vinyl Store has been uninstalled."
Write-Host "Press Enter to close this window..."
Read-Host
"@

$uninstallerPath = Join-Path $InstallPath "Uninstall.ps1"
Set-Content -Path $uninstallerPath -Value $uninstallerScript

# Create uninstaller shortcut
$uninstallShortcut = Join-Path $startMenuPath "Uninstall.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($uninstallShortcut)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$uninstallerPath`""
$shortcut.WorkingDirectory = $InstallPath
$shortcut.Save()

Write-Host-Color "✓ Uninstaller created" "Green"

# Add to Windows Registry
Write-Host-Color "Registering in Windows..." "Yellow"
try {
    $regPath = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Vinyl Store"
    if (-not (Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
    }
    
    Set-ItemProperty -Path $regPath -Name "DisplayName" -Value "Vinyl Store"
    Set-ItemProperty -Path $regPath -Name "DisplayVersion" -Value "1.0.0"
    Set-ItemProperty -Path $regPath -Name "InstallLocation" -Value $InstallPath
    Set-ItemProperty -Path $regPath -Name "UninstallString" -Value "powershell.exe -ExecutionPolicy Bypass -File `"$uninstallerPath`""
    Set-ItemProperty -Path $regPath -Name "Publisher" -Value "Vinyl Store Inc."
    
    Write-Host-Color "✓ Registered in Programs and Features" "Green"
} catch {
    Write-Host-Color "Warning: Could not register in Programs and Features" "Yellow"
}

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Green
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host ("=" * 70) -ForegroundColor Green
Write-Host ""
Write-Host "Vinyl Store has been installed to:" -ForegroundColor White
Write-Host "  $InstallPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can launch the application by:" -ForegroundColor White
Write-Host "  • Clicking the 'Vinyl Store' shortcut on your Desktop" -ForegroundColor Green
Write-Host "  • Or finding 'Vinyl Store' in your Start Menu" -ForegroundColor Green
Write-Host ""
Write-Host "To uninstall, run the 'Uninstall' shortcut from Start Menu" -ForegroundColor Yellow
Write-Host ""

if (-not $Silent) {
    $launch = Read-Host "Do you want to launch Vinyl Store now? (Y/N)"
    if ($launch -eq "Y" -or $launch -eq "y") {
        & $sourceExe
    }
}
