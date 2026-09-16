"""Build native-code ownership evidence for PK32 string payloads.

The input module is a flat PE memory image: file offset equals RVA.  This tool
does not infer ownership from title order.  It records direct native xrefs and
recovers switch tables that select BSTR values.
"""
import argparse
import hashlib
import json
import re
import struct
import sys
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
REFERENCE = ROOT / "output" / "pk32-reference"
DEFAULT_MODULE = REFERENCE / "module.bin"
DEFAULT_CATALOG = ROOT / "public" / "data" / "pk32-native-catalog.json"
DEFAULT_STRINGS = REFERENCE / "strings.json"
DEFAULT_OUTPUT = REFERENCE / "native-ownership.json"

sys.path.insert(0, str(REFERENCE / "python-deps"))
from capstone import Cs, CS_ARCH_X86, CS_MODE_32  # noqa: E402
from capstone.x86 import X86_OP_IMM, X86_OP_MEM  # noqa: E402


def u16(data, offset):
    return struct.unpack_from("<H", data, offset)[0]


def u32(data, offset):
    return struct.unpack_from("<I", data, offset)[0]


def parse_image(data):
    pe = u32(data, 0x3C)
    if data[pe:pe + 4] != b"PE\0\0" or u16(data, pe + 24) != 0x10B:
        raise ValueError("Expected a flat PE32 memory image")
    base = u32(data, pe + 52)
    signature = data.index(b"VB5!")
    project = u32(data, signature + 48) - base
    code_start = u32(data, project + 12) - base
    code_end = u32(data, project + 16) - base
    if not 0 <= code_start < code_end <= len(data):
        raise ValueError("Invalid VB5 native code range")
    return {
        "imageBase": base,
        "vbHeaderRva": signature,
        "projectRva": project,
        "nativeCodeStartRva": code_start,
        "nativeCodeEndRva": code_end,
    }


def compile_address_pattern(addresses):
    parts = [re.escape(struct.pack("<I", value)) for value in sorted(addresses)]
    return re.compile(b"|".join(parts)) if parts else None


def operand_values(instruction):
    values = []
    for operand in instruction.operands:
        if operand.type == X86_OP_IMM:
            values.append(operand.imm & 0xFFFFFFFF)
        elif operand.type == X86_OP_MEM and operand.mem.disp:
            values.append(operand.mem.disp & 0xFFFFFFFF)
    return values


def decode_reference(engine, data, image, reference_rva, target_va):
    code_start = image["nativeCodeStartRva"]
    code_end = image["nativeCodeEndRva"]
    for start in range(max(code_start, reference_rva - 15), reference_rva + 1):
        for instruction in engine.disasm(data[start:min(code_end, reference_rva + 24)], image["imageBase"] + start):
            ins_start = instruction.address - image["imageBase"]
            ins_end = ins_start + instruction.size
            if ins_start <= reference_rva < ins_end and target_va in operand_values(instruction):
                return {
                    "instructionRva": ins_start,
                    "bytes": instruction.bytes.hex(),
                    "instruction": (instruction.mnemonic + " " + instruction.op_str).strip(),
                }
            if ins_start > reference_rva:
                break
    return None


def previous_prologue(data, code_start, reference_rva, window=0x8000):
    lower = max(code_start, reference_rva - window)
    found = data.rfind(b"\x55\x8b\xec", lower, reference_rva + 1)
    return found if found >= lower else None


def find_code_references(data, image, address_to_string):
    base = image["imageBase"]
    code_start = image["nativeCodeStartRva"]
    code_end = image["nativeCodeEndRva"]
    pattern = compile_address_pattern(address_to_string)
    engine = Cs(CS_ARCH_X86, CS_MODE_32)
    engine.detail = True
    result = defaultdict(list)
    if pattern is None:
        return result
    for match in pattern.finditer(data, code_start, code_end):
        target_va = u32(data, match.start())
        decoded = decode_reference(engine, data, image, match.start(), target_va)
        if decoded is None:
            continue
        function_rva = previous_prologue(data, code_start, decoded["instructionRva"])
        result[target_va].append({
            **decoded,
            "functionRva": function_rva,
        })
    return result


