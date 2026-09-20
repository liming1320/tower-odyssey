const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'public');
const output = process.env.PWA_OUT
    ? path.resolve(process.env.PWA_OUT)
    : path.join(root, 'dist', 'offline-pwa');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const build = process.env.PWA_VERSION || `${packageJson.version}-${stamp}`;
const vendorIndex = fs.readFileSync(path.join(source, 'vendor', 'spacecadet', 'index.html'), 'utf8');
const pinballVersionMatch = vendorIndex.match(/SpaceCadetPinball\.js\?v=([^"'&]+)/);
const pinballVersion = pinballVersionMatch ? pinballVersionMatch[1] : 'latest';

fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true });

for (const name of ['index.html', 'sw.js', 'offline-pinball.html']) {
    const file = path.join(output, name);
    const text = fs.readFileSync(file, 'utf8')
        .replaceAll('__PWA_BUILD__', build)
        .replaceAll('__PINBALL_VERSION__', pinballVersion);
    fs.writeFileSync(file, text, 'utf8');
}
fs.writeFileSync(path.join(output, 'BUILD.txt'), `${build}\n`, 'utf8');
console.log(`Offline PWA ready: ${output}`);
console.log(`Build: ${build}`);
console.log(`Pinball assets: v${pinballVersion}`);
