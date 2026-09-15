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
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    public static void Capture(IntPtr hWnd, string path) {
        RECT r; if (!GetWindowRect(hWnd, out r)) throw new Exception("GetWindowRect failed");
        int w = Math.Max(1, r.Right - r.Left), h = Math.Max(1, r.Bottom - r.Top); if (w < 10 || h < 10) throw new Exception("PK32 window has no usable client size");
        using (var bitmap = new Bitmap(w, h, PixelFormat.Format32bppArgb)) using (var graphics = Graphics.FromImage(bitmap)) {
            IntPtr dc = graphics.GetHdc(); try { if (!PrintWindow(hWnd, dc, 2) && !PrintWindow(hWnd, dc, 0)) throw new Exception("PrintWindow failed"); } finally { graphics.ReleaseHdc(dc); }
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
    [Pk32WindowCapture]::MoveWindow($handle, 80, 80, 960, 720, $true) | Out-Null
    [Pk32WindowCapture]::Capture($handle, $full)
} finally {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
}
