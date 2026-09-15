param(
    [int]$ProcessId,
    [string]$OutputDirectory = 'output/pk32-reference/runtime-regions'
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;

public static class Pk32RuntimeDump {
    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryBasicInformation {
        public IntPtr BaseAddress;
        public IntPtr AllocationBase;
        public uint AllocationProtect;
        public UIntPtr RegionSize;
        public uint State;
        public uint Protect;
        public uint Type;
    }

    public sealed class Region {
        public long BaseAddress { get; set; }
        public long Size { get; set; }
        public uint Protect { get; set; }
        public uint Type { get; set; }
        public string File { get; set; }
        public long BytesRead { get; set; }
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inherit, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] data, int size, out IntPtr read);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern UIntPtr VirtualQueryEx(IntPtr process, IntPtr address, out MemoryBasicInformation information, UIntPtr length);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    public static Region[] Dump(int processId, string outputDirectory) {
        const uint QueryInformation = 0x0400;
        const uint VirtualMemoryRead = 0x0010;
        const uint Committed = 0x1000;
        const uint Guard = 0x100;
        const uint NoAccess = 0x01;
        const long MaximumAddress = 0x80000000L;
        const long MaximumRegionSize = 256L * 1024 * 1024;

        Directory.CreateDirectory(outputDirectory);
        IntPtr process = OpenProcess(QueryInformation | VirtualMemoryRead, false, processId);
        if (process == IntPtr.Zero) throw new InvalidOperationException("Read-only process access was denied.");

        var result = new List<Region>();
        try {
            long address = 0x10000;
            int structureSize = Marshal.SizeOf(typeof(MemoryBasicInformation));
            while (address < MaximumAddress) {
                MemoryBasicInformation information;
                UIntPtr queried = VirtualQueryEx(process, new IntPtr(address), out information, new UIntPtr((uint)structureSize));
                if (queried == UIntPtr.Zero) break;

                long baseAddress = information.BaseAddress.ToInt64();
                long size = checked((long)information.RegionSize.ToUInt64());
                long nextAddress = baseAddress + Math.Max(size, 0x1000);
                bool readable = information.State == Committed &&
                    (information.Protect & Guard) == 0 &&
                    (information.Protect & NoAccess) == 0 &&
                    size > 0 && size <= MaximumRegionSize;

                if (readable) {
                    byte[] data = new byte[(int)size];
                    IntPtr bytesRead;
                    if (ReadProcessMemory(process, information.BaseAddress, data, data.Length, out bytesRead) && bytesRead.ToInt64() > 0) {
                        int count = checked((int)bytesRead.ToInt64());
                        string name = string.Format("{0:x8}-{1:x8}.bin", baseAddress, count);
                        string file = Path.Combine(outputDirectory, name);
                        if (count == data.Length) File.WriteAllBytes(file, data);
                        else {
                            byte[] partial = new byte[count];
                            Buffer.BlockCopy(data, 0, partial, 0, count);
                            File.WriteAllBytes(file, partial);
                        }
                        result.Add(new Region {
                            BaseAddress = baseAddress,
                            Size = size,
                            Protect = information.Protect,
                            Type = information.Type,
                            File = name,
                            BytesRead = count
                        });
                    }
                }

                if (nextAddress <= address) break;
                address = nextAddress;
            }
        } finally {
            CloseHandle(process);
        }
        return result.ToArray();
    }
}
'@

$fullOutput = [IO.Path]::GetFullPath($OutputDirectory)
$regions = [Pk32RuntimeDump]::Dump($ProcessId, $fullOutput)
$summary = [PSCustomObject]@{
    ProcessId = $ProcessId
    OutputDirectory = $fullOutput
    RegionCount = $regions.Count
    TotalBytes = ($regions | Measure-Object -Property BytesRead -Sum).Sum
    Regions = $regions
}
$summary | ConvertTo-Json -Depth 4
