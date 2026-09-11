// ROM 图鉴解析器验证（短名识别 / DAT 匹配 / CRC 校验 / 中文覆盖 / 目录扫描）
// 覆盖用户提出的 6 步链路：ZIP 短名 → DAT 查表 → 中文覆盖 → CRC 比对 → 预览 → 入库字段
// 用法：node tools/verify-rom-catalog.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const Catalog = require('../server/rom-catalog');
// 共用 ZIP 构造器（真实 ZIP：文件名 + CRC32 必须能被中央目录解析出来）
const { crc32, makeZip } = require('./rom-zip-fixture');

let pass = 0, fail = 0;
function check(name, ok, extra) {
    if (ok) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'romcat-'));
const catDir = path.join(tmp, 'catalog');
const zhFile = path.join(tmp, 'rom-zh.json');
const seed = path.join(__dirname, '..', 'server', 'rom-zh-seed.json');
const cat = Catalog({ catalogDir: catDir, zhFile, seedFile: seed });

(async () => {
    // ---------- 1) ZIP 中央目录解析（不解压、只读尾部） ----------
    console.log('【1】ZIP 中央目录解析（CRC32 直读，不解压）');
    const zipBuf = makeZip([
        { name: '223-p1.bin', data: 'PROGRAM-ROM-DATA' },
        { name: '223-m1.bin', data: 'AUDIO-ROM-DATA' },
        { name: '223-c1.bin', data: 'GFX-ROM-DATA' },
    ]);
    const zipPath = path.join(tmp, 'rbffspec.zip');
    fs.writeFileSync(zipPath, zipBuf);
    const z = cat.readZipEntries(zipPath);
    check('解析出 3 个内部文件', z.ok && z.entries.length === 3, z.error || JSON.stringify(z.entries));
    check('文件名与 CRC32 正确', !!z.entries.find(e =>
        e.name === '223-p1.bin' && e.crc === crc32(Buffer.from('PROGRAM-ROM-DATA')).toString(16).padStart(8, '0')));
    fs.writeFileSync(path.join(tmp, 'broken.zip'), Buffer.from('not a zip at all'));
    check('非 ZIP 文件优雅失败（不抛异常）', cat.readZipEntries(path.join(tmp, 'broken.zip')).ok === false);

    // ---------- 2) DAT 解析（XML 与 ClrMamePro） ----------
    console.log('\n【2】DAT 解析（MAME/FBNeo XML + ClrMamePro）');
    const datXml = `<?xml version="1.0"?>\n<mame build="FBNeo 1.0.0.3 (test)">` +
        `<game name="rbffspec" sourcefile="neogeo.cpp" romof="rbff2">` +
        `<description>Real Bout Fatal Fury Special</description><year>1997</year><manufacturer>SNK</manufacturer>` +
        `<rom name="223-p1.bin" size="16" crc="${crc32(Buffer.from('PROGRAM-ROM-DATA')).toString(16).padStart(8, '0')}"/>` +
        `<rom name="223-m1.bin" size="14" crc="${crc32(Buffer.from('AUDIO-ROM-DATA')).toString(16).padStart(8, '0')}"/>` +
        `<rom name="223-c1.bin" size="12" crc="${crc32(Buffer.from('GFX-ROM-DATA')).toString(16).padStart(8, '0')}"/>` +
        `<device_ref name="neogeo"/></game>` +
        `<game name="kof98" sourcefile="neogeo.cpp"><description>The King of Fighters '98</description>` +
        `<year>1998</year><manufacturer>SNK</manufacturer><device_ref name="neogeo"/></game></mame>`;
    const parsed = cat.parseDat(datXml);
    check('XML DAT 解析出 2 条', parsed.kind === 'xml' && parsed.count === 2, 'count=' + parsed.count);
    check('取到英文原名 / 年份 / 厂商', parsed.entries.rbffspec.desc === 'Real Bout Fatal Fury Special'
        && parsed.entries.rbffspec.year === '1997' && parsed.entries.rbffspec.maker === 'SNK');
    check('版本号被识别', /FBNeo/.test(parsed.version), parsed.version);
    const datCmp = `clrmamepro (\n\tname "test"\n\tversion "0.1"\n)\n` +
        `game (\n\tname "sf2"\n\tdescription "Street Fighter II"\n\tyear "1991"\n\tmanufacturer "Capcom"\n` +
        `\trom ( name "sf2_30.bin" size 8 crc ${crc32(Buffer.from('12345678')).toString(16).padStart(8, '0')} )\n)`;
    const pc = cat.parseDat(datCmp);
    check('ClrMamePro DAT 也能解析', pc.kind === 'clrmamepro' && pc.count === 1 && pc.entries.sf2.maker === 'Capcom');
    check('无法识别的内容返回 unknown（不误判）', cat.parseDat('hello world').kind === 'unknown');

    // ---------- 3) 保存 DAT 并做身份解析 ----------
    console.log('\n【3】短名 → 身份解析（中文覆盖表 + DAT）');
    const saved = cat.saveDat('fbneo.dat', datXml);
    check('DAT 保存成功并生效', saved.ok && saved.datCount === 2, JSON.stringify(saved).slice(0, 120));
    const info = cat.resolve({ shortName: 'rbffspec', entries: z.entries });
    check('中文名来自覆盖表（不混进 DAT）', info.titleZh === '真饿狼传说特别版', info.titleZh);
    check('英文原名来自 DAT', info.titleEn === 'Real Bout Fatal Fury Special', info.titleEn);
    check('厂商 / 年份来自 DAT', info.maker === 'SNK' && info.year === '1997');
    check('平台判定为 neogeo（device_ref）', info.platform === 'neogeo', info.platform);
    check('BIOS 需求自动给出 neogeo.zip', info.bios === 'neogeo.zip', info.bios);
    check('别名可用于搜索', (info.aliases || []).some(a => /饿狼/.test(a)));
    check('父 ROM 短名（romof）记录下来了', info.parentShortName === 'rbff2', info.parentShortName);
    check('catalogVersion 记录了 DAT 版本', /FBNeo/.test(info.catalogVersion), info.catalogVersion);

    // ---------- 4) CRC 校验：ok / partial / mismatch / nodat ----------
    console.log('\n【4】CRC 校验（改名 / 残缺 / 错版 ROM）');
    check('完整 ROM → crcStatus=ok', info.crcStatus === 'ok', info.crcStatus + ' ' + JSON.stringify(info.crcDetail));
    const partial = cat.resolve({ shortName: 'rbffspec', entries: z.entries.slice(0, 2) });
    check('残缺 ROM（少一个文件）→ partial', partial.crcStatus === 'partial', partial.crcStatus);
    const badCrc = z.entries.map(e => ({ ...e, crc: 'deadbeef' }));
    const mismatch = cat.resolve({ shortName: 'rbffspec', entries: badCrc });
    check('错版 ROM（CRC 全不对）→ mismatch', mismatch.crcStatus === 'mismatch', mismatch.crcStatus);
    const renamed = cat.resolve({ shortName: 'rbffspec', entries: z.entries.map((e, i) => ({ ...e, name: 'renamed' + i + '.bin' })) });
    check('内部文件被改名但 CRC 一致 → 仍判 ok（CRC 才是身份）', renamed.crcStatus === 'ok', renamed.crcStatus);
    const noDat = cat.resolve({ shortName: 'zzzunknown', entries: z.entries });
    check('DAT 里没有 → nodat 且降级用短名', noDat.crcStatus === 'nodat' && noDat.displayName === 'zzzunknown');
    const zhOnly = cat.resolve({ shortName: 'kof98', entries: [] });
    check('无 ZIP 内容但中文表命中 → 仍返回中文名', zhOnly.titleZh === '拳皇98·梦战斗未结束', zhOnly.titleZh);

    // ---------- 5) 中文覆盖表可编辑、可持久化 ----------
    console.log('\n【5】中文覆盖表（后台可编辑，与 DAT 解耦）');
    const before = Object.keys(cat.zh).length;
    cat.saveZh(Object.assign({}, cat.zh, { zzzunknown: { titleZh: '测试游戏', aliases: ['别名A'] } }));
    check('新增条目已写入（_note 之类的非对象键会被清掉）',
        cat.zh.zzzunknown && cat.zh.zzzunknown.titleZh === '测试游戏' && cat.zh.zzzunknown.aliases[0] === '别名A',
        'before=' + before + ' after=' + Object.keys(cat.zh).length);
    const reloaded = Catalog({ catalogDir: catDir, zhFile, seedFile: seed });
    check('重启后仍生效（落盘持久化）', reloaded.resolve({ shortName: 'zzzunknown' }).titleZh === '测试游戏');
    check('未指定 platform 时由图鉴自动判定', reloaded.resolve({ shortName: 'rbffspec' }).platform === 'neogeo');
    reloaded.saveZh({ kof98: { titleZh: '拳皇98（重命名测试）', platform: 'neogeo' } });
    check('覆盖 platform 生效', reloaded.resolve({ shortName: 'kof98' }).platform === 'neogeo'
        && reloaded.resolve({ shortName: 'kof98' }).titleZh === '拳皇98（重命名测试）');

    // ---------- 6) 目录扫描（预览数据完整） ----------
    console.log('\n【6】目录扫描（待确认预览）');
    const romDir = path.join(tmp, 'roms');
    fs.mkdirSync(romDir, { recursive: true });
    fs.writeFileSync(path.join(romDir, 'rbffspec.zip'), zipBuf);
    fs.writeFileSync(path.join(romDir, 'kof98.zip'), makeZip([{ name: '242-p1.bin', data: 'KOF98' }]));
    fs.writeFileSync(path.join(romDir, 'notzip.txt'), 'ignore me');
    const scan = cat.scanDir(romDir);
    check('只扫描 ZIP，忽略其它文件', scan.items.length === 2, JSON.stringify(scan.items.map(i => i.file)));
    const item = scan.items.find(i => i.shortName === 'rbffspec');
    check('预览含：短名 / 中文名 / 英文名 / 平台 / BIOS / CRC 状态',
        item && item.shortName === 'rbffspec' && item.titleZh === '真饿狼传说特别版'
        && item.platform === 'neogeo' && item.bios === 'neogeo.zip' && item.crcStatus === 'ok',
        JSON.stringify(item && { s: item.shortName, zh: item.titleZh, p: item.platform, b: item.bios, c: item.crcStatus }));
    check('预览含大小与文件数（供人工判断）', item && item.size > 0 && item.entries === 3);
    check('目录不存在时优雅报错', cat.scanDir(path.join(tmp, 'nope')).ok === false);

    // ---------- 6b) 递归扫描 + BIOS 识别 + 目录名兜底平台 ----------
    // 真实 ROM 包几乎都按基板分目录，甚至套两层（roms/cps2/cps2/xxx.zip）。
    // 不递归的话管理员填 roms 会一个都扫不到，还以为路径填错了。
    console.log('\n【6b】递归扫描 / BIOS 识别 / 目录名兜底平台');
    const nest = path.join(tmp, 'nested');
    fs.mkdirSync(path.join(nest, 'neogeo'), { recursive: true });
    fs.mkdirSync(path.join(nest, 'cps2', 'cps2'), { recursive: true });   // 故意套两层
    fs.writeFileSync(path.join(nest, 'neogeo', 'mslug.zip'), makeZip([{ name: '201-p1.bin', data: 'MSLUG' }]));
    fs.writeFileSync(path.join(nest, 'neogeo', 'neogeo.zip'), makeZip([{ name: 'sp-s2.sp1', data: 'BIOS' }]));
    fs.writeFileSync(path.join(nest, 'cps2', 'cps2', 'sfa2.zip'), makeZip([{ name: 'sz2u27.bin', data: 'SFA2' }]));
    fs.writeFileSync(path.join(nest, 'readme.txt'), 'x');

    const ns = cat.scanDir(nest);
    const names = ns.items.map(i => i.shortName).sort().join(',');
    check('递归扫到子目录（含两层嵌套）', ns.items.length === 3 && names === 'mslug,neogeo,sfa2', names);
    const mslug = ns.items.find(i => i.shortName === 'mslug');
    const bios = ns.items.find(i => i.shortName === 'neogeo');
    const sfa2 = ns.items.find(i => i.shortName === 'sfa2');
    check('基板 BIOS（neogeo.zip）被识别为 BIOS 而非游戏',
        !!bios && bios.isBios === true && (!mslug || !mslug.isBios),
        JSON.stringify({ bios: bios && bios.isBios, mslug: mslug && mslug.isBios }));
    // 没 DAT、中文表也没标平台时，目录名就是唯一可靠来源
    check('无 DAT 时按目录名判定平台（neogeo / cps2）',
        mslug && mslug.platform === 'neogeo' && sfa2 && sfa2.platform === 'cps2',
        JSON.stringify({ mslug: mslug && mslug.platform, sfa2: sfa2 && sfa2.platform }));
    check('扫描结果带相对路径（预览里能看出是哪个基板）',
        sfa2 && sfa2.rel === 'cps2/cps2/sfa2.zip', sfa2 && sfa2.rel);
    check('BIOS 短名判定函数可用', cat.isBiosShortName('neogeo') === true && cat.isBiosShortName('mslug') === false);

    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    process.exit(fail ? 1 : 0);
})();
