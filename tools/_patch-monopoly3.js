// 补丁3：强化建楼闪光（叠加爆闪圆盘 + 更亮金环 + 更大飘字），并让 animate 支持 burst
const fs = require('fs');
const F = 'E:/WorkSpace/tower-odyssey/public/js/minigames/monopoly.js';
let t = fs.readFileSync(F, 'utf8');

const oldFn = `    function flashBuild(i) {
        if (!THREE || !GL_board) return;
        const w = CW[i];
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.46, 32),
            new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(w.x, 0.28, w.z);
        GL_board.add(ring); GL_fx.push({ mesh: ring, t: 0, dur: 0.62, type: 'ring' });
        const b = GL_blv[i], glow = [];
        if (b) {
            const pcs = (S.lv[i] >= 5) ? b.hotel.children : (b.slots[S.lv[i] - 1] ? b.slots[S.lv[i] - 1].children : []);
            pcs.forEach(m => { if (m.material && m.material.emissive) { m.material.emissive.setHex(0xffd86b); glow.push(m.material); } });
        }
        if (glow.length) GL_fx.push({ mats: glow, t: 0, dur: 0.7, type: 'glow' });
        const sp = emojiSprite('⬆️'); sp.position.set(w.x, 0.9, w.z); sp.scale.set(0.7, 0.7, 0.7);
        GL_board.add(sp); GL_fx.push({ mesh: sp, t: 0, dur: 0.85, type: 'float' });
    }`;

const newFn = `    function flashBuild(i) {
        if (!THREE || !GL_board) return;
        const w = CW[i];
        // 亮金爆闪圆盘（叠加混合，最抓眼）
        const burst = new THREE.Mesh(new THREE.CircleGeometry(0.62, 32),
            new THREE.MeshBasicMaterial({ color: 0xffd86b, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        burst.rotation.x = -Math.PI / 2; burst.position.set(w.x, 0.30, w.z);
        GL_board.add(burst); GL_fx.push({ mesh: burst, t: 0, dur: 0.5, type: 'burst' });
        // 扩散金环
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.5, 40),
            new THREE.MeshBasicMaterial({ color: 0xfff0a8, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(w.x, 0.31, w.z);
        GL_board.add(ring); GL_fx.push({ mesh: ring, t: 0, dur: 0.68, type: 'ring' });
        // 新建楼/酒店高亮（emissive 金光渐隐）
        const b = GL_blv[i], glow = [];
        if (b) {
            const pcs = (S.lv[i] >= 5) ? b.hotel.children : (b.slots[S.lv[i] - 1] ? b.slots[S.lv[i] - 1].children : []);
            pcs.forEach(m => { if (m.material && m.material.emissive) { m.material.emissive.setHex(0xffd86b); glow.push(m.material); } });
        }
        if (glow.length) GL_fx.push({ mats: glow, t: 0, dur: 0.7, type: 'glow' });
        // 飘字「⬆」
        const sp = emojiSprite('⬆️'); sp.position.set(w.x, 0.95, w.z); sp.scale.set(0.9, 0.9, 0.9);
        GL_board.add(sp); GL_fx.push({ mesh: sp, t: 0, dur: 0.9, type: 'float' });
    }`;

const oldAnim = `            if (fx.type === 'ring') { const s = 1 + f * 2.6; fx.mesh.scale.set(s, s, s); fx.mesh.material.opacity = 0.95 * (1 - f); }
            else if (fx.type === 'float') { fx.mesh.position.y = 0.9 + f * 0.7; fx.mesh.material.opacity = 1 - f; }
            else if (fx.type === 'glow') { const g = 1 - f; fx.mats.forEach(m => m.emissive.setRGB(1 * g, 0.84 * g, 0.42 * g)); }`;

const newAnim = `            if (fx.type === 'burst') { const s = 1 + f * 2.2; fx.mesh.scale.set(s, s, s); fx.mesh.material.opacity = 0.95 * (1 - f) * (1 - f); }
            else if (fx.type === 'ring') { const s = 1 + f * 2.6; fx.mesh.scale.set(s, s, s); fx.mesh.material.opacity = 1 - f; }
            else if (fx.type === 'float') { fx.mesh.position.y = 0.95 + f * 0.75; fx.mesh.material.opacity = 1 - f; }
            else if (fx.type === 'glow') { const g = 1 - f; fx.mats.forEach(m => m.emissive.setRGB(1 * g, 0.84 * g, 0.42 * g)); }`;

for (const [o, nw, tag] of [[oldFn, newFn, 'flashBuild'], [oldAnim, newAnim, 'animate-fx']]) {
  const c = t.split(o).length - 1;
  if (c !== 1) { console.log('ERROR', tag, '匹配数:', c); process.exit(1); }
  t = t.replace(o, nw); console.log('OK 应用', tag);
}
fs.writeFileSync(F, t, 'utf8');
console.log('完成');
