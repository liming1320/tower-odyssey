'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const androidDir = path.join(root, 'android');
const isWindows = process.platform === 'win32';
const npx = isWindows ? 'npx.cmd' : 'npx';
const gradle = isWindows ? path.join(androidDir, 'gradlew.bat') : path.join(androidDir, 'gradlew');

function run(command, args, options) {
    const result = childProcess.spawnSync(command, args, {
        cwd: root,
        env: options && options.env ? options.env : process.env,
        stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}

function javaMajor(javaHome) {
    const executable = path.join(javaHome, 'bin', isWindows ? 'java.exe' : 'java');
    if (!fs.existsSync(executable)) return 0;
    const result = childProcess.spawnSync(executable, ['-version'], { encoding: 'utf8' });
    const output = String(result.stdout || '') + String(result.stderr || '');
    const match = output.match(/version\s+"(?:1\.)?(\d+)/i);
    return match ? Number(match[1]) : 0;
}

function findJavaHome() {
    const candidates = [
        process.env.JAVA_HOME,
        'C:\\Java\\jdk-17',
        'C:\\Java\\corretto-17.0.11',
        'C:\\Program Files\\Java\\jdk-17',
        'C:\\Program Files\\Eclipse Adoptium\\jdk-17',
    ].filter(Boolean);
    return candidates.find(function (candidate) { return javaMajor(candidate) >= 17; });
}

function findAndroidSdk() {
    const candidates = [
        process.env.ANDROID_HOME,
        process.env.ANDROID_SDK_ROOT,
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
        process.env.APPDATA && path.join(process.env.APPDATA, 'Android', 'Sdk'),
    ].filter(Boolean);
    return candidates.find(function (candidate) {
        return fs.existsSync(path.join(candidate, 'platform-tools'))
            && fs.existsSync(path.join(candidate, 'platforms', 'android-36'));
    });
}

function writeLocalProperties(androidSdk) {
    const escapedSdk = androidSdk.replace(/\\/g, '\\\\');
    fs.writeFileSync(path.join(androidDir, 'local.properties'), 'sdk.dir=' + escapedSdk + os.EOL, 'utf8');
}

const javaHome = findJavaHome();
if (!javaHome) {
    throw new Error('JDK 17 or newer was not found. Set JAVA_HOME to a JDK 17 installation and retry.');
}

const androidSdk = findAndroidSdk();
if (!androidSdk) {
    throw new Error('Android SDK Platform 36 was not found. Install it with Android Studio, then set ANDROID_HOME to the SDK directory.');
}

const env = {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: androidSdk,
    ANDROID_SDK_ROOT: androidSdk,
};

run(process.execPath, [path.join(root, 'tools', 'build-offline-pwa.js')], { env });
if (!fs.existsSync(androidDir)) run(npx, ['cap', 'add', 'android'], { env });
run(npx, ['cap', 'sync', 'android'], { env });
writeLocalProperties(androidSdk);
run(gradle, [':app:assembleDebug'], { env });

console.log('APK ready: ' + path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'));
