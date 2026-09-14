# -*- coding: utf-8 -*-
"""
VB5 / VB6 P-CODE disassembler pipeline (Python 3, zero third-party deps).

Ported from SekoiaLab/pe-tools (Python 2):
  - peparser.PeParser  -> minimal PE reader that rebuilds a FLAT memory image
                         (RVA == offset) so the original vbparser can index
                         `pe.mapped[rva]` unchanged.
  - vbparser.VbParser  -> full VB5 header / ProjectInfo / ObjectTable /
                         TObject / ProcDscInfo traversal (print->print(),
                         xrange->range, bytes fixes).
  - pcodes.PcodeDecoder-> p-code opcode disassembly from vb_opcodes.csv.

The distorm3 dependency (only used to locate the VB header via entry-point
disassembly) is replaced by a direct 'VB5!' signature scan on the flat image.

Usage:
    python tools/vb5-pcode-dump.py [module.bin] [outdir]

Defaults:
    module.bin = output/pk32-reference/module.bin
    outdir     = output/pk32-reference/pcode
"""
import os
import sys
import struct
import csv

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_BIN = os.path.join(HERE, "..", "output", "pk32-reference", "module.bin")
DEFAULT_OUT = os.path.join(HERE, "..", "output", "pk32-reference", "pcode")
OPCODE_CSV = os.path.join(HERE, "vb_opcodes.csv")

IMAGE_DOS_SIGNATURE = 0x5A4D
IMAGE_NT_SIGNATURE = 0x00004550
sizeof_IMAGE_FILE_HEADER = 20
sizeof_IMAGE_SECTION_HEADER = 40


# --------------------------------------------------------------------------- #
# Minimal PE reader -> flat memory image
# --------------------------------------------------------------------------- #
class PEReader(object):
    def __init__(self, path):
        with open(path, "rb") as f:
            self.raw = f.read()
        self.image = None          # flat image: offset == RVA
        self.ImageBase = 0x400000
        self.SizeOfImage = 0
        self.sections = []
        self._parse()

    def _parse(self):
        raw = self.raw
        if raw[:2] != b"MZ":
            raise ValueError("not a PE file (no MZ)")
        e_lfanew = struct.unpack("<L", raw[0x3C:0x40])[0]
        if struct.unpack("<L", raw[e_lfanew:e_lfanew + 4])[0] != IMAGE_NT_SIGNATURE:
            raise ValueError("not a PE file (no PE\\0\\0)")
        fh_off = e_lfanew + 4
        (Machine, NumberOfSections, TimeDateStamp, PointerToSymbolTable,
         NumberOfSymbols, SizeOfOptionalHeader, Characteristics) = struct.unpack(
            "<HHLLLHH", raw[fh_off:fh_off + sizeof_IMAGE_FILE_HEADER])
        oh_off = fh_off + sizeof_IMAGE_FILE_HEADER
        Magic = struct.unpack("<H", raw[oh_off:oh_off + 2])[0]
        if Magic != 0x10B:
            raise ValueError("not a 32-bit PE (Magic=0x%X)" % Magic)
        # Optional header: parse just what we need.
        # Skip: Magic(2) MajorLinker(1) MinorLinker(1) SizeOfCode(4)
        #       SizeOfInitializedData(4) SizeOfUninitializedData(4)
        #       AddressOfEntryPoint(4) BaseOfCode(4) BaseOfData(4) ImageBase(4)
        #       ... we jump to ImageBase at offset 30 from oh start.
        ImageBase = struct.unpack("<L", raw[oh_off + 28:oh_off + 32])[0]
        # SectionAlignment(4) FileAlignment(4) ... SizeOfImage at +56 from oh start
        SizeOfImage = struct.unpack("<L", raw[oh_off + 56:oh_off + 60])[0]
        self.ImageBase = ImageBase
        self.SizeOfImage = SizeOfImage
        sec_off = oh_off + SizeOfOptionalHeader
        for i in range(NumberOfSections):
            base = sec_off + i * sizeof_IMAGE_SECTION_HEADER
            (Name, VirtualSize, VirtualAddress, SizeOfRawData,
             PointerToRawData, _, _, _, _, _) = struct.unpack(
                "<8sLLLLLLHHL", raw[base:base + sizeof_IMAGE_SECTION_HEADER])
            self.sections.append({
                "name": Name.split(b"\0", 1)[0].decode("latin1", "replace"),
                "vsize": VirtualSize,
                "vaddr": VirtualAddress,
                "rawsize": SizeOfRawData,
                "rawptr": PointerToRawData,
            })

    def build_flat_image(self):
        """module.bin is a flat memory dump: file offset == RVA (VA - ImageBase).

        So the raw bytes already satisfy `image[rva] == byte at file offset rva`.
        No section reconstruction is needed; we just use the raw file and convert
        any absolute VA pointer via (va - ImageBase) to obtain an rva/file offset.
        """
        self.image = self.raw
        return self.image


