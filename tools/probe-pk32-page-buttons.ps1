param(
    [string]$Executable = 'E:\WorkSpace\tower-odyssey\output\pk32\Pk32.exe',
    [string]$OutputDirectory = 'output\pk32-reference\page-probe',
    [int]$LaunchWaitMs = 2200,
    [int]$SplashWaitMs = 3600,
    [int]$StepWaitMs = 800,
    [int[]]$X = @(560, 580, 594, 610, 630, 650),
    [string]$Y = '404,415,426,437,448,459,470,481',
    [switch]$Run,
    [switch]$AllowDesktopInput,
    [switch]$KeepOpen
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

function Resolve-ProbePath([string]$Value) {
    if ([IO.Path]::IsPathRooted($Value)) { return [IO.Path]::GetFullPath($Value) }
    return [IO.Path]::GetFullPath((Join-Path $projectRoot $Value))
}

Add-Type -AssemblyName System.Drawing
$drawingAssembly = [System.Drawing.Bitmap].Assembly.Location
Add-Type -ReferencedAssemblies $drawingAssembly -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;

public static class Pk32PageProbeNative {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
    public static IntPtr FindVisibleWindow(int processId) {
        IntPtr found = IntPtr.Zero;
        long largestArea = 0;
        EnumWindows((hWnd, parameter) => {
            uint owner; GetWindowThreadProcessId(hWnd, out owner);
            RECT rect;
            if (owner == processId && IsWindowVisible(hWnd) && GetWindowRect(hWnd, out rect)) {
                long area = (long)(rect.Right - rect.Left) * (rect.Bottom - rect.Top);
                if (area > largestArea && rect.Right - rect.Left >= 100 && rect.Bottom - rect.Top >= 100) { largestArea = area; found = hWnd; }
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
    public static void Click(IntPtr hWnd, int x, int y) {
        RECT rect; if (!GetWindowRect(hWnd, out rect)) throw new Exception("GetWindowRect failed");
        SetForegroundWindow(hWnd); SetCursorPos(rect.Left + x, rect.Top + y);
        mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero); mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
    }
    public static void Capture(IntPtr hWnd, string path) {
        RECT rect; if (!GetWindowRect(hWnd, out rect)) throw new Exception("GetWindowRect failed");
        int width = rect.Right - rect.Left, height = rect.Bottom - rect.Top;
        using (var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb)) using (var graphics = Graphics.FromImage(bitmap)) {
            IntPtr dc = graphics.GetHdc(); bool captured;
            try { captured = PrintWindow(hWnd, dc, 2) || PrintWindow(hWnd, dc, 0); } finally { graphics.ReleaseHdc(dc); }
            bool hasInk = false;
            for (int x = 0; x < width && !hasInk; x += Math.Max(1, width / 20)) {
                for (int y = 0; y < height && !hasInk; y += Math.Max(1, height / 20)) {
                    var pixel = bitmap.GetPixel(x, y);
                    hasInk = pixel.R + pixel.G + pixel.B > 24;
                }
            }
            if (!captured || !hasInk) { graphics.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(width, height)); }
            bitmap.Save(path, ImageFormat.Png);
        }
    }
}
'@

if (-not $Run) { Write-Output 'Dry run only. Pass -Run -AllowDesktopInput to probe page-button coordinates.'; exit 0 }
if (-not $AllowDesktopInput) { throw 'This probe sends mouse clicks to PK32. Pass -AllowDesktopInput only while the desktop is free.' }

$fullExecutable = Resolve-ProbePath $Executable
$fullOutput = Resolve-ProbePath $OutputDirectory
if (-not (Test-Path -LiteralPath $fullExecutable)) { throw "PK32 executable not found: $fullExecutable" }
[IO.Directory]::CreateDirectory($fullOutput) | Out-Null
$probeYs = @($Y -split '[,;\s]+' | Where-Object { $_ -ne '' } | ForEach-Object { [int]$_ })
if ($probeYs.Count -eq 0) { throw 'Y must contain at least one integer coordinate.' }

function Wait-ForWindow([Diagnostics.Process]$Process, [int]$TimeoutMs) {
    $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
    while ([DateTime]::UtcNow -lt $deadline) {
        $Process.Refresh(); $handle = [Pk32PageProbeNative]::FindVisibleWindow($Process.Id)
        if ($handle -ne [IntPtr]::Zero) { return $handle }
        Start-Sleep -Milliseconds 100
    }
    return [IntPtr]::Zero
}

function Get-Hash([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }

$results = @()
$index = 0
foreach ($probeX in $X) {
    foreach ($probeY in $probeYs) {
        $index++
        $directory = Join-Path $fullOutput ('{0:D3}-x{1}-y{2}' -f $index, $probeX, $probeY)
        [IO.Directory]::CreateDirectory($directory) | Out-Null
        $process = $null
        $result = [ordered]@{ x = $probeX; y = $probeY; status = 'failed'; before = $null; after = $null; changed = $false; error = $null }
        try {
            $process = Start-Process -FilePath $fullExecutable -WorkingDirectory (Split-Path -Parent $fullExecutable) -PassThru
            $handle = Wait-ForWindow $process $LaunchWaitMs
            if ($handle -eq [IntPtr]::Zero) { throw 'PK32 window did not appear before timeout.' }
            [Pk32PageProbeNative]::ShowWindow($handle, 9) | Out-Null
            [Pk32PageProbeNative]::SetForegroundWindow($handle) | Out-Null
            Start-Sleep -Milliseconds ($StepWaitMs + $SplashWaitMs)
            $handle = [Pk32PageProbeNative]::FindVisibleWindow($process.Id)
            if ($handle -eq [IntPtr]::Zero) { throw 'PK32 catalog window did not appear after the startup screen.' }
            [Pk32PageProbeNative]::ShowWindow($handle, 9) | Out-Null
            [Pk32PageProbeNative]::SetForegroundWindow($handle) | Out-Null
            Start-Sleep -Milliseconds 150
            $beforePath = Join-Path $directory 'before.png'
            [Pk32PageProbeNative]::Capture($handle, $beforePath)
            $result.before = Get-Hash $beforePath
            [Pk32PageProbeNative]::Click($handle, $probeX, $probeY)
            Start-Sleep -Milliseconds $StepWaitMs
            $handle = [Pk32PageProbeNative]::FindVisibleWindow($process.Id)
            if ($handle -eq [IntPtr]::Zero) { throw 'PK32 window disappeared after the page-button click.' }
            $afterPath = Join-Path $directory 'after.png'
            [Pk32PageProbeNative]::Capture($handle, $afterPath)
            $result.after = Get-Hash $afterPath
            $result.changed = $result.before -ne $result.after
            $result.status = if ($result.changed) { 'changed' } else { 'unchanged' }
        } catch { $result.error = $_.Exception.Message } finally {
            $result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $directory 'record.json') -Encoding utf8
            if ($process -and -not $process.HasExited -and -not $KeepOpen) { Stop-Process -Id $process.Id -Force }
            $results += [PSCustomObject]$result
        }
    }
}

$summary = [ordered]@{ version = 1; generatedAt = [DateTime]::UtcNow.ToString('o'); executable = $fullExecutable; policy = [ordered]@{ startsFreshProcessPerCoordinate = $true; migrationStatusUnchanged = $true }; results = $results }
$summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $fullOutput 'summary.json') -Encoding utf8
$results | Group-Object status | Select-Object Name, Count | ConvertTo-Json