def find_aligned_data_references(data, image, target_addresses):
    refs = defaultdict(list)
    code_start = image["nativeCodeStartRva"]
    code_end = image["nativeCodeEndRva"]
    for offset in range(0, len(data) - 3, 4):
        value = u32(data, offset)
        if value in target_addresses and not code_start <= offset < code_end:
            refs[value].append(offset)
    return refs


def disassemble_function(engine, data, image, function_rva, max_size=0x10000):
    start = function_rva
    end = min(image["nativeCodeEndRva"], start + max_size)
    next_prologue = data.find(b"\x55\x8b\xec", start + 3, end)
    if next_prologue >= 0:
        end = next_prologue
    return list(engine.disasm(data[start:end], image["imageBase"] + start))


def switch_count(instructions, jump_index):
    for instruction in reversed(instructions[max(0, jump_index - 8):jump_index]):
        if instruction.mnemonic == "cmp":
            immediate = [operand.imm & 0xFFFFFFFF for operand in instruction.operands
                         if operand.type == X86_OP_IMM]
            if immediate and immediate[-1] < 0x10000:
                return immediate[-1] + 1
    return None


def first_string_reference(engine, data, image, case_va, known_addresses):
    case_rva = case_va - image["imageBase"]
    if not image["nativeCodeStartRva"] <= case_rva < image["nativeCodeEndRva"]:
        return None
    for instruction in engine.disasm(data[case_rva:case_rva + 32], case_va):
        for value in operand_values(instruction):
            if value in known_addresses:
                return {
                    "caseRva": case_rva,
                    "instructionRva": instruction.address - image["imageBase"],
                    "stringRva": value - image["imageBase"],
                }
        if instruction.mnemonic in ("ret", "jmp"):
            break
    return None


def recover_dispatchers(data, image, function_rvas, known_addresses):
    engine = Cs(CS_ARCH_X86, CS_MODE_32)
    engine.detail = True
    dispatchers = []
    seen = set()
    for function_rva in sorted(rva for rva in function_rvas if rva is not None):
        instructions = disassemble_function(engine, data, image, function_rva)
        for index, instruction in enumerate(instructions):
            if instruction.mnemonic != "jmp" or not instruction.operands:
                continue
            operand = instruction.operands[0]
            if operand.type != X86_OP_MEM or operand.mem.scale != 4 or not operand.mem.disp:
                continue
            table_va = operand.mem.disp & 0xFFFFFFFF
            table_rva = table_va - image["imageBase"]
            count = switch_count(instructions, index)
            key = (instruction.address, table_va)
            if key in seen or count is None or not 1 <= count <= 1000:
                continue
            if not 0 <= table_rva <= len(data) - count * 4:
                continue
            seen.add(key)
            cases = []
            for case_index in range(count):
                target = u32(data, table_rva + case_index * 4)
                string_ref = first_string_reference(engine, data, image, target, known_addresses)
                cases.append({"index": case_index, "targetRva": target - image["imageBase"], **(string_ref or {})})
            string_cases = [case for case in cases if "stringRva" in case]
            if not string_cases:
                continue
            dispatchers.append({
                "functionRva": function_rva,
                "jumpRva": instruction.address - image["imageBase"],
                "tableRva": table_rva,
                "caseCount": count,
                "stringCaseCount": len(string_cases),
                "cases": cases,
            })
    return dispatchers