# --------------------------------------------------------------------------- #
# P-code decoder (from pe-tools/pcodes.py)
# --------------------------------------------------------------------------- #
class PcodeDecoder(object):
    def __init__(self, csv_path=OPCODE_CSV):
        self.db = {}
        with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.reader(f, delimiter="@", quotechar='"')
            primary = {}
            docs = []
            for row in reader:
                if len(row) < 3:
                    continue
                try:
                    op = int(row[0], 16)
                except ValueError:
                    continue
                if row[2] != "DOC":
                    try:
                        primary[op] = (row[2], int(row[1], 16))
                    except ValueError:
                        primary[op] = (row[2], 0)
                else:
                    try:
                        docs.append((op, int(row[1], 16)))
                    except ValueError:
                        continue
            for op, target in docs:
                if target in primary:
                    self.db[op] = primary[target]
                # else: dangling alias, skip
            for op, val in primary.items():
                self.db[op] = val

    def decode(self, data):
        """Yield (offset, name, consumed, raw_bytes) for each p-code."""
        out = []
        off = 0
        n = len(data)
        while off < n:
            remain = n - off
            if remain < 1:
                break
            length = 1
            index = data[off]
            if index > 0xFA:
                if remain < 2:
                    out.append((off, "TRUNCATED", remain, data[off:]))
                    break
                length = 2
                index = struct.unpack(">H", data[off:off + 2])[0]
            if index not in self.db:
                out.append((off, "UNKNOWN_0x%02X" % index, 1, data[off:off + 1]))
                break
            name, size = self.db[index]
            if size == -1:
                if off + length + 2 > n:
                    out.append((off, name, remain, data[off:]))
                    break
                varlen = struct.unpack("<H", data[off + length:off + length + 2])[0]
                consumed = length + 2 + varlen
            else:
                consumed = length + size
            if off + consumed > n:
                consumed = n - off
            out.append((off, name, consumed, data[off:off + consumed]))
            off += consumed
        return out


# --------------------------------------------------------------------------- #
# VB5 structure traversal (ported from pe-tools/vbparser.py)
# --------------------------------------------------------------------------- #
def cstr_at(image, rva):
    if rva < 0 or rva >= len(image):
        return ""
    end = image.find(b"\0", rva)
    if end == -1:
        end = len(image)
    try:
        return image[rva:end].decode("gb18030", "replace")
    except Exception:
        return image[rva:end].decode("latin1", "replace")


class VbHeader(object):
    FMT = "<4sH14s14sHLLLLLLLLHHLLLLLLLL"

    def __init__(self, image, offset, image_base):
        self.image = image
        self.offset = offset
        self.image_base = image_base
        h = struct.unpack(self.FMT, image[offset:offset + 104])
        self.Signature = h[0]
        self.RuntimeBuild = h[1]
        self.LanguageDLL = h[2].split(b"\0", 1)[0].decode("latin1", "replace")
        self.BackupLanguageDLL = h[3].split(b"\0", 1)[0].decode("latin1", "replace")
        self.RuntimeDLLVersion = h[4]
        self.LanguageID = h[5]
        self.BackupLanguageID = h[6]
        self.aSubMain = h[7]
        self.aProjectInfo = h[8]
        self.fMDLIntObjs = h[9]
        self.fMDLIntObjs2 = h[10]
        self.ThreadFlags = h[11]
        self.ThreadCount = h[12]
        self.FormCount = h[13]
        self.ExternalComponentCount = h[14]
        self.ThunkCount = h[15]
        self.aGUITable = h[16]
        self.aExternalComponentTable = h[17]
        self.aComRegisterData = h[18]
        self.oProjectExename = cstr_at(image, offset + h[19])
        self.oProjectTitle = cstr_at(image, offset + h[20])
        self.oHelpFile = cstr_at(image, offset + h[21])
        self.oProjectName = cstr_at(image, offset + h[22])


class ProjectInfo(object):
    FMT = "<LLLLLLLLL528sLL"

    def __init__(self, image, offset, image_base):
        self.image = image
        self.offset = offset
        self.image_base = image_base
        h = struct.unpack(self.FMT, image[offset:offset + 572])
        self.lTemplateVersion = h[0]
        self.aObjectTable = h[1]
        self.lNull1 = h[2]
        self.aStartOfCode = h[3]
        self.aEndOfCode = h[4]
        self.lDataBufferSize = h[5]
        self.aThreadSpace = h[6]
        self.aVBAExceptionhandler = h[7]
        self.aNativeCode = h[8]
        self.IdentifierStr_char = h[9]
        self.aExternalTable = h[10]
        self.lExternalCount = h[11]
        self.objectTable = ObjectTable(
            image, self.aObjectTable - image_base, image_base)


