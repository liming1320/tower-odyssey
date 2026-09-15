param(
    [int]$ProcessId
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class Pk32WindowEnumerator {
    [StructLayout(LayoutKind.Sequential)]
    public struct Rect {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public delegate bool EnumWindowProc(IntPtr handle, IntPtr parameter);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowProc callback, IntPtr parameter);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr handle);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr handle, out Rect rect);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr handle, StringBuilder text, int capacity);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr handle, StringBuilder text, int capacity);
}
'@

$windows = [System.Collections.Generic.List[object]]::new()
$callback = [Pk32WindowEnumerator+EnumWindowProc] {
    param([IntPtr]$handle, [IntPtr]$parameter)

    [uint32]$ownerId = 0
    [Pk32WindowEnumerator]::GetWindowThreadProcessId($handle, [ref]$ownerId) | Out-Null
    if ($ownerId -eq $ProcessId) {
        $title = [Text.StringBuilder]::new(512)
        $className = [Text.StringBuilder]::new(256)
        $rect = New-Object Pk32WindowEnumerator+Rect
        [Pk32WindowEnumerator]::GetWindowText($handle, $title, $title.Capacity) | Out-Null
        [Pk32WindowEnumerator]::GetClassName($handle, $className, $className.Capacity) | Out-Null
        [Pk32WindowEnumerator]::GetWindowRect($handle, [ref]$rect) | Out-Null
        $windows.Add([PSCustomObject]@{
            Handle = $handle.ToInt64()
            Visible = [Pk32WindowEnumerator]::IsWindowVisible($handle)
            Title = $title.ToString()
            Class = $className.ToString()
            Left = $rect.Left
            Top = $rect.Top
            Width = $rect.Right - $rect.Left
            Height = $rect.Bottom - $rect.Top
        })
    }
    return $true
}

[Pk32WindowEnumerator]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
$windows | ConvertTo-Json -Depth 3
