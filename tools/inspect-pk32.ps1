param(
    [string]$Executable = 'F:\BaiduNetdiskDownload\pk32\Pk32.exe',
    [string]$Output = 'output/pk32-reference/module.bin'
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Pk32ReadOnly {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint access, bool inherit, int id);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] data, int size, out IntPtr read);
    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr handle);
}
'@
$target = Get-Process -Name Pk32 | Where-Object { $_.Path -ieq $Executable } | Select-Object -First 1
if (-not $target) { throw 'Start the specified PK32 application first.' }
$module = $target.MainModule
$handle = [Pk32ReadOnly]::OpenProcess(0x410, $false, $target.Id)
if ($handle -eq [IntPtr]::Zero) { throw 'Read-only process access was denied.' }
try {
    $data = New-Object byte[] $module.ModuleMemorySize
    $read = [IntPtr]::Zero
    if (-not [Pk32ReadOnly]::ReadProcessMemory($handle, $module.BaseAddress, $data, $data.Length, [ref]$read)) {
        throw "Cannot read executable image: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
    }
    $destination = [IO.Path]::GetFullPath($Output)
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
    [IO.File]::WriteAllBytes($destination, $data)
    [PSCustomObject]@{ File = $destination; Bytes = $read.ToInt64(); BaseAddress = $module.BaseAddress.ToInt64() } | ConvertTo-Json
} finally {
    [Pk32ReadOnly]::CloseHandle($handle) | Out-Null
}
