param(
    [string]$Executable = 'E:\WorkSpace\tower-odyssey\output\pk32\Pk32.exe',
    [string]$OutputDirectory = 'output\pk32-reference\launcher-scan',
    [int]$LaunchWaitMs = 2200,
    [int]$SplashWaitMs = 3600,
    [int]$StepWaitMs = 650,
    [int]$MaximumEntries = 260,
    [int]$ScreenshotInterval = 20,
    [int]$MouseProbeX = 88,
    [int]$MouseProbeY = 24,
    [int]$StartButtonX = 157,
    [int]$StartButtonY = 201,
    [switch]$Run,
    [switch]$AllowDesktopInput,
    [switch]$KeepOpen,
    [switch]$MouseProbe,
    [switch]$StartProbe
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

function Resolve-ScannerPath([string]$Value) {
    if ([IO.Path]::IsPathRooted($Value)) { return [IO.Path]::GetFullPath($Value) }
    return [IO.Path]::GetFullPath((Join-Path $projectRoot $Value))
}

Add-Type -AssemblyName System.Drawing
$drawingAssembly = [System.Drawing.Bitmap].Assembly.Location
Add-Type -ReferencedAssemblies $drawingAssembly -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;

public static class Pk32LauncherNative {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    public sealed class WindowDetail {
        public long Handle { get; set; }
        public string Title { get; set; }
        public string ClassName { get; set; }
        public int Left { get; set; }
        public int Top { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
    }
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
    [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extraInfo);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int capacity);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int capacity);
    private static WindowDetail Describe(IntPtr hWnd) {
        RECT rect; GetWindowRect(hWnd, out rect);
        var title = new StringBuilder(1024); var className = new StringBuilder(256);
        GetWindowText(hWnd, title, title.Capacity); GetClassName(hWnd, className, className.Capacity);
        return new WindowDetail { Handle = hWnd.ToInt64(), Title = title.ToString(), ClassName = className.ToString(), Left = rect.Left, Top = rect.Top, Width = rect.Right - rect.Left, Height = rect.Bottom - rect.Top };
    }
    public static IntPtr FindVisibleWindow(int processId) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((hWnd, parameter) => {
            uint owner; GetWindowThreadProcessId(hWnd, out owner);
            RECT rect;
            if (owner == processId && IsWindowVisible(hWnd) && GetWindowRect(hWnd, out rect) && rect.Right - rect.Left >= 100 && rect.Bottom - rect.Top >= 100) { found = hWnd; return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }
    public static WindowDetail DescribeWindow(IntPtr hWnd) { return Describe(hWnd); }
    public static List<WindowDetail> ListChildren(IntPtr hWnd) {
        var result = new List<WindowDetail>();
        EnumChildWindows(hWnd, (child, parameter) => { result.Add(Describe(child)); return true; }, IntPtr.Zero);
        return result;
    }
    public static void Key(byte key) { keybd_event(key, 0, 0, UIntPtr.Zero); keybd_event(key, 0, 2, UIntPtr.Zero); }
    public static void Click(IntPtr hWnd, int relativeX, int relativeY) {
        RECT rect; if (!GetWindowRect(hWnd, out rect)) throw new Exception("GetWindowRect failed");
        int width = rect.Right - rect.Left, height = rect.Bottom - rect.Top;
        if (relativeX < 0 || relativeY < 0 || relativeX >= width || relativeY >= height) throw new Exception("Mouse probe coordinate is outside the PK32 window");
        SetForegroundWindow(hWnd);
        SetCursorPos(rect.Left + relativeX, rect.Top + relativeY);
        mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
        mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
    }
    public static void Capture(IntPtr hWnd, string path) {
        RECT rect; if (!GetWindowRect(hWnd, out rect)) throw new Exception("GetWindowRect failed");
        int width = rect.Right - rect.Left, height = rect.Bottom - rect.Top;
        if (width < 100 || height < 100) throw new Exception("PK32 visible window has no usable size");
        using (var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb)) using (var graphics = Graphics.FromImage(bitmap)) {
            graphics.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(width, height));
            bitmap.Save(path, ImageFormat.Png);
        }
    }
}
'@

if (-not $Run) {
    Write-Output 'Dry run only. Pass -Run -AllowDesktopInput to start PK32 once and scan its catalog.'
    exit 0
}
if (-not $AllowDesktopInput) {
    throw 'This scanner sends SPACE, HOME, and DOWN to the foreground PK32 window. Pass -AllowDesktopInput only while the desktop is free.'
}