class ObjectTable(object):
    FMT = "<LLLLLLLLLLHHHHLLLLLLLLL"

    def __init__(self, image, offset, image_base):
        self.image = image
        self.offset = offset
        self.image_base = image_base
        h = struct.unpack(self.FMT, image[offset:offset + 84])
        self.lNull1 = h[0]
        self.aExecProj = h[1]
        self.aProjectInfo2 = h[2]
        self.lConst1 = h[3]
        self.lNull2 = h[4]
        self.aProjectObject = h[5]
        self.uuidObjectTable = h[6]
        self.Flag2 = h[7]
        self.Flag3 = h[8]
        self.Flag4 = h[9]
        self.fCompileType = h[10]
        self.iObjectsCount = h[11]
        self.iCompiledObjects = h[12]
        self.iObjectsInUse = h[13]
        self.aObjectsArray = h[14]
        self.lNull3 = h[15]
        self.lNull4 = h[16]
        self.lNull5 = h[17]
        self.aNTSProjectName = h[18]
        self.lLcID1 = h[19]
        self.lLcID2 = h[20]
        self.lNull6 = h[21]
        self.lTemplateVersion = h[22]
        self.objects = []
        for i in range(self.iObjectsCount):
            obj = TObject(image,
                          self.aObjectsArray + i * 48 - image_base,
                          image_base)
            self.objects.append(obj)


class TObject(object):
    FMT = "<LLLLLLLLLLLL"

    def __init__(self, image, offset, image_base):
        self.image = image
        self.offset = offset
        self.image_base = image_base
        h = struct.unpack(self.FMT, image[offset:offset + 48])
        self.aObjectInfo = h[0]
        self.lConst1 = h[1]
        self.aPublicBytes = h[2]
        self.aStaticBytes = h[3]
        self.aModulePublic = h[4]
        self.aModuleStatic = h[5]
        name_off = h[6] - image_base
        self.aNTSObjectName = cstr_at(image, name_off)
        self.lMethodCount = h[7]
        self.aMethodNameTable = h[8]
        self.oStaticVars = h[9]
        self.lObjectType = h[10]
        self.lNull2 = h[11]
        self.tObjectInfo = TObjectInfo(
            image, self.aObjectInfo - image_base, image_base)
        self.methods = []
        lpMethods = self.tObjectInfo.lpMethods
        name_table = self.aMethodNameTable
        for i in range(self.tObjectInfo.wMethodCount):
            addr = lpMethods - image_base + i * 4
            if addr < 0 or addr + 4 > len(image):
                continue
            proc_va = struct.unpack("<L", image[addr:addr + 4])[0]
            mname = ""
            if name_table:
                naddr = name_table - image_base + i * 4
                if 0 <= naddr and naddr + 4 <= len(image):
                    np_va = struct.unpack("<L", image[naddr:naddr + 4])[0]
                    mname = cstr_at(image, np_va - image_base)
            if image_base < proc_va < 0x500000:
                proc = ProcDscInfo(image, proc_va - image_base, image_base)
                proc.name = mname
                self.methods.append(proc)
            else:
                # external / alias method, record name only
                self.methods.append({"name": mname, "external": True,
                                     "va": proc_va})


class TObjectInfo(object):
    FMT = "<HHLLLLLLLHHLHHLLL"

    def __init__(self, image, offset, image_base):
        self.image = image
        h = struct.unpack(self.FMT, image[offset:offset + 56])
        self.wRefCount = h[0]
        self.wObjectIndex = h[1]
        self.lpObjectTable = h[2]
        self.lpIdeData = h[3]
        self.lpPrivateObject = h[4]
        self.dwReserved = h[5]
        self.dwNull = h[6]
        self.lpObject = h[7]
        self.lpProjectData = h[8]
        self.wMethodCount = h[9]
        self.wMethodCount2 = h[10]
        self.lpMethods = h[11]
        self.wConstants = h[12]
        self.wMaxConstants = h[13]
        self.lpIdeData2 = h[14]
        self.lpIdeData3 = h[15]
        self.lpConstants = h[16]


class ProcDscInfo(object):
    FMT = "<LHHH"

    def __init__(self, image, offset, image_base):
        self.image = image
        self.offset = offset
        self.image_base = image_base
        self.ProcAddress = offset + image_base
        self.name = ""
        h = struct.unpack(self.FMT, image[offset:offset + 10])
        self.ProcTable = h[0]
        self.field_4 = h[1]
        self.FrameSize = h[2]
        self.ProcSize = h[3]
        self.procTable = ProcTable(image, self.ProcTable - image_base)
        start = offset - self.ProcSize
        if start < 0:
            start = 0
        self.pcodes = image[start:offset]


