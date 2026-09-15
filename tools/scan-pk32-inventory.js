// Build a read-only PK32 inventory. The catalog games live inside one VB5 host,
// so this intentionally separates physical files from catalog-game records.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const defaultInput = 'F:/BaiduNetdiskDownload/pk32';
const inputArg = process.argv.indexOf('--input');
const input = path.resolve(inputArg >= 0 && process.argv[inputArg + 1] ? process.argv[inputArg + 1] : defaultInput);
const outputArg = process.argv.indexOf('--output');
const output = path.resolve(outputArg >= 0 && process.argv[outputArg + 1] ? process.argv[outputArg + 1] : path.join(root, 'output', 'pk32-reference', 'pk32-inventory.json'));

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readAscii(file, max = 16 * 1024 * 1024) {
    const data = fs.readFileSync(file);
    const bytes = data.length > max ? data.subarray(0, max) : data;
    return bytes.toString('latin1');
}

function peInfo(file) {
    const data = fs.readFileSync(file);
    if (data.length < 0x40 || data.readUInt16LE(0) !== 0x5a4d) return null;
    const peOffset = data.readUInt32LE(0x3c);
    if (peOffset + 24 > data.length || data.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') return null;
    const machine = data.readUInt16LE(peOffset + 4);
    const sections = data.readUInt16LE(peOffset + 6);
    const optionalOffset = peOffset + 24;
    const magic = data.readUInt16LE(optionalOffset);
    const subsystemOffset = optionalOffset + (magic === 0x10b ? 68 : 88);
    const directoryOffset = optionalOffset + (magic === 0x10b ? 96 : 112);
    const importRva = data.readUInt32LE(directoryOffset + 8);
    const resourceRva = data.readUInt32LE(directoryOffset + 16);
    const comRva = data.readUInt32LE(directoryOffset + 14 * 8);
    const sectionTable = optionalOffset + data.readUInt16LE(peOffset + 20);
    const sectionsInfo = [];
    for (let index = 0; index < sections; index++) {
        const offset = sectionTable + index * 40;
        sectionsInfo.push({
            virtualAddress: data.readUInt32LE(offset + 12),
            virtualSize: data.readUInt32LE(offset + 8),
            rawAddress: data.readUInt32LE(offset + 20),
            rawSize: data.readUInt32LE(offset + 16)
        });
    }
    const rvaToOffset = rva => {
        const section = sectionsInfo.find(item => rva >= item.virtualAddress && rva < item.virtualAddress + Math.max(item.virtualSize, item.rawSize));
        return section ? section.rawAddress + (rva - section.virtualAddress) : null;
    };
    const readCString = offset => {
        if (offset == null || offset < 0 || offset >= data.length) return null;
        const end = data.indexOf(0, offset);
        return data.toString('ascii', offset, end < 0 ? data.length : end);
    };
    const uniqueImports = [];
    const importOffset = rvaToOffset(importRva);
    if (importOffset != null) {
        for (let offset = importOffset; offset + 20 <= data.length; offset += 20) {
            const nameRva = data.readUInt32LE(offset + 12);
            const firstThunk = data.readUInt32LE(offset);
            const originalThunk = data.readUInt32LE(offset + 16);
            if (nameRva === 0 && firstThunk === 0 && originalThunk === 0) break;
            const name = readCString(rvaToOffset(nameRva));
            if (name) uniqueImports.push(name.toLowerCase());
        }
    }
    const text = readAscii(file);
    const hasVB5 = text.includes('VB5!') || uniqueImports.includes('msvbvm50.dll');
    const hasDotNet = comRva !== 0 || text.includes('BSJB');
    const headerText = data.subarray(0, Math.min(data.length, 0x20000)).toString('latin1');
    const suspicious = [/UPX!/i, /ASPack/i, /Themida/i, /VMProtect/i, /PECompact/i].filter(pattern => pattern.test(headerText)).map(pattern => pattern.source);
    return {
        format: 'PE32',
        machine: 'i386',
        sections,
        subsystem: data.readUInt16LE(subsystemOffset) === 2 ? 'GUI' : 'other',
        dotNet: hasDotNet,
        vb5: hasVB5,
        importDirectoryRva: importRva,
        resourceDirectoryRva: resourceRva,
        comDescriptorRva: comRva,
        dependencies: uniqueImports,
        packed: suspicious.length > 0 ? true : null,
        packerSignals: suspicious,
        graphicsApi: hasVB5 ? ['VB5 forms', 'GDI/Win32 drawing inferred'] : [],
        engineGuess: hasVB5 ? 'Visual Basic 5 shared host' : 'unknown PE'
    };
}

function walk(directory) {
    const result = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...walk(full));
        else result.push(full);
    }
    return result;
}

