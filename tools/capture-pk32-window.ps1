param(
    [string]$Executable = 'F:\BaiduNetdiskDownload\pk32\Pk32.exe',
    [string]$Output = 'output/pk32-reference/pk32-window.png'
)
$ErrorActionPreference = 'Stop'
Add-Type -Path 'C:\Users\li\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\System.Drawing.Common.dll'
Add-Type -ReferencedAssemblies @('C:\Users\li\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\System.Drawing.Common.dll', 'C:\Users\li\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\System.Private.Windows.GdiPlus.dll', 'C:\Users\li\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\System.Private.Windows.Core.dll') -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class Pk32WindowCapture {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int width, int height, bool repaint);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    private static bool IsBlank(Bitmap bitmap) {
        int nonBlack = 0;
        int xStep = Math.Max(1, bitmap.Width / 32), yStep = Math.Max(1, bitmap.Height / 32);
        for (int y = 0; y < bitmap.Height; y += yStep) for (int x = 0; x < bitmap.Width; x += xStep) {
            Color pixel = bitmap.GetPixel(x, y);
            if (pixel.R > 3 || pixel.G > 3 || pixel.B > 3) nonBlack++;
        }
        return nonBlack < 4;
    }
    public static void Capture(IntPtr hWnd, string path) {
        RECT r; if (!GetWindowRect(hWnd, out r)) throw new Exception("GetWindowRect failed");
        int w = Math.Max(1, r.Right - r.Left), h = Math.Max(1, r.Bottom - r.Top); if (w < 10 || h < 10) throw new Exception("PK32 window has no usable client size");
        using (var bitmap = new Bitmap(w, h, PixelFormat.Format32bppArgb)) using (var graphics = Graphics.FromImage(bitmap)) {
            IntPtr dc = graphics.GetHdc(); bool captured;
            try { captured = PrintWindow(hWnd, dc, 2) || PrintWindow(hWnd, dc, 0); } finally { graphics.ReleaseHdc(dc); }
            if (!captured || IsBlank(bitmap)) graphics.CopyFromScreen(r.Left, r.Top, 0, 0, new Size(w, h), CopyPixelOperation.SourceCopy);
            bitmap.Save(path, ImageFormat.Png);
        }
    }
}
'@
$process = Start-Process -FilePath $Executable -WorkingDirectory (Split-Path -Parent $Executable) -PassThru
try {
    $handle = [IntPtr]::Zero
    for ($i = 0; $i -lt 40 -and $handle -eq [IntPtr]::Zero; $i++) {
        Start-Sleep -Milliseconds 250
        $process.Refresh()
        $handle = $process.MainWindowHandle
    }
    if ($handle -eq [IntPtr]::Zero) { throw 'PK32 window was not found' }
    $full = [IO.Path]::GetFullPath($Output)
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($full)) | Out-Null
    [Pk32WindowCapture]::ShowWindow($handle, 9) | Out-Null
    [Pk32WindowCapture]::MoveWindow($handle, 80, 80, 960, 720, $true) | Out-Null
    [Pk32WindowCapture]::SetForegroundWindow($handle) | Out-Null
    Start-Sleep -Milliseconds 500
    [Pk32WindowCapture]::Capture($handle, $full)
} finally {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
}