class ProcTable(object):
    FMT = "<52sL"

    def __init__(self, image, offset):
        self.image = image
        h = struct.unpack(self.FMT, image[offset:offset + 56])
        self.SomeTemp = h[0]
        self.DataConst = h[1]


# --------------------------------------------------------------------------- #
# Driver
# --------------------------------------------------------------------------- #
def find_vb_header(image):
    idx = image.find(b"VB5!")
    return idx


def run(bin_path, out_dir):
    pe = PEReader(bin_path)
    image = pe.build_flat_image()
    vb_off = find_vb_header(image)
    if vb_off < 0:
        print("VB5! signature not found")
        return None
    print("VB5! at RVA 0x%X (file off 0x%X)" % (vb_off, vb_off))
    hdr = VbHeader(image, vb_off, pe.ImageBase)
    print("Signature       :", hdr.Signature)
    print("RuntimeBuild    :", hdr.RuntimeBuild)
    print("LanguageDLL     :", hdr.LanguageDLL)
    print("FormCount       :", hdr.FormCount)
    print("ProjectExename  :", hdr.oProjectExename)
    print("ProjectTitle    :", hdr.oProjectTitle)
    print("ProjectName     :", hdr.oProjectName)

    proj = ProjectInfo(image, hdr.aProjectInfo - pe.ImageBase, pe.ImageBase)
    print("aObjectTable    : 0x%X" % proj.aObjectTable)
    print("iObjectsCount   :", proj.objectTable.iObjectsCount)
    print("aNativeCode     : 0x%X" % proj.aNativeCode)
    print("lExternalCount  :", proj.lExternalCount)

    decoder = PcodeDecoder()
    os.makedirs(out_dir, exist_ok=True)

    index_lines = []
    for oi, obj in enumerate(proj.objectTable.objects):
        oname = obj.aNTSObjectName or ("object_%d" % oi)
        safe = "".join(c if (c.isalnum() or c in "-_") else "_" for c in oname)
        # avoid clobbering; keep index for uniqueness
        fname = "%03d_%s.txt" % (oi, safe[:48])
        fpath = os.path.join(out_dir, fname)
        with open(fpath, "w", encoding="utf-8") as fo:
            fo.write("OBJECT #%d\n" % oi)
            fo.write("  Name        : %s\n" % oname)
            fo.write("  MethodCount : %d (TObject.lMethodCount=%d, TObjectInfo.wMethodCount=%d)\n"
                     % (len(obj.methods), obj.lMethodCount, obj.tObjectInfo.wMethodCount))
            fo.write("  ObjectType  : 0x%X\n" % obj.lObjectType)
            fo.write("  aObjectInfo : 0x%X\n" % obj.aObjectInfo)
            fo.write("\n")
            mcount = 0
            for mi, m in enumerate(obj.methods):
                if isinstance(m, dict):
                    fo.write("METHOD #%d (external/alias): %s  va=0x%X\n"
                             % (mi, m.get("name", ""), m.get("va", 0)))
                    continue
                mcount += 1
                fo.write("METHOD #%d : %s\n" % (mi, m.name))
                fo.write("  ProcAddress : 0x%X\n" % m.ProcAddress)
                fo.write("  ProcSize    : %d bytes\n" % m.ProcSize)
                fo.write("  FrameSize   : %d\n" % m.FrameSize)
                if m.ProcSize > 0:
                    fo.write("  p-code (%d bytes):\n" % len(m.pcodes))
                    dis = decoder.decode(bytes(m.pcodes))
                    for (off, name, consumed, raw) in dis:
                        hexs = " ".join("%02X" % b for b in raw)
                        fo.write("    +%04X  %-22s %s\n" % (off, name, hexs))
                    fo.write("\n")
        index_lines.append("%03d  %-40s methods=%d  type=0x%X"
                           % (oi, oname, len(obj.methods), obj.lObjectType))
    with open(os.path.join(out_dir, "_INDEX.txt"), "w", encoding="utf-8") as fi:
        fi.write("VB5 P-CODE DUMP\n")
        fi.write("binary : %s\n" % os.path.abspath(bin_path))
        fi.write("objects: %d\n\n" % len(proj.objectTable.objects))
        fi.write("\n".join(index_lines))
        fi.write("\n")
    print("Wrote %d object dumps to %s" % (len(proj.objectTable.objects), out_dir))
    return proj


if __name__ == "__main__":
    bp = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BIN
    od = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT
    run(bp, od)