def recover_control_dispatchers(data, image, known_addresses, object_addresses):
    engine = Cs(CS_ARCH_X86, CS_MODE_32)
    engine.detail = True
    code_start = image["nativeCodeStartRva"]
    code_end = image["nativeCodeEndRva"]
    dispatchers = []
    seen = set()
    for match in re.compile(re.escape(b"\xff\x24")).finditer(data, code_start, code_end):
        decoded = list(engine.disasm(data[match.start():match.start() + 8], image["imageBase"] + match.start()))
        if not decoded or decoded[0].address != image["imageBase"] + match.start():
            continue
        jump = decoded[0]
        if jump.mnemonic != "jmp" or not jump.operands or jump.operands[0].type != X86_OP_MEM:
            continue
        operand = jump.operands[0]
        if operand.mem.scale != 4 or not operand.mem.disp:
            continue
        function_rva = previous_prologue(data, code_start, match.start())
        if function_rva is None:
            continue
        instructions = disassemble_function(engine, data, image, function_rva)
        jump_index = next((index for index, ins in enumerate(instructions) if ins.address == jump.address), None)
        if jump_index is None:
            continue
        count = switch_count(instructions, jump_index)
        table_va = operand.mem.disp & 0xFFFFFFFF
        table_rva = table_va - image["imageBase"]
        key = (jump.address, table_va)
        if key in seen or count is None or not 2 <= count <= 1000:
            continue
        if not 0 <= table_rva <= len(data) - count * 4:
            continue
        seen.add(key)
        cases = []
        for case_index in range(count):
            target_va = u32(data, table_rva + case_index * 4)
            target_rva = target_va - image["imageBase"]
            strings = []
            objects = []
            calls = []
            if code_start <= target_rva < code_end:
                for instruction in engine.disasm(data[target_rva:min(code_end, target_rva + 160)], target_va):
                    for value in operand_values(instruction):
                        if value in known_addresses:
                            strings.append(value - image["imageBase"])
                        if value in object_addresses:
                            objects.append(object_addresses[value])
                    if instruction.mnemonic == "call" and instruction.operands and instruction.operands[0].type == X86_OP_IMM:
                        calls.append((instruction.operands[0].imm & 0xFFFFFFFF) - image["imageBase"])
                    if instruction.mnemonic == "ret":
                        break
            cases.append({
                "index": case_index,
                "targetRva": target_rva,
                "stringRvas": sorted(set(strings)),
                "objectReferences": list({row["index"]: row for row in objects}.values()),
                "directCallRvas": sorted(set(calls)),
            })
        dispatchers.append({
            "functionRva": function_rva,
            "jumpRva": jump.address - image["imageBase"],
            "tableRva": table_rva,
            "caseCount": count,
            "cases": cases,
        })
    return dispatchers


def build_direct_call_graph(data, image):
    engine = Cs(CS_ARCH_X86, CS_MODE_32)
    engine.detail = True
    code_start = image["nativeCodeStartRva"]
    code_end = image["nativeCodeEndRva"]
    graph = defaultdict(set)
    for match in re.compile(re.escape(b"\xe8")).finditer(data, code_start, code_end - 4):
        instruction = next(engine.disasm(data[match.start():match.start() + 5], image["imageBase"] + match.start()), None)
        if instruction is None or instruction.mnemonic != "call" or instruction.size != 5:
            continue
        if not instruction.operands or instruction.operands[0].type != X86_OP_IMM:
            continue
        target_rva = (instruction.operands[0].imm & 0xFFFFFFFF) - image["imageBase"]
        if not code_start <= target_rva < code_end:
            continue
        caller_rva = previous_prologue(data, code_start, match.start())
        if caller_rva is not None:
            graph[caller_rva].add(target_rva)
    return graph


def reachable_title_games(start_rvas, call_graph, title_games_by_function, max_depth=5):
    queue = [(rva, 0) for rva in start_rvas]
    visited = set()
    matches = {}
    while queue:
        function_rva, depth = queue.pop(0)
        if function_rva in visited or depth > max_depth:
            continue
        visited.add(function_rva)
        for game in title_games_by_function.get(function_rva, []):
            previous = matches.get(game["gameId"])
            if previous is None or depth < previous["callDepth"]:
                matches[game["gameId"]] = {**game, "titleFunctionRva": function_rva, "callDepth": depth}
        if depth < max_depth:
            queue.extend((target, depth + 1) for target in call_graph.get(function_rva, []))
    return list(matches.values())


