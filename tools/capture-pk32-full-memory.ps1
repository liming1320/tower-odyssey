param(
    [string]$Executable = 'output\pk32\Pk32.exe',
    [string]$OutputFile = 'output\pk32-reference\memory-dumps\Pk32-full-memory.dmp',
    [switch]$Run,
    [int]$StartupWaitMs = 5000
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Resolve-WorkspacePath([string]$value) {
    if ([IO.Path]::IsPathRooted($value)) { return [IO.Path]::GetFullPath($value) }
    return [IO.Path]::GetFullPath((Join-Path $root $value))
}

$fullExecutable = Resolve-WorkspacePath $Executable
$fullOutputFile = Resolve-WorkspacePath $OutputFile
if (-not (Test-Path -LiteralPath $fullExecutable)) { throw "PK32 executable not found: $fullExecutable" }

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class Pk32MiniDump {
    [DllImport("Dbghelp.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool MiniDumpWriteDump(
        IntPtr process,
        uint processId,
        SafeFileHandle file,
        uint dumpType,
        IntPtr exceptionParam,
        IntPtr userStreamParam,
        IntPtr callbackParam);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ShowWindow(IntPtr window, int command);
}
'@

$process = $null
$startedHere = $false
if ($Run) {
    $process = Start-Process -FilePath $fullExecutable -WorkingDirectory (Split-Path -Parent $fullExecutable) -WindowStyle Hidden -PassThru
    $startedHere = $true
    Start-Sleep -Milliseconds $StartupWaitMs
} else {
    $process = Get-Process -Name 'Pk32' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $process) { throw 'PK32 is not running. Add -Run to launch one hidden instance.' }
}

try {
    $process.Refresh()
    if ($process.HasExited) { throw 'PK32 exited before its runtime memory could be captured.' }
    if ($process.MainWindowHandle -ne [IntPtr]::Zero) {
        [void][Pk32MiniDump]::ShowWindow($process.MainWindowHandle, 0)
    }

    $outputDirectory = Split-Path -Parent $fullOutputFile
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
    $stream = [IO.File]::Open($fullOutputFile, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        # Full memory keeps VB5's private p-code heap, unlike the earlier normal dump.
        $MiniDumpWithFullMemory = 0x00000002
        $MiniDumpWithHandleData = 0x00000004
        $MiniDumpWithFullMemoryInfo = 0x00000800
        $dumpType = $MiniDumpWithFullMemory -bor $MiniDumpWithHandleData -bor $MiniDumpWithFullMemoryInfo
        $ok = [Pk32MiniDump]::MiniDumpWriteDump($process.Handle, [uint32]$process.Id, $stream.SafeFileHandle, [uint32]$dumpType, [IntPtr]::Zero, [IntPtr]::Zero, [IntPtr]::Zero)
        if (-not $ok) {
            $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            throw "MiniDumpWriteDump failed with Win32 error $errorCode."
        }
    } finally {
        $stream.Dispose()
    }

    $bytes = (Get-Item -LiteralPath $fullOutputFile).Length
    [pscustomobject]@{
        executable = $fullExecutable
        processId = $process.Id
        output = $fullOutputFile
        bytes = $bytes
        mode = if ($startedHere) { 'started-hidden' } else { 'attached-running-process' }
    } | ConvertTo-Json -Depth 3
} finally {
    if ($startedHere -and $process -and -not $process.HasExited) {
        $process.Kill()
        $process.WaitForExit()
    }
}