$fullExecutable = Resolve-ScannerPath $Executable
$fullOutput = Resolve-ScannerPath $OutputDirectory
if (-not (Test-Path -LiteralPath $fullExecutable)) { throw "PK32 executable not found: $fullExecutable" }
if ($MaximumEntries -lt 1 -or $ScreenshotInterval -lt 1) { throw 'MaximumEntries and ScreenshotInterval must be positive.' }
[IO.Directory]::CreateDirectory($fullOutput) | Out-Null

function Wait-ForVisibleWindow([Diagnostics.Process]$Process, [int]$TimeoutMs) {
    $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
    while ([DateTime]::UtcNow -lt $deadline) {
        $Process.Refresh()
        $handle = [Pk32LauncherNative]::FindVisibleWindow($Process.Id)
        if ($handle -ne [IntPtr]::Zero) { return $handle }
        Start-Sleep -Milliseconds 100
    }
    return [IntPtr]::Zero
}

function Send-Key([byte]$Key) {
    [Pk32LauncherNative]::SetForegroundWindow($handle) | Out-Null
    [Pk32LauncherNative]::Key($Key)
    Start-Sleep -Milliseconds $StepWaitMs
}

function Send-MouseClick([IntPtr]$Handle, [int]$RelativeX, [int]$RelativeY) {
    [Pk32LauncherNative]::Click($Handle, $RelativeX, $RelativeY)
    Start-Sleep -Milliseconds $StepWaitMs
}

function Capture-And-Hash([IntPtr]$Handle, [string]$FileName) {
    $fullPath = Join-Path $fullOutput $FileName
    [Pk32LauncherNative]::Capture($Handle, $fullPath)
    return [PSCustomObject]@{ file = $FileName; hash = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash.ToLowerInvariant() }
}

