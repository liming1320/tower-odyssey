param(
    [string]$Executable = 'E:\WorkSpace\tower-odyssey\output\pk32\Pk32.exe',
    [string]$Plan = 'output\pk32-reference\capture-plan.json',
    [string]$OutputDirectory = 'output\pk32-reference\runtime-captures',
    [int]$From = 1,
    [int]$To = 213,
    [int]$LaunchWaitMs = 1800,
    [int]$StepWaitMs = 240,
    [switch]$Run,
    [switch]$AllowDesktopInput,
    [switch]$CaptureMemory
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

function Resolve-CollectorPath([string]$Value) {
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

public static class Pk32BatchNative {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extraInfo);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int capacity);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int capacity);
    public static void Key(byte key) {
        keybd_event(key, 0, 0, UIntPtr.Zero);
        keybd_event(key, 0, 2, UIntPtr.Zero);
    }
    public static IntPtr FindVisibleWindow(int processId) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((hWnd, parameter) => {
            uint ownerProcessId; GetWindowThreadProcessId(hWnd, out ownerProcessId);
            RECT rect;
            bool usable = ownerProcessId == processId && IsWindowVisible(hWnd) && GetWindowRect(hWnd, out rect) &&
                rect.Right - rect.Left >= 100 && rect.Bottom - rect.Top >= 100;
            if (usable) { found = hWnd; return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }
    public static void Capture(IntPtr hWnd, string path) {
        RECT rect; if (!GetWindowRect(hWnd, out rect)) throw new Exception("GetWindowRect failed");
        int width = Math.Max(1, rect.Right - rect.Left), height = Math.Max(1, rect.Bottom - rect.Top);
        if (width < 100 || height < 100) throw new Exception("PK32 visible window has no usable size");
        using (var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb)) using (var graphics = Graphics.FromImage(bitmap)) {
            graphics.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(width, height));
            bitmap.Save(path, ImageFormat.Png);
        }
    }
    public static object WindowInfo(IntPtr hWnd) {
        RECT rect; GetWindowRect(hWnd, out rect);
        var title = new StringBuilder(512); var className = new StringBuilder(256);
        GetWindowText(hWnd, title, title.Capacity); GetClassName(hWnd, className, className.Capacity);
        return new { handle = hWnd.ToInt64(), title = title.ToString(), className = className.ToString(), left = rect.Left, top = rect.Top, width = rect.Right - rect.Left, height = rect.Bottom - rect.Top };
    }
}
'@

if (-not $Run) {
    Write-Output 'Dry run only. Pass -Run -AllowDesktopInput after checking capture-plan.json and running one-game calibration.'
    exit 0
}
if (-not $AllowDesktopInput) {
    throw 'This collector sends keyboard input to the foreground PK32 window. Pass -AllowDesktopInput only while the desktop is free.'
}

$fullExecutable = Resolve-CollectorPath $Executable
$fullPlan = Resolve-CollectorPath $Plan
$fullOutput = Resolve-CollectorPath $OutputDirectory
if (-not (Test-Path -LiteralPath $fullExecutable)) { throw "PK32 executable not found: $fullExecutable" }
if (-not (Test-Path -LiteralPath $fullPlan)) { throw "Capture plan not found: $fullPlan. Run npm run pk32:capture-plan first." }

function Wait-ForWindow([Diagnostics.Process]$Process, [int]$TimeoutMs) {
    $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
    while ([DateTime]::UtcNow -lt $deadline) {
        $Process.Refresh()
        $handle = [Pk32BatchNative]::FindVisibleWindow($Process.Id)
        if ($handle -ne [IntPtr]::Zero) { return $handle }
        Start-Sleep -Milliseconds 100
    }
    return [IntPtr]::Zero
}

function Send-Key([byte]$Key, [int]$WaitMs) {
    [Pk32BatchNative]::Key($Key)
    Start-Sleep -Milliseconds $WaitMs
}

function Capture-Phase([IntPtr]$Handle, [string]$Directory, [string]$Phase, [int]$Sequence) {
    $image = Join-Path $Directory ("{0:D2}-{1}.png" -f $Sequence, $Phase)
    [Pk32BatchNative]::Capture($Handle, $image)
    return [IO.Path]::GetFileName($image)
}