def build(args):
    module_path = Path(args.module)
    catalog_path = Path(args.catalog)
    strings_path = Path(args.strings)
    output_path = Path(args.output)
    data = module_path.read_bytes()
    image = parse_image(data)
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    strings = json.loads(strings_path.read_text(encoding="utf-8"))
    native_index_path = REFERENCE / "native-index.json"
    native_index = json.loads(native_index_path.read_text(encoding="utf-8")) if native_index_path.exists() else {"objects": []}

    string_by_rva = {row["offset"]: row["text"] for row in strings}
    string_by_va = {image["imageBase"] + rva: text for rva, text in string_by_rva.items()}
    exact_string_rvas = defaultdict(list)
    for rva, text in string_by_rva.items():
        exact_string_rvas[text].append(rva)
    payload_owners = defaultdict(list)
    title_owners = defaultdict(list)
    menu_label_owners = defaultdict(list)
    payload_rows = []
    for game in catalog["records"]:
        if game.get("titleOffset") is not None:
            title_owners[game["titleOffset"]].append({"gameId": game["id"], "name": game["name"], "seedType": "window-title"})
        for label_rva in exact_string_rvas.get(game["name"], []):
            menu_label_owners[label_rva].append({"gameId": game["id"], "name": game["name"], "seedType": "menu-label"})
        for payload_index, payload in enumerate(game.get("nativePayloads") or []):
            rva = payload["offset"]
            payload_owners[rva].append({"gameId": game["id"], "name": game["name"], "payloadIndex": payload_index})
            payload_rows.append((game, payload_index, payload))

    payload_addresses = {image["imageBase"] + rva for rva in payload_owners}
    payload_strings = {address: string_by_va[address] for address in payload_addresses if address in string_by_va}
    code_refs = find_code_references(data, image, payload_strings)
    title_addresses = {image["imageBase"] + rva for rva in title_owners}
    title_strings = {address: string_by_va[address] for address in title_addresses if address in string_by_va}
    title_code_refs = find_code_references(data, image, title_strings)
    menu_label_addresses = {image["imageBase"] + rva for rva in menu_label_owners}
    menu_label_strings = {address: string_by_va[address] for address in menu_label_addresses if address in string_by_va}
    menu_label_code_refs = find_code_references(data, image, menu_label_strings)
    data_refs = find_aligned_data_references(data, image, payload_addresses)
    candidate_functions = {
        reference["functionRva"]
        for address in payload_addresses
        for reference in code_refs.get(address, [])
        if reference["functionRva"] is not None
    }
    dispatchers = recover_dispatchers(data, image, candidate_functions, set(string_by_va))
    object_addresses = {}
    for row in native_index.get("objects", []):
        details = {"index": row["index"], "name": row["name"]}
        for address in (image["imageBase"] + row["descriptorRva"], image["imageBase"] + row["objectInfoRva"], row.get("publicStorageAddress", 0)):
            if address:
                object_addresses[address] = details
    control_dispatchers = recover_control_dispatchers(data, image, set(string_by_va), object_addresses)
    title_games_by_function = defaultdict(list)
    for title_rva, owners in title_owners.items():
        for reference in title_code_refs.get(image["imageBase"] + title_rva, []):
            if reference["functionRva"] is not None:
                title_games_by_function[reference["functionRva"]].extend(owners)
    title_reference_functions = []
    for function_rva, owners in sorted(title_games_by_function.items()):
        title_reference_functions.append({
            "functionRva": function_rva,
            "games": list({row["gameId"]: row for row in owners}.values()),
        })
    menu_label_reference_functions = []
    for label_rva, owners in menu_label_owners.items():
        functions = sorted({reference["functionRva"] for reference in menu_label_code_refs.get(image["imageBase"] + label_rva, []) if reference["functionRva"] is not None})
        if functions:
            menu_label_reference_functions.append({"stringRva": label_rva, "functions": functions, "games": owners})
    launch_edges = []
    direct_call_graph = build_direct_call_graph(data, image)
    framework_end = image["nativeCodeStartRva"] + 0x300000
    for dispatcher_index, dispatcher in enumerate(control_dispatchers):
        if dispatcher["functionRva"] >= framework_end:
            continue
        for case in dispatcher["cases"]:
            unique_matches = reachable_title_games(case["directCallRvas"], direct_call_graph, title_games_by_function)
            if unique_matches:
                launch_edges.append({
                    "controlDispatcherIndex": dispatcher_index,
                    "caseIndex": case["index"],
                    "branchTargetRva": case["targetRva"],
                    "directCallRvas": case["directCallRvas"],
                    "games": unique_matches,
                    "assignmentVerified": len(unique_matches) == 1,
                })

    dispatcher_by_string_rva = defaultdict(list)
    for dispatcher_index, dispatcher in enumerate(dispatchers):
        owner_counts = Counter()
        recovered = []
        for case in dispatcher["cases"]:
            rva = case.get("stringRva")
            if rva is None:
                continue
            dispatcher_by_string_rva[rva].append(dispatcher_index)
            for owner in payload_owners.get(rva, []):
                owner_counts[owner["gameId"]] += 1
            text = string_by_rva.get(rva, "")
            if rva not in payload_owners and text.isdecimal():
                recovered.append({"offset": rva, "length": len(text), "sample": text[:48]})
        dispatcher["candidateGameCounts"] = dict(owner_counts)
        dispatcher["candidateGameIds"] = [game_id for game_id, _ in owner_counts.most_common()]
        dispatcher["catalogAssignmentConflict"] = len(owner_counts) > 1
        dispatcher["recoveredUnassignedNumericStrings"] = recovered
        dispatcher["ownershipVerified"] = False

    conflict_dispatchers = {index for index, row in enumerate(dispatchers) if row["catalogAssignmentConflict"]}
    evidence = []
    for game, payload_index, payload in payload_rows:
        rva = payload["offset"]
        va = image["imageBase"] + rva
        direct = code_refs.get(va, [])
        dispatch_indexes = dispatcher_by_string_rva.get(rva, [])
        evidence.append({
            "gameId": game["id"],
            "name": game["name"],
            "payloadIndex": payload_index,
            "offset": rva,
            "length": payload["length"],
            "sourceSha256": hashlib.sha256(payload["value"].encode("utf-8")).hexdigest(),
            "directCodeReferences": direct,
            "alignedDataReferenceRvas": data_refs.get(va, []),
            "dispatcherIndexes": dispatch_indexes,
            "catalogAssignmentConflict": any(index in conflict_dispatchers for index in dispatch_indexes),
            "nativeUsageVerified": bool(direct or dispatch_indexes),
            "ownershipVerified": False,
        })

    direct_count = sum(1 for row in evidence if row["directCodeReferences"])
    dispatch_count = sum(1 for row in evidence if row["dispatcherIndexes"])
    recovered_count = sum(len(row["recoveredUnassignedNumericStrings"]) for row in dispatchers)
    affected_games = sorted({
        game_id for row in dispatchers if row["catalogAssignmentConflict"]
        for game_id in row["candidateGameIds"]
    })
    result = {
        "version": 1,
        "source": {
            "module": str(module_path.relative_to(ROOT)).replace("\\", "/"),
            "moduleSha256": hashlib.sha256(data).hexdigest(),
            "catalog": str(catalog_path.relative_to(ROOT)).replace("\\", "/"),
            "strings": str(strings_path.relative_to(ROOT)).replace("\\", "/"),
            **image,
        },
        "policy": {
            "titleOrderProvesOwnership": False,
            "nativeUsageProvesOwnership": False,
            "ownershipRequires": "game dispatcher or object method edge to native handler",
            "originalCompletePromoted": False,
        },
        "summary": {
            "gameCount": len(catalog["records"]),
            "payloadCount": len(evidence),
            "directCodeReferencedPayloads": direct_count,
            "dispatcherReferencedPayloads": dispatch_count,
            "dispatcherCount": len(dispatchers),
            "controlDispatcherCount": len(control_dispatchers),
            "largestControlDispatcher": max((row["caseCount"] for row in control_dispatchers), default=0),
            "titleReferencedGames": len({owner["gameId"] for owners in title_owners.values() for owner in owners}),
            "menuLabelReferencedGames": len({owner["gameId"] for owners in menu_label_owners.values() for owner in owners}),
            "launchEdgeCount": len(launch_edges),
            "launchMappedGames": len({game["gameId"] for edge in launch_edges for game in edge["games"]}),
            "conflictingDispatcherCount": len(conflict_dispatchers),
            "conflictAffectedGames": len(affected_games),
            "recoveredUnassignedNumericStrings": recovered_count,
            "ownershipVerified": 0,
        },
        "dispatchers": dispatchers,
        "controlDispatchers": control_dispatchers,
        "titleReferenceFunctions": title_reference_functions,
        "menuLabelReferenceFunctions": menu_label_reference_functions,
        "launchEdges": launch_edges,
        "payloadEvidence": evidence,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output_path), **result["summary"]}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--module", default=str(DEFAULT_MODULE))
    parser.add_argument("--catalog", default=str(DEFAULT_CATALOG))
    parser.add_argument("--strings", default=str(DEFAULT_STRINGS))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    build(parser.parse_args())
