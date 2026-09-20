param(
    [string]$Executable = 'E:\WorkSpace\tower-odyssey\output\pk32\Pk32.exe',
    [string]$OutputDirectory = 'output\pk32-reference\mouse-captures',
    [int]$LaunchWaitMs = 2200,
    [int]$SplashWaitMs = 3600,
    [int]$StepWaitMs = 650,
    [int]$PageWaitMs = 1800,
    [int]$ScrollSteps = 0,
    [int]$PageNumber = 1,
    [int]$PageButtonX = 594,
    [int]$PageButtonY = 404,
    [int]$PageButtonStepY = 22,
    [int]$PositionOffset = 0,
    [int]$RowStartY = 118,
    [int]$RowStepY = 22,
    [int]$RowsPerColumn = 18,
    [int[]]$ColumnX = @(190, 350, 470, 610),
    [int]$From = 1,
    [int]$To = 4,
    [int]$StartButtonX = 400,
    [int]$StartButtonY = 445,
    [int]$GameWaitMs = 1200,
    [switch]$CaptureRuntimeDelta,
    [int]$MaxDeltaMiB = 64,
    [switch]$Run,
    [switch]$AllowDesktopInput,
    [switch]$KeepOpen
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

function Resolve-BatchPath([string]$Value) {
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

public static class Pk32MouseBatchNative {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int capacity);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int capacity);
    private static bool GetScreenRect(IntPtr hWnd, out RECT rect) { return GetWindowRect(hWnd, out rect); }
    private static void MoveCursor(RECT rect, int x, int y) { SetCursorPos(rect.Left + x, rect.Top + y); }
    public static IntPtr FindVisibleWindow(int processId) {
        IntPtr found = IntPtr.Zero;
        long largestArea = 0;
        EnumWindows((hWnd, parameter) => {
            uint owner; GetWindowThreadProcessId(hWnd, out owner);
            RECT rect;
            if (owner == processId && IsWindowVisible(hWnd) && GetWindowRect(hWnd, out rect) && rect.Right - rect.Left >= 100 && rect.Bottom - rect.Top >= 100) {
                long area = (long)(rect.Right - rect.Left) * (rect.Bottom - rect.Top);
                if (area > largestArea) { largestArea = area; found = hWnd; }
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
    public static string WindowInfo(IntPtr hWnd) {
        RECT rect; GetWindowRect(hWnd, out rect);
        var title = new StringBuilder(512); var className = new StringBuilder(256);
        GetWindowText(hWnd, title, title.Capacity); GetClassName(hWnd, className, className.Capacity);
        return string.Format("{0}|{1}|{2}|{3}|{4}|{5}|{6}", hWnd.ToInt64(), title, className, rect.Left, rect.Top, rect.Right - rect.Left, rect.Bottom - rect.Top);
    }
    public static void Click(IntPtr hWnd, int x, int y) {
        RECT rect; if (!GetScreenRect(hWnd, out rect)) throw new Exception("GetWindowRect failed");
        int width = rect.Right - rect.Left, height = rect.Bottom - rect.Top;
        if (x < 0 || y < 0 || x >= width || y >= height) throw new Exception("Click coordinate is outside the PK32 window");
        SetForegroundWindow(hWnd); MoveCursor(rect, x, y);
        mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero); mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
    }
    public static void Wheel(IntPtr hWnd, int delta) {
        RECT rect; if (!GetScreenRect(hWnd, out rect)) throw new Exception("GetWindowRect failed");
        SetForegroundWindow(hWnd); MoveCursor(rect, 150, 100);
        mouse_event(0x0800, 0, 0, (uint)delta, UIntPtr.Zero);
    }
    public static void Capture(IntPtr hWnd, string path) {
        RECT rect; if (!GetScreenRect(hWnd, out rect)) throw new Exception("GetWindowRect failed");
        int width = rect.Right - rect.Left, height = rect.Bottom - rect.Top;
        if (width < 100 || height < 100) throw new Exception("PK32 visible window has no usable size");
        using (var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb)) using (var graphics = Graphics.FromImage(bitmap)) {
            IntPtr dc = graphics.GetHdc(); bool captured;
            try { captured = PrintWindow(hWnd, dc, 2) || PrintWindow(hWnd, dc, 0); } finally { graphics.ReleaseHdc(dc); }
            if (!captured) { graphics.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(width, height)); }
            bitmap.Save(path, ImageFormat.Png);
        }
    }
}
'@

if (-not $Run) { Write-Output 'Dry run only. Pass -Run -AllowDesktopInput to capture mouse-selected PK32 entries.'; exit 0 }
if (-not $AllowDesktopInput) { throw 'This batch sends mouse clicks to PK32. Pass -AllowDesktopInput only while the desktop is free.' }
if ($From -lt 1 -or $To -lt $From -or $To -gt ($RowsPerColumn * $ColumnX.Count)) { throw "Positions must be in the range 1..$($RowsPerColumn * $ColumnX.Count)." }
if ($PageNumber -lt 1 -or $PageNumber -gt 5) { throw 'PageNumber must be in the range 1..5.' }

$fullExecutable = Resolve-BatchPath $Executable
$fullOutput = Resolve-BatchPath $OutputDirectory
if (-not (Test-Path -LiteralPath $fullExecutable)) { throw "PK32 executable not found: $fullExecutable" }
[IO.Directory]::CreateDirectory($fullOutput) | Out-Null

function Wait-ForWindow([Diagnostics.Process]$Process, [int]$TimeoutMs) {
    $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
    while ([DateTime]::UtcNow -lt $deadline) {
        $Process.Refresh(); $handle = [Pk32MouseBatchNative]::FindVisibleWindow($Process.Id)
        if ($handle -ne [IntPtr]::Zero) { return $handle }
        Start-Sleep -Milliseconds 100
    }
    return [IntPtr]::Zero
}

function Capture-Phase([IntPtr]$Handle, [string]$Directory, [string]$Name) {
    $Handle = Get-ActiveWindow $process
    $path = Join-Path $Directory $Name
    [Pk32MouseBatchNative]::Capture($Handle, $path)
    return [PSCustomObject]@{ file = $Name; hash = Get-Sha256 $path }
}

function Get-Sha256([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $hasher.Dispose(); $stream.Dispose() }
}

function Get-VisualChangeRate([string]$BeforePath, [string]$AfterPath) {
    $before = New-Object Drawing.Bitmap $BeforePath
    $after = New-Object Drawing.Bitmap $AfterPath
    try {
        $width = [Math]::Min($before.Width, $after.Width)
        $height = [Math]::Min($before.Height, $after.Height)
        $samples = 0
        $changed = 0
        for ($x = 0; $x -lt $width; $x += 8) {
            for ($y = 0; $y -lt $height; $y += 8) {
                $left = $before.GetPixel($x, $y)
                $right = $after.GetPixel($x, $y)
                $samples += 1
                if ([Math]::Abs($left.R - $right.R) + [Math]::Abs($left.G - $right.G) + [Math]::Abs($left.B - $right.B) -gt 60) { $changed += 1 }
            }
        }
        if ($samples -eq 0) { return 0.0 }
        return [Math]::Round($changed / $samples, 4)
    } finally {
        $before.Dispose()
        $after.Dispose()
    }
}

function Click-And-Wait([IntPtr]$Handle, [int]$X, [int]$Y) {
    $Handle = Get-ActiveWindow $process
    [Pk32MouseBatchNative]::Click($Handle, $X, $Y)
    Start-Sleep -Milliseconds $StepWaitMs
}

function Get-ActiveWindow([Diagnostics.Process]$Process) {
    $Process.Refresh()
    if ($Process.HasExited) { throw 'PK32 exited before the requested capture phase.' }
    $active = [Pk32MouseBatchNative]::FindVisibleWindow($Process.Id)
    if ($active -eq [IntPtr]::Zero) { throw 'PK32 has no visible window for the requested capture phase.' }
    return $active
}

$records = @()
for ($position = $From; $position -le $To; $position++) {
    $globalPosition = $PositionOffset + $position
    $zeroBased = $position - 1
    $columnIndex = [Math]::Floor($zeroBased / $RowsPerColumn)
    $column = $columnIndex + 1
    $row = $zeroBased % $RowsPerColumn
    $x = $ColumnX[$columnIndex]
    $y = $RowStartY + ($row * $RowStepY)
    $directory = Join-Path $fullOutput ('{0:D3}-ui-{1:D3}' -f $globalPosition, $globalPosition)
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $record = [ordered]@{
        version = 1
        uiPosition = $globalPosition
        pageNumber = $PageNumber
        coordinate = [ordered]@{ column = $column; row = $row; relativeX = $x; relativeY = $y; scrollSteps = $ScrollSteps }
        status = 'failed'
        evidence = [ordered]@{}
        error = $null
        startedAt = [DateTime]::UtcNow.ToString('o')
    }
    $process = $null
    try {
        $process = Start-Process -FilePath $fullExecutable -WorkingDirectory (Split-Path -Parent $fullExecutable) -PassThru
        $handle = Wait-ForWindow $process $LaunchWaitMs
        if ($handle -eq [IntPtr]::Zero) { throw 'PK32 window did not appear before timeout.' }
        [Pk32MouseBatchNative]::ShowWindow($handle, 9) | Out-Null
        [Pk32MouseBatchNative]::SetForegroundWindow($handle) | Out-Null
        Start-Sleep -Milliseconds $StepWaitMs
        $record.evidence.introduction = (Capture-Phase $handle $directory '01-introduction.png').file
        Start-Sleep -Milliseconds $SplashWaitMs
        if ($PageNumber -gt 1) {
            $handle = Get-ActiveWindow $process
            for ($page = 2; $page -le $PageNumber; $page++) {
                $pageY = $PageButtonY + (($page - 1) * $PageButtonStepY)
                Click-And-Wait $handle $PageButtonX $pageY
                Start-Sleep -Milliseconds $PageWaitMs
            }
        }
        if ($ScrollSteps -ne 0) {
            $direction = if ($ScrollSteps -gt 0) { 120 } else { -120 }
            for ($step = 0; $step -lt [Math]::Abs($ScrollSteps); $step++) { $handle = Get-ActiveWindow $process; [Pk32MouseBatchNative]::Wheel($handle, $direction); Start-Sleep -Milliseconds 120 }
        }
        $catalogCapture = Capture-Phase $handle $directory '02-catalog.png'
        $record.evidence.catalog = $catalogCapture.file
        $record.evidence.catalogHash = $catalogCapture.hash
        $catalogWindow = Get-ActiveWindow $process
        $record.catalogWindow = [Pk32MouseBatchNative]::WindowInfo($catalogWindow).Split('|')
        $runtimeBaseline = $null
        if ($CaptureRuntimeDelta) {
            $baselineDirectory = Join-Path $directory 'runtime-baseline'
            $baselineOutput = & (Join-Path $PSScriptRoot 'capture-pk32-runtime-delta.ps1') -ProcessId $process.Id -OutputDirectory $baselineDirectory -MaxCaptureMiB $MaxDeltaMiB -SnapshotOnly
            if (-not $?) { throw 'Runtime baseline collection failed.' }
            $baselineOutput | Set-Content -LiteralPath (Join-Path $baselineDirectory 'collector-output.json') -Encoding utf8
            $runtimeBaseline = Join-Path $baselineDirectory 'manifest.json'
            $record.evidence.runtimeBaseline = 'runtime-baseline/manifest.json'
        }
        $selectedCapture = $null
        foreach ($offset in @(0, -4, 4, -8, 8)) {
            Click-And-Wait $handle $x ($y + $offset)
            $candidate = Capture-Phase $handle $directory '03-selected.png'
            $selectedCapture = $candidate
            if ($candidate.hash -ne $catalogCapture.hash) { break }
        }
        $record.evidence.selected = $selectedCapture.file
        $record.evidence.selectedHash = $selectedCapture.hash
        $selectionVisualChange = Get-VisualChangeRate (Join-Path $directory $catalogCapture.file) (Join-Path $directory $selectedCapture.file)
        $record.evidence.selectionVisualChange = $selectionVisualChange
        if ($selectedCapture.hash -eq $catalogCapture.hash -or $selectionVisualChange -lt 0.05) { $record.status = 'selection-not-observed'; throw 'The catalog did not visibly transition into a game after the item click; coordinate or mouse delivery needs recalibration.' }
        $startedCapture = $null
        foreach ($baseY in @($StartButtonY, 390, 420, 470, 370)) {
            foreach ($offset in @(0, -4, 4, -8, 8)) {
                Click-And-Wait $handle $StartButtonX ($baseY + $offset)
                $candidate = Capture-Phase $handle $directory '04-started.png'
                $startedCapture = $candidate
                if ($candidate.hash -ne $selectedCapture.hash) { break }
            }
            if ($startedCapture.hash -ne $selectedCapture.hash) { break }
        }
        $record.evidence.started = $startedCapture.file
        $record.evidence.startedHash = $startedCapture.hash
        if ($startedCapture.hash -eq $selectedCapture.hash) { $record.status = 'start-transition-not-observed'; throw 'The selected image did not change after the Start click; start-button coordinates need recalibration.' }
        if ($CaptureRuntimeDelta) {
            Start-Sleep -Milliseconds $GameWaitMs
            $deltaDirectory = Join-Path $directory 'runtime-delta'
            $deltaOutput = & (Join-Path $PSScriptRoot 'capture-pk32-runtime-delta.ps1') -ProcessId $process.Id -BaselineManifest $runtimeBaseline -OutputDirectory $deltaDirectory -MaxCaptureMiB $MaxDeltaMiB
            if (-not $?) { throw 'Runtime delta collection failed.' }
            $deltaOutput | Set-Content -LiteralPath (Join-Path $deltaDirectory 'collector-output.json') -Encoding utf8
            $record.evidence.runtimeDelta = 'runtime-delta/manifest.json'
        }
        $record.window = [Pk32MouseBatchNative]::WindowInfo($handle).Split('|')
        $record.status = 'captured-unverified'
    } catch { $record.error = $_.Exception.Message } finally {
        $record.finishedAt = [DateTime]::UtcNow.ToString('o')
        $record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $directory 'record.json') -Encoding utf8
        if ($process -and -not $process.HasExited -and -not $KeepOpen) { Stop-Process -Id $process.Id -Force }
        $records += [PSCustomObject]$record
    }
}

$summary = [ordered]@{
    version = 1
    generatedAt = [DateTime]::UtcNow.ToString('o')
    executable = $fullExecutable
    requestedRange = "$($PositionOffset + $From)..$($PositionOffset + $To)"
    pageNumber = $PageNumber
    policy = [ordered]@{ selectionUsesMouse = $true; startsEachEntryFromFreshProcess = $true; namesAreNotInferred = $true; runtimeDeltaOptional = [bool]$CaptureRuntimeDelta; migrationStatusUnchanged = $true }
    records = $records
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $fullOutput 'run-summary.json') -Encoding utf8
$records | Group-Object status | Select-Object Name, Count | ConvertTo-Json