if (!fs.existsSync(input)) throw new Error('PK32 directory not found: ' + input);
const files = walk(input).map(file => {
    const stat = fs.statSync(file);
    const extension = path.extname(file).toLowerCase();
    const relativePath = path.relative(input, file).replaceAll(path.sep, '/');
    const pe = extension === '.exe' || extension === '.dll' ? peInfo(file) : null;
    return {
        path: relativePath,
        absolutePath: file,
        extension,
        bytes: stat.size,
        sha256: sha256(file),
        type: pe ? pe.format : extension === '.rar' ? 'RAR archive' : extension === '.ini' ? 'INI configuration' : 'other',
        pe
    };
});

const executableFiles = files.filter(file => file.pe);
const host = executableFiles.find(file => file.path.toLowerCase() === 'pk32.exe') || executableFiles.find(file => file.extension === '.exe');
const runtime = executableFiles.find(file => file.path.toLowerCase() === 'msvbvm50.dll');
if (host && runtime && host.pe) {
    // PECompact hides the VB5 imports in the packed host; the sibling runtime
    // is stronger evidence of the actual engine than the static import table.
    host.pe.vb5 = true;
    host.pe.engineGuess = 'Visual Basic 5 shared host (PECompact packed)';
    host.pe.graphicsApi = ['VB5 forms', 'GDI/Win32 drawing inferred'];
    if (!host.pe.dependencies.includes('msvbvm50.dll')) host.pe.dependencies.push('msvbvm50.dll');
}
const catalogSource = fs.readFileSync(path.join(root, 'public', 'js', 'minigames', 'pk32.js'), 'utf8');
const context = { window: { MiniGames: {} } };
vm.createContext(context);
vm.runInContext(catalogSource, context, { filename: 'public/js/minigames/pk32.js' });
const catalog = context.window.PK32Catalog || [];
const records = catalog.map(record => ({
    id: record.id,
    index: record.index,
    name: record.name,
    group: record.group,
    exePath: host ? host.path : null,
    fileType: host && host.pe ? host.pe.format : null,
    dotNet: host && host.pe ? host.pe.dotNet : null,
    dependencies: host && host.pe ? host.pe.dependencies : [],
    externalResources: files.filter(file => file.extension !== '.exe' && file.extension !== '.dll').map(file => file.path),
    packed: host && host.pe ? host.pe.packed : null,
    graphicsApi: host && host.pe ? host.pe.graphicsApi : [],
    runnable: !!host,
    engine: host && host.pe ? host.pe.engineGuess : 'unknown',
    hostRole: 'catalog entry inside shared PK32 host',
    migrationStatus: record.originalComplete === true ? 'original-complete' : 'in-progress'
}));

const result = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: { directory: input, readOnly: true },
    physicalFiles: files,
    engineGroups: [{
        id: 'vb5-pk32-shared-host',
        label: 'Visual Basic 5 shared host',
        executable: host ? host.path : null,
        runtime: runtime ? runtime.path : null,
        games: records.length,
        evidence: host && host.pe ? ['VB5!', 'MSVBVM50', 'shared Pk32.exe'] : []
    }],
    games: records,
    summary: {
        games: records.length,
        physicalFiles: files.length,
        executables: executableFiles.length,
        dlls: files.filter(file => file.extension === '.dll').length,
        archives: files.filter(file => ['.rar', '.zip', '.7z', '.pak'].includes(file.extension)).length,
        originalComplete: records.filter(record => record.migrationStatus === 'original-complete').length,
        hostSharedByAllGames: records.length > 0 && records.every(record => record.exePath === (host && host.path))
    },
    limitations: [
        'The inventory identifies PE metadata and shared-host ownership; it does not prove original rules or asset bindings.',
        'Graphics API is an evidence-backed inference for this legacy VB5 host, not a complete API trace.',
        'A game is not marked original-complete by inventory or launcher availability.'
    ]
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, games: records.length, physicalFiles: files.length, executables: executableFiles.length, sharedHost: result.summary.hostSharedByAllGames }));