$process = $null
$scanCompleted = $false
$sampledScreenshots = @()
try {
    $process = Start-Process -FilePath $fullExecutable -WorkingDirectory (Split-Path -Parent $fullExecutable) -PassThru
    $handle = Wait-ForVisibleWindow $process $LaunchWaitMs
    if ($handle -eq [IntPtr]::Zero) { throw 'No usable PK32 window appeared before timeout.' }
    [Pk32LauncherNative]::ShowWindow($handle, 9) | Out-Null
    [Pk32LauncherNative]::SetForegroundWindow($handle) | Out-Null
    Start-Sleep -Milliseconds $StepWaitMs
    $intro = Capture-And-Hash $handle '00-introduction.png'
    $sampledScreenshots += $intro.file

    # PK32 shows a timed author/version splash. Do not send catalog navigation
    # until that splash has had time to close on its own.
    Start-Sleep -Milliseconds $SplashWaitMs
    $afterSplash = Capture-And-Hash $handle '01-after-splash.png'
    $sampledScreenshots += $afterSplash.file
    if ($afterSplash.hash -eq $intro.hash) {
        Send-Key 0x20
        $afterSpace = Capture-And-Hash $handle '02-after-space.png'
        $sampledScreenshots += $afterSpace.file
        if ($afterSpace.hash -eq $intro.hash) {
            throw 'PK32 remained on the author/version splash after the startup wait and SPACE. The process has been left open for inspection; do not use this result as a catalog mapping.'
        }
        $catalog = $afterSpace
    } else {
        $catalog = $afterSplash
    }

    if ($MouseProbe) {
        $beforeProbe = Capture-And-Hash $handle '03-before-mouse-probe.png'
        $sampledScreenshots += $beforeProbe.file
        Send-MouseClick $handle $MouseProbeX $MouseProbeY
        $afterProbe = Capture-And-Hash $handle '04-after-mouse-probe.png'
        $sampledScreenshots += $afterProbe.file
        $afterStart = $null
        if ($StartProbe) {
            Send-MouseClick $handle $StartButtonX $StartButtonY
            $afterStart = Capture-And-Hash $handle '05-after-start-probe.png'
            $sampledScreenshots += $afterStart.file
        }
        $probe = [ordered]@{
            version = 1
            generatedAt = [DateTime]::UtcNow.ToString('o')
            executable = $fullExecutable
            mode = if ($StartProbe) { 'mouse-selection-and-start-probe' } else { 'mouse-selection-probe' }
            window = [Pk32LauncherNative]::DescribeWindow($handle)
            policy = [ordered]@{
                startsPk32Once = $true
                clicksOneCatalogCoordinate = $true
                clicksStartOnlyWhenRequested = [bool]$StartProbe
                doesNotSendKeyboardNavigation = $true
                doesNotChangeMigrationStatus = $true
            }
            startup = [ordered]@{ introductionScreenshot = $intro.file; splashWaitMs = $SplashWaitMs; catalogScreenshot = $beforeProbe.file }
            probe = [ordered]@{
                relativeX = $MouseProbeX
                relativeY = $MouseProbeY
                beforeScreenshot = $beforeProbe.file
                afterScreenshot = $afterProbe.file
                screenChanged = ($beforeProbe.hash -ne $afterProbe.hash)
                beforeHash = $beforeProbe.hash
                afterHash = $afterProbe.hash
            }
            startProbe = if ($StartProbe) { [ordered]@{
                relativeX = $StartButtonX
                relativeY = $StartButtonY
                afterScreenshot = $afterStart.file
                screenChanged = ($afterProbe.hash -ne $afterStart.hash)
                afterHash = $afterStart.hash
            } } else { $null }
            summary = [ordered]@{ observedPositions = 1; stopReason = 'mouse-probe-completed'; sampledScreenshots = $sampledScreenshots }
        }
        $probe | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $fullOutput 'launcher-catalog.json') -Encoding utf8
        $probe.summary | ConvertTo-Json -Depth 4
        $scanCompleted = $true
        return
    }

    Send-Key 0x24
    $catalog = Capture-And-Hash $handle '03-catalog-first.png'
    $sampledScreenshots += $catalog.file
    $children = @([Pk32LauncherNative]::ListChildren($handle))
    $visibleText = @($children | Where-Object { $_.Title -and $_.Title.Trim().Length -gt 0 } | Select-Object Handle, Title, ClassName, Left, Top, Width, Height)

    $positions = @()
    $seenHashes = @{}
    $seenHashes[$catalog.hash] = 1
    for ($position = 1; $position -le $MaximumEntries; $position++) {
        if ($position -eq 1) {
            $snapshot = $catalog
        } else {
            Send-Key 0x28
            $temporary = Capture-And-Hash $handle '.probe.png'
            $snapshot = $temporary
        }
        $isRepeated = $position -gt 1 -and $seenHashes.ContainsKey($snapshot.hash)
        $positions += [PSCustomObject]@{
            uiPosition = $position
            screenshotHash = $snapshot.hash
            repeatedPriorPosition = if ($isRepeated) { $seenHashes[$snapshot.hash] } else { $null }
        }
        if ($position -eq 1 -or ($position % $ScreenshotInterval -eq 0) -or $isRepeated -or $position -eq $MaximumEntries) {
            if ($position -gt 1) {
                $positionScreenshot = ("position-{0:D3}.png" -f $position)
                Copy-Item -LiteralPath (Join-Path $fullOutput '.probe.png') -Destination (Join-Path $fullOutput $positionScreenshot) -Force
                $sampledScreenshots += $positionScreenshot
            }
        }
        if ($position -gt 1) { Remove-Item -LiteralPath (Join-Path $fullOutput '.probe.png') -Force }
        if ($isRepeated) { break }
        $seenHashes[$snapshot.hash] = $position
    }
    $scan = [ordered]@{
        version = 1
        generatedAt = [DateTime]::UtcNow.ToString('o')
        executable = $fullExecutable
        window = [Pk32LauncherNative]::DescribeWindow($handle)
        policy = [ordered]@{
            startsPk32Once = $true
            doesNotEnterGames = $true
            screenshotsAreSampled = $true
            namesRequireWindowTextOrOcr = $true
            doesNotChangeMigrationStatus = $true
        }
        startup = [ordered]@{ introductionScreenshot = $intro.file; splashWaitMs = $SplashWaitMs; afterSplashScreenshot = $afterSplash.file; catalogFirstScreenshot = $catalog.file; catalogFirstHash = $catalog.hash; entryAction = 'timed-splash-then-HOME' }
        childWindows = $children
        visibleChildText = $visibleText
        positionScan = $positions
        summary = [ordered]@{
            observedPositions = $positions.Count
            stopReason = if ($positions[-1].repeatedPriorPosition) { 'repeated-screen-hash' } elseif ($positions.Count -ge $MaximumEntries) { 'maximum-entry-limit' } else { 'unknown' }
            directTextAvailable = $visibleText.Count -gt 0
            sampledScreenshots = $sampledScreenshots
        }
    }
    $scan | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $fullOutput 'launcher-catalog.json') -Encoding utf8
    $scan.summary | ConvertTo-Json -Depth 4
    $scanCompleted = $true
} finally {
    if ($process -and -not $process.HasExited -and -not $KeepOpen -and $scanCompleted) { Stop-Process -Id $process.Id -Force }
}
