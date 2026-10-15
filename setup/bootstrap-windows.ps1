$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDir
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$env:UV_UNMANAGED_INSTALL = Join-Path $projectDir '.runtime\uv'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $projectDir '.runtime\python'
$env:UV_PYTHON_BIN_DIR = Join-Path $projectDir '.runtime\bin'
$env:UV_CACHE_DIR = Join-Path $projectDir '.runtime\uv-cache'
$runtimeDir = Join-Path $projectDir '.runtime'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$uv = Join-Path $env:UV_UNMANAGED_INSTALL 'uv.exe'
try {
    if (-not (Test-Path -LiteralPath $uv)) {
        Write-Host 'Downloading the Python setup tool...'
        $installer = Join-Path $runtimeDir 'install-uv.ps1'
        Invoke-WebRequest -UseBasicParsing -Uri 'https://astral.sh/uv/install.ps1' -OutFile $installer
        & $installer
        if (-not (Test-Path -LiteralPath $uv)) { throw 'The Python setup tool could not be installed.' }
    }
    $nativeArch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    $pythonRequest = '3.12'
    if ($nativeArch -eq 'ARM64') {
        # Windows 11 supplies x64 emulation; PyTorch has no native Windows ARM wheel.
        $pythonRequest = 'cpython-3.12-windows-x86_64-none'
        Write-Host 'Using x64 Python for local AI compatibility on Windows ARM.'
    }
    & $uv python install $pythonRequest
    if ($LASTEXITCODE -ne 0) { throw 'Python could not be downloaded. Check your internet connection.' }
    $python = & $uv python find --managed-python $pythonRequest
    if ($LASTEXITCODE -ne 0) { throw 'The downloaded Python runtime could not be found.' }
    & $python (Join-Path $PSScriptRoot 'runner.py') --uv $uv @args
    exit $LASTEXITCODE
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
