"""Read-only native VB5 metadata/disassembly from the captured memory image."""
import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REFERENCE = ROOT / 'output' / 'pk32-reference'
sys.path.insert(0, str(REFERENCE / 'python-deps'))
from capstone import Cs, CS_ARCH_X86, CS_MODE_32
from capstone.x86 import X86_OP_IMM, X86_OP_MEM


def inspect(start=None, size=1024):
    data = (REFERENCE / 'module.bin').read_bytes()
    def u16(offset):
        return struct.unpack_from('<H', data, offset)[0]
    def u32(offset):
        return struct.unpack_from('<I', data, offset)[0]
    pe = u32(0x3c)
    assert data[pe:pe + 4] == b'PE\0\0'
    assert u16(pe + 24) == 0x10b, 'Expected PE32 memory image'
    base = u32(pe + 52)
    def rva(address):
        offset = address - base
        if not 0 <= offset < len(data):
            raise ValueError(f'Address outside captured module: {address:#x}')
        return offset
    def cstr(address):
        offset = rva(address)
        end = data.index(0, offset)
        return data[offset:end].decode('ascii')
    signature = data.index(b'VB5!')
    project = rva(u32(signature + 48))
    table = rva(u32(project + 4))
    count = u16(table + 42)
    array = rva(u32(table + 48))
    objects = []
    for index in range(count):
        descriptor = array + index * 48
        info = rva(u32(descriptor))
        assert u16(info + 2) == index
        assert rva(u32(info + 24)) == descriptor
        objects.append({
            'index': index, 'name': cstr(u32(descriptor + 24)),
            'descriptorRva': descriptor, 'objectInfoRva': info,
            'declaredMethodCount': u32(descriptor + 28),
            'methodNamesAddress': u32(descriptor + 32),
            'publicStorageAddress': u32(descriptor + 16),
            'objectTypeFlags': u32(descriptor + 40)
        })
    strings = json.loads((REFERENCE / 'strings.json').read_text(encoding='utf-8'))
    string_by_address = {base + row['offset']: row['text'] for row in strings}
    engine = Cs(CS_ARCH_X86, CS_MODE_32)
    engine.detail = True
    def disassemble(offset, length):
        output = []
        for ins in engine.disasm(data[offset:offset + length], base + offset):
            references = []
            for operand in ins.operands:
                value = operand.imm if operand.type == X86_OP_IMM else operand.mem.disp if operand.type == X86_OP_MEM else None
                if value in string_by_address:
                    references.append({'address': value, 'text': string_by_address[value]})
            output.append({'rva': ins.address - base, 'address': ins.address,
                           'bytes': ins.bytes.hex(), 'instruction': ins.mnemonic + ' ' + ins.op_str,
                           'strings': references})
        return output
    if start is not None:
        instructions = disassemble(start, size)
        output = REFERENCE / f'native-{start:x}.json'
        output.write_text(json.dumps(instructions, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        for ins in instructions:
            annotation = ' | '.join(x['text'][:100] for x in ins['strings'])
            print(f"{ins['rva']:08x} {ins['instruction']}" + (' ; ' + annotation if annotation else ''))
        return
    # Exact byte pattern of the observed floor-dispatch function, verified before decoding.
    dispatch = 0x1749230
    assert data[dispatch:dispatch + 10] == bytes.fromhex('8b4424040fbf0083f815')
    assert data[dispatch + 16:dispatch + 19] == bytes.fromhex('ff2485')
    targets = rva(u32(dispatch + 19))
    maps = []
    for floor in range(22):
        target = rva(u32(targets + floor * 4))
        assert data[target] == 0xba and data[target + 5] == 0xb9
        text_address = u32(target + 1)
        text = string_by_address[text_address]
        assert len(text) == 242 and text.isdecimal()
        maps.append({'floor': floor, 'caseRva': target, 'stringRva': rva(text_address),
                     'destinationAddress': u32(target + 6), 'text': text})
    # Corroborate the atlas number against the serialized PicForm Index.
    atlas = 0x915611
    assert data[atlas - 30:atlas - 23] == b'PicForm'
    assert u16(atlas - 15) == 22
    assert data[0x172a2dc:0x172a2de] == b'\x6a\x16'
    assert struct.unpack_from('<f', data, 0xcd2c)[0] == 18
    assert struct.unpack_from('<f', data, 0xcd30)[0] == 33
    assert data[0x172a327:0x172a32c] == bytes.fromhex('682000cc00')
    # Independently prove the Richman source selection and coordinate constants.
    assert data[0xde1b36 - 30:0xde1b36 - 23] == b'PicForm'
    assert u16(0xde1b36 - 15) == 13
    assert data[0x157c3b2:0x157c3b4] == bytes.fromhex('6a0d')
    assert data[0x157c401:0x157c408] == bytes.fromhex('68c30000006a00')
    assert data[0x1580544:0x1580548] == bytes.fromhex('666bc929')
    assert struct.unpack_from('<f', data, 0xb0c4)[0] == 41
    assert struct.unpack_from('<f', data, 0xb0c8)[0] == -903
    assert struct.unpack_from('<f', data, 0xb0cc)[0] == -698
    result = {
        'moduleSha256': hashlib.sha256(data).hexdigest(), 'imageBase': base,
        'vbHeaderRva': signature, 'projectRva': project, 'objectTableRva': table,
        'nativeCodeStartRva': rva(u32(project + 12)),
        'nativeCodeEndRva': rva(u32(project + 16)),
        'objects': objects,
        'towerFloorDispatch': {'rva': dispatch, 'tableRva': targets, 'maps': maps,
                               'verified': '22 direct switch cases assigning literal strings',
                               'tileSemanticsVerified': False},
        'towerAtlas': {'bmpRva': atlas, 'picFormIndex': 22, 'width': 593, 'height': 1038,
                       'drawRoutineRva': 0x1729e20, 'blitCallRva': 0x172a351,
                       'columns': 18, 'stride': 33, 'tileSize': 32,
                       'sourceX': '(code % 18) * 33',
                       'sourceY': 'floor(code / 18) * 66 + frame * 33',
                       'playerCodeBase': 76, 'frameCount': 2,
                       'copyMode': 'SRCCOPY', 'mappingVerified': True},
        'richmanAtlas': {
            'bmpRva': 0xde1b36, 'picFormIndex': 13, 'width': 2536, 'height': 1173,
            'board': {'source': [0, 195, 698, 452], 'blitRva': 0x157c41a,
                      'sizeBasis': '17 by 11 cells at 41px stride, including the outer grid line'},
            'track': {'coordinateRoutineRva': 0x1580532, 'cells': 40, 'spriteSize': 40,
                      'stride': 41, 'corners': [[534, 411], [124, 411], [124, 1], [534, 1]]},
            'players': {'count': 4, 'sourceX': '903 + floor(position / 10) * 41',
                        'sourceY': '196 + playerIndex * 41', 'sourceRoutineRva': 0x1580696},
            'properties': {'sourceX': '698 + (ownerIndex + 1) * 41',
                           'sourceY': '196 + buildingLevel * 41', 'coordinateRoutineRva': 0x1580e4a},
            'dice': {'sourceX': 1077, 'sourceY': '203 + dieValue * 32', 'size': 32,
                     'sourceRoutineRva': 0x15816eb},
            'money': {'sourceX': '985 + digit * 8', 'sourceY': '360 + playerIndex * 13',
                      'blankDigit': 10, 'size': [8, 13], 'sourceRoutineRva': 0x157f62a},
            'mappingVerified': True, 'fullRulesVerified': False
        },
        'rulesRecovered': False
    }
    output = REFERENCE / 'native-index.json'
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(output), 'objects': count, 'declaredMethods': sum(x['declaredMethodCount'] for x in objects),
                      'towerFloorCases': len(maps), 'rulesRecovered': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', type=lambda text: int(text, 0))
    parser.add_argument('--size', type=lambda text: int(text, 0), default=1024)
    args = parser.parse_args()
    inspect(args.start, args.size)