$jobExporter = Join-Path $projectRoot 'tools\export-pk32-capture-jobs.js'
$games = @(& node $jobExporter --from $From --to $To | ConvertFrom-Csv -Delimiter "`t")
if ($LASTEXITCODE -ne 0 -or $games.Count -eq 0) { throw "Could not build PK32 capture jobs for range $From..$To." }
foreach ($game in $games) {
    $game | Add-Member -NotePropertyName gameName -NotePropertyValue ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($game.nameBase64)))
}
[IO.Directory]::CreateDirectory($fullOutput) | Out-Null

$runSummary = [ordered]@{
    version = 1
    startedAt = [DateTime]::UtcNow.ToString('o')
    executable = $fullExecutable
    plan = $fullPlan
    requestedRange = "$From..$To"
    captureMemory = [bool]$CaptureMemory
    selectionWarning = 'home-then-down-index-then-enter is unverified until capture screenshots are reviewed'
    records = @()
}

foreach ($game in $games) {
    $safeId = ('{0:D3}-{1}' -f [int]$game.catalogIndex, ($game.id -replace '[^A-Za-z0-9._-]', '_'))
    $gameDirectory = Join-Path $fullOutput $safeId
    [IO.Directory]::CreateDirectory($gameDirectory) | Out-Null
    $record = [ordered]@{
        gameId = $game.id
        gameName = $game.gameName
        catalogIndex = $game.catalogIndex
        moduleCandidate = $game.moduleCandidate
        selection = [ordered]@{
            strategy = 'home-then-down-index-then-enter'
            downCount = [int]$game.downCount
            confidence = 'unverified'
            warning = 'The PK32 launcher navigation must be calibrated against screenshots before this can be treated as a game-to-module binding.'
        }
        startedAt = [DateTime]::UtcNow.ToString('o')
        status = 'failed'
        captures = [ordered]@{}
        inputs = @('HOME')
        error = $null
    }
    $process = $null
    try {
        $process = Start-Process -FilePath $fullExecutable -WorkingDirectory (Split-Path -Parent $fullExecutable) -PassThru
        $handle = Wait-ForWindow $process $LaunchWaitMs
        if ($handle -eq [IntPtr]::Zero) { throw 'PK32 main window did not appear before timeout.' }
        [Pk32BatchNative]::ShowWindow($handle, 9) | Out-Null
        [Pk32BatchNative]::SetForegroundWindow($handle) | Out-Null
        Start-Sleep -Milliseconds $StepWaitMs
        $record.captures.launcher = Capture-Phase $handle $gameDirectory 'launcher' 1

        Send-Key 0x24 $StepWaitMs
        for ($step = 0; $step -lt [int]$game.downCount; $step++) { Send-Key 0x28 $StepWaitMs }
        $record.inputs += "DOWN x $($game.downCount)"
        $record.captures.selected = Capture-Phase $handle $gameDirectory 'selected' 2

        Send-Key 0x0D ($StepWaitMs * 2)
        $record.inputs += 'ENTER'
        $record.captures.started = Capture-Phase $handle $gameDirectory 'started' 3

        foreach ($key in @(0x25, 0x26, 0x27, 0x28, 0x20)) { Send-Key $key $StepWaitMs }
        $record.inputs += @('LEFT', 'UP', 'RIGHT', 'DOWN', 'SPACE')
        $record.captures.afterInput = Capture-Phase $handle $gameDirectory 'after-input' 4

        if ($CaptureMemory) {
            & (Join-Path $PSScriptRoot 'dump-pk32-runtime.ps1') -ProcessId $process.Id -OutputDirectory (Join-Path $gameDirectory 'memory') | Out-File -LiteralPath (Join-Path $gameDirectory 'memory-summary.json') -Encoding utf8
        }
        $record.window = [Pk32BatchNative]::WindowInfo($handle)
        $record.status = 'captured-unverified'
    } catch {
        $record.error = $_.Exception.Message
    } finally {
        $record.finishedAt = [DateTime]::UtcNow.ToString('o')
        $record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $gameDirectory 'record.json') -Encoding utf8
        if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
        $runSummary.records += [PSCustomObject]$record
    }
}

$runSummary.finishedAt = [DateTime]::UtcNow.ToString('o')
$runSummary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $fullOutput 'run-summary.json') -Encoding utf8
$runSummary.records | Group-Object status | Select-Object Name, Count | ConvertTo-Json
