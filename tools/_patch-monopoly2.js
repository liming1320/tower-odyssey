// 补丁2：fitCam 重写为竖屏感知（用 window 设备方向判定，而非画布宽高比）
const fs = require('fs');
const F = 'E:/WorkSpace/tower-odyssey/public/js/minigames/monopoly.js';
let t = fs.readFileSync(F, 'utf8');
const oldS = `    function fitCam() {
        if (!GL_renderer || !GL_camera) return;
        const W = GL_renderer.domElement.clientWidth || 612, H = GL_renderer.domElement.clientHeight || 612;
        const aspect = W / H;
        const halfV = (GL_camera.fov * Math.PI / 180) / 2;
        const halfH = Math.atan(Math.tan(halfV) * aspect);
        const R = 8.0;                                   // 方盘对角半径（含小人高度冗余）
        const need = R / Math.tan(Math.min(halfV, halfH));
        cam.rad = Math.max(7, Math.min(30, need * 1.02));
    }`;
const newS = `    // 自动取景：让 11×11 方盘完整落在视口内
    // 横屏：低机位(0.95) + 50° FOV（戏剧性斜俯视）；竖屏/窄屏：抬高机位(1.18) + 60° 广角，整盘入镜且顶部高楼不被裁切
    function fitCam() {
        if (!GL_renderer || !GL_camera) return;
        const W = GL_renderer.domElement.clientWidth || 612, H = GL_renderer.domElement.clientHeight || 612;
        const winPortrait = (typeof window !== 'undefined' && window.innerWidth && window.innerHeight) ? (window.innerHeight > window.innerWidth) : false;
        const aspect = W / H;
        const portrait = winPortrait || (W < H);
        const pol = portrait ? 1.18 : 0.95;
        cam.pol = Math.max(0.25, Math.min(1.35, pol));
        GL_camera.fov = portrait ? 60 : 50;
        GL_camera.updateProjectionMatrix();
        const halfV = (GL_camera.fov * Math.PI / 180) / 2;
        const halfH = Math.atan(Math.tan(halfV) * aspect);
        const R = 8.0;                                   // 方盘对角半径（含小人高度冗余）
        const need = R / Math.tan(Math.min(halfV, halfH));
        cam.rad = Math.max(7, Math.min(30, need * (portrait ? 1.05 : 1.02)));
    }`;
const n = t.split(oldS).length - 1;
if (n !== 1) { console.log('ERROR 匹配数:', n); process.exit(1); }
t = t.replace(oldS, newS);
fs.writeFileSync(F, t, 'utf8');
console.log('OK 应用 fitCam 竖屏感知重写');
