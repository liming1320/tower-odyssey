// Build a per-game evidence index from the read-only PK32 extraction.
// This records source facts without claiming that a launcher is an original port.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const reference = path.join(root, 'output', 'pk32-reference');
const strings = JSON.parse(fs.readFileSync(path.join(reference, 'strings.json'), 'utf8'));
const pegBoards = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'pk32-peg-native-boards.json'), 'utf8'));
const code = fs.readFileSync(path.join(root, 'public', 'js', 'minigames', 'pk32.js'), 'utf8');
const context = { window: { MiniGames: {} } };
vm.createContext(context);
vm.runInContext(code, context);
const games = context.window.PK32Catalog || [];
const titles = strings.filter(row => row.text.indexOf('扑克32--') === 0 || row.text === '扑克32-纸牌魔法阵');
const titleTexts = name => ['扑克32--' + name, '扑克32-' + name];

function nextTitle(offset) {
  const row = titles.find(item => item.offset > offset);
  return row ? row.offset : Number.MAX_SAFE_INTEGER;
}

function sectionRows(title) {
  const end = nextTitle(title.offset);
  return strings.filter(row => row.offset >= title.offset && row.offset < end);
}

function explicitLevelMax(rows) {
  let max = null;
  rows.forEach(row => {
    const hit = row.text.match(/^请输入您想玩的关数\(1-(\d+)\)/);
    if (hit) max = Math.max(max || 0, Number(hit[1]));
  });
  return max;
}

function numericPayloads(rows, includeValues) {
  return rows.filter(row => /^\d+$/.test(row.text) && row.text.length >= 18).map(row => {
    const payload = { offset: row.offset, length: row.text.length, sample: row.text.slice(0, 48) };
    if (includeValues) payload.value = row.text;
    return payload;
  });
}

const records = games.map(game => {
  const title = titles.find(row => titleTexts(game.name).indexOf(row.text) >= 0);
  if (!title) {
    return {
      id: game.id,
      name: game.name,
      titleOffset: null,
      titleFound: false,
      help: [],
      payloadCount: 0,
      payloadLengths: {},
      levelCount: null,
      levelCountBasis: null
    };
  }
  const rows = sectionRows(title);
  const payloads = numericPayloads(rows, game.name === '独粒钻石');
  const payloadLengths = {};
  payloads.forEach(row => { payloadLengths[row.length] = (payloadLengths[row.length] || 0) + 1; });
  const help = rows.filter(row => row.text !== title.text && !/^\d+$/.test(row.text) && row.text.length >= 8)
    .slice(0, 12).map(row => row.text.slice(0, 240));
  let levelCount = null;
  let levelCountBasis = null;
  if (game.name === '魔塔') {
    levelCount = 22;
    levelCountBasis = 'native floor-dispatch cases';
  } else if (game.name === '独粒钻石') {
    levelCount = pegBoards.count;
    levelCountBasis = 'native initialization switch cases at RVA 0x14b970c..0x14bc247';
  } else {
    const explicit = explicitLevelMax(rows);
    if (explicit != null) {
      levelCount = explicit;
      levelCountBasis = 'native level-selection prompt';
    }
  }
  return {
    id: game.id,
    name: game.name,
    titleOffset: title.offset,
    titleFound: true,
    help,
    payloadCount: payloads.length,
    payloadLengths,
    payloads: game.name === '独粒钻石' ? payloads : undefined,
    payloadSamples: payloads.slice(0, 24).map(row => ({ offset: row.offset, length: row.length, sample: row.sample })),
    levelCount,
    levelCountBasis
  };
});

const result = {
  version: 1,
  source: 'output/pk32-reference/strings.json; read-only extraction from PK32 module.bin',
  generatedAt: new Date().toISOString(),
  total: records.length,
  records
};
const files = [
  path.join(reference, 'native-game-catalog.json'),
  path.join(root, 'public', 'data', 'pk32-native-catalog.json')
];
files.forEach(file => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
});
console.log(JSON.stringify({
  total: records.length,
  titlesFound: records.filter(row => row.titleFound).length,
  confirmedLevelCounts: records.filter(row => row.levelCount != null).length,
  output: files.map(file => path.relative(root, file))
}));
