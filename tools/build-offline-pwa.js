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
const basePathValue = (process.env.PWA_BASE_PATH || '').trim().replace(/^\/+|\/+$/g, '');
const basePath = basePathValue ? `/${basePathValue}` : '';
const vendorIndex = fs.readFileSync(path.join(source, 'vendor', 'spacecadet', 'index.html'), 'utf8');
const pinballVersionMatch = vendorIndex.match(/SpaceCadetPinball\.js\?v=([^"'&]+)/);
const pinballVersion = pinballVersionMatch ? pinballVersionMatch[1] : 'latest';

fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true });
fs.copyFileSync(path.join(source, 'offline-home.html'), path.join(output, 'index.html'));

function atBase(url) {
    return basePath + url;
}

function rewriteStaticUrls(text) {
    return text
        .replaceAll('href="/manifest.webmanifest"', `href="${atBase('/manifest.webmanifest')}"`)
        .replaceAll('href="/pinball.webmanifest"', `href="${atBase('/pinball.webmanifest')}"`)
        .replaceAll('href="/offline-pinball.html"', `href="${atBase('/offline-pinball.html')}"`)
        .replaceAll('src="/vendor/spacecadet/', `src="${atBase('/vendor/spacecadet/')}`)
        .replaceAll("register('/sw.js?", `register('${atBase('/sw.js?')}`)
        .replaceAll('"start_url": "/?source=pwa"', `"start_url": "${atBase('/?source=pwa')}"`)
        .replaceAll('"start_url": "/offline-pinball.html"', `"start_url": "${atBase('/offline-pinball.html')}"`)
        .replaceAll('"scope": "/"', `"scope": "${atBase('/')}"`)
        .replaceAll('"src": "/pwa/icon.svg"', `"src": "${atBase('/pwa/icon.svg')}"`);
}

for (const name of ['index.html', 'sw.js', 'offline-pinball.html', 'manifest.webmanifest', 'pinball.webmanifest']) {
    const file = path.join(output, name);
    const text = fs.readFileSync(file, 'utf8')
        .replaceAll('__PWA_BUILD__', build)
        .replaceAll('__PINBALL_VERSION__', pinballVersion);
    fs.writeFileSync(file, rewriteStaticUrls(text), 'utf8');
}
fs.writeFileSync(path.join(output, 'BUILD.txt'), `${build}\n`, 'utf8');
console.log(`Offline PWA ready: ${output}`);
console.log(`Build: ${build}`);
console.log(`Pinball assets: v${pinballVersion}`);
console.log(`Base path: ${basePath || '/'}`);
