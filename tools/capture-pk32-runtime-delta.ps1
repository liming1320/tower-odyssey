param(
    [Parameter(Mandatory = $true)][int]$ProcessId,
    [string]$BaselineManifest = 'output\pk32-reference\runtime-baseline-pages.json',
    [string]$OutputDirectory = 'output\pk32-reference\runtime-delta',
    [int]$MaxCaptureMiB = 64,
    [switch]$SnapshotOnly
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

function Resolve-CollectorPath([string]$Value) {
    if ([IO.Path]::IsPathRooted($Value)) { return [IO.Path]::GetFullPath($Value) }
    return [IO.Path]::GetFullPath((Join-Path $projectRoot $Value))
}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class Pk32RuntimeDeltaNative {
    [StructLayout(LayoutKind.Sequential)]
    public struct MemoryBasicInformation {
        public IntPtr BaseAddress;
        public IntPtr AllocationBase;
        public uint AllocationProtect;
        public UIntPtr RegionSize;
        public uint State;
        public uint Protect;
        public uint Type;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint access, bool inherit, int processId);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] data, int size, out IntPtr read);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern UIntPtr VirtualQueryEx(IntPtr process, IntPtr address, out MemoryBasicInformation information, UIntPtr length);
    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr handle);
}
'@

$fullManifest = Resolve-CollectorPath $BaselineManifest
$fullOutput = Resolve-CollectorPath $OutputDirectory
if (-not $SnapshotOnly -and -not (Test-Path -LiteralPath $fullManifest)) { throw "Baseline manifest not found: $fullManifest. Run npm run pk32:baseline-memory first." }
if ($MaxCaptureMiB -lt 1) { throw 'MaxCaptureMiB must be positive.' }

$baselinePages = @{}
if (-not $SnapshotOnly) {
    $baseline = Get-Content -LiteralPath $fullManifest -Raw | ConvertFrom-Json
    if ($baseline.pageSize -ne 4096) { throw "Unsupported baseline page size: $($baseline.pageSize)." }
    foreach ($page in $baseline.pages) { $baselinePages[$page.address] = $page.sha256 }
}

New-Item -ItemType Directory -Force -Path $fullOutput | Out-Null
$pageDirectory = Join-Path $fullOutput 'pages'
New-Item -ItemType Directory -Force -Path $pageDirectory | Out-Null

$queryInformation = 0x0400
$virtualMemoryRead = 0x0010
$committed = 0x1000
$private = 0x20000
$guard = 0x100
$noAccess = 0x01
$maximumAddress = 0x80000000L
$maximumBytes = [int64]$MaxCaptureMiB * 1MB
$process = [Pk32RuntimeDeltaNative]::OpenProcess($queryInformation -bor $virtualMemoryRead, $false, $ProcessId)
if ($process -eq [IntPtr]::Zero) { throw 'Read-only process access was denied or the PK32 process has exited.' }

$sha256 = [Security.Cryptography.SHA256]::Create()
$records = @()
$scannedPages = 0
$changedPages = 0
$capturedBytes = [int64]0
$truncated = $false
try {
    $address = 0x10000L
    $structureSize = [Runtime.InteropServices.Marshal]::SizeOf([type][Pk32RuntimeDeltaNative+MemoryBasicInformation])
    while ($address -lt $maximumAddress) {
        $information = New-Object Pk32RuntimeDeltaNative+MemoryBasicInformation
        $queried = [Pk32RuntimeDeltaNative]::VirtualQueryEx($process, [IntPtr]$address, [ref]$information, [UIntPtr]::new([uint32]$structureSize))
        if ($queried -eq [UIntPtr]::Zero) { break }

        $baseAddress = $information.BaseAddress.ToInt64()
        $regionSize = [int64]$information.RegionSize.ToUInt64()
        $nextAddress = $baseAddress + [Math]::Max($regionSize, 0x1000)
        $readablePrivate = $information.State -eq $committed -and $information.Type -eq $private -and
            (($information.Protect -band $guard) -eq 0) -and (($information.Protect -band $noAccess) -eq 0)
        if ($readablePrivate -and $regionSize -gt 0) {
            for ($offset = [int64]0; $offset -lt $regionSize; $offset += 4096) {
                $size = [Math]::Min(4096, $regionSize - $offset)
                $bytes = New-Object byte[] $size
                $read = [IntPtr]::Zero
                $pageAddress = $baseAddress + $offset
                $scannedPages += 1
                if (-not [Pk32RuntimeDeltaNative]::ReadProcessMemory($process, [IntPtr]$pageAddress, $bytes, $size, [ref]$read) -or $read.ToInt64() -ne $size) { continue }
                $hash = ([BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
                $key = '0x' + $pageAddress.ToString('x8')
                $baselineHash = $baselinePages[$key]
                if (-not $SnapshotOnly -and $baselineHash -eq $hash) { continue }
                $changedPages += 1
                $fileName = $key + '.bin'
                if (-not $SnapshotOnly) {
                    if ($capturedBytes + $size -gt $maximumBytes) { $truncated = $true; break }
                    [IO.File]::WriteAllBytes((Join-Path $pageDirectory $fileName), $bytes)
                    $capturedBytes += $size
                }
                $records += [ordered]@{
                    address = $key
                    size = $size
                    sha256 = $hash
                    baselinePresent = $null -ne $baselineHash
                    protection = ('0x{0:x8}' -f $information.Protect)
                    type = ('0x{0:x8}' -f $information.Type)
                    file = if ($SnapshotOnly) { $null } else { 'pages/' + $fileName }
                }
            }
        }
        if ($truncated) { break }
        if ($nextAddress -le $address) { break }
        $address = $nextAddress
    }
} finally {
    $sha256.Dispose()
    [void][Pk32RuntimeDeltaNative]::CloseHandle($process)
}

$result = [ordered]@{
    version = 1
    generatedAt = [DateTime]::UtcNow.ToString('o')
    processId = $ProcessId
    baseline = if ($SnapshotOnly) { $null } else { $fullManifest }
    pageSize = 4096
    policy = [ordered]@{
        capturesPrivatePagesOnly = $true
        snapshotOnly = [bool]$SnapshotOnly
        capturesOnlyPagesDifferentFromBaseline = -not $SnapshotOnly
        changedPagesAreRuntimeEvidenceNotRuleRecovery = $true
        migrationStatusUnchanged = $true
    }
    summary = [ordered]@{
        scannedPages = $scannedPages
        changedPages = $changedPages
        capturedBytes = $capturedBytes
        maxCaptureBytes = $maximumBytes
        truncated = $truncated
    }
    pages = $records
}
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $fullOutput 'manifest.json') -Encoding utf8
$result | ConvertTo-Json -Depth 4
