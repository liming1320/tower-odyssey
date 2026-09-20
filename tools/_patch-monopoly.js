// 一次性补丁：用精确字符串替换给 monopoly.js 的 3D 层加上脚步声 / 建楼闪光 / 竖屏取景。
// 用 fs 直接落盘，避免 Edit 工具偶发的「假成功」。每个替换都断言旧串恰出现 1 次。
const fs = require('fs');
const F = 'E:/WorkSpace/tower-odyssey/public/js/minigames/monopoly.js';
let t = fs.readFileSync(F, 'utf8');

const reps = [];
function add(old, nw) { reps.push({ old, nw }); }

// 1) 状态声明：GL_fx / GL_blvLevel
add(
`    let GL_deco = [];                     // 中央装饰（logo / 机会命运牌堆 / 起点监狱标记）`,
`    let GL_deco = [];                     // 中央装饰（logo / 机会命运牌堆 / 起点监狱标记）
    let GL_fx = [];                      // 临时特效（建楼闪光环 / 飘字 / 高亮渐隐）
    let GL_blvLevel = [];                // 每格上次同步到的建筑等级（检测升级→触发闪光）`);

// 2) buildBuildings：初始化 GL_blvLevel
add(
`    function buildBuildings() {
        for (let i = 0; i < N; i++) {
            const c = CELLS[i]; if (c.t !== 'prop') { GL_blv.push(null); continue; }`,
`    function buildBuildings() {
        for (let i = 0; i < N; i++) {
            GL_blvLevel[i] = S.lv[i];
            const c = CELLS[i]; if (c.t !== 'prop') { GL_blv.push(null); continue; }`);

// 3) flashBuild 函数（插在 syncScene 之前）
add(
`    function syncScene() {`,
`    // 建楼/升级闪光特效：扩散金环 + 新建楼/酒店 emissive 金光渐隐 + 飘字「⬆」
    // 由 syncScene 检测等级上升触发，覆盖人类建楼 / 建房卡 / 联机对手建楼等所有路径
    function flashBuild(i) {
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
    }

    function syncScene() {`);

// 4) syncScene 末尾：检测等级上升触发闪光
add(
`        // 小人：仅当队列为空且逻辑位置已漂移（卡牌传送 / 监狱等）时吸附对齐；行走由 animate 逐格播放
        for (let i = 0; i < 4; i++) {
            const pos = S.players[i].pos; if (pos == null) continue;
            if (!pawnQueue[i].length && pos !== pawnCell[i]) { pawnCell[i] = pos; pawnStep[i] = 0; }
        }
    }`,
`        // 小人：仅当队列为空且逻辑位置已漂移（卡牌传送 / 监狱等）时吸附对齐；行走由 animate 逐格播放
        for (let i = 0; i < 4; i++) {
            const pos = S.players[i].pos; if (pos == null) continue;
            if (!pawnQueue[i].length && pos !== pawnCell[i]) { pawnCell[i] = pos; pawnStep[i] = 0; }
        }
        // 建楼升级检测：等级比上次同步高 → 触发闪光特效
        for (let i = 0; i < N; i++) {
            if (!GL_blv[i]) { GL_blvLevel[i] = S.lv[i]; continue; }
            if (S.lv[i] > (GL_blvLevel[i] || 0)) { GL_blvLevel[i] = S.lv[i]; flashBuild(i); }
        }
    }`);

// 5) animate 末尾：推进临时特效
add(
`            GL_pawns[i].position.set(x + ox, hop, z + oz);
        }
        GL_renderer.render(GL_scene, GL_camera);`,
`            GL_pawns[i].position.set(x + ox, hop, z + oz);
        }
        // 临时特效推进（建楼闪环 / 飘字 / 高亮渐隐）
        for (let k = GL_fx.length - 1; k >= 0; k--) {
            const fx = GL_fx[k]; fx.t += dt;
            const f = fx.t / fx.dur;
            if (f >= 1) {
                if (fx.mesh) { GL_board.remove(fx.mesh); try { fx.mesh.geometry.dispose(); fx.mesh.material.dispose(); } catch (e) {} }
                if (fx.mats) fx.mats.forEach(m => { try { m.emissive.setRGB(0, 0, 0); } catch (e) {} });
                GL_fx.splice(k, 1); continue;
            }
            if (fx.type === 'ring') { const s = 1 + f * 2.6; fx.mesh.scale.set(s, s, s); fx.mesh.material.opacity = 0.95 * (1 - f); }
            else if (fx.type === 'float') { fx.mesh.position.y = 0.9 + f * 0.7; fx.mesh.material.opacity = 1 - f; }
            else if (fx.type === 'glow') { const g = 1 - f; fx.mats.forEach(m => m.emissive.setRGB(1 * g, 0.84 * g, 0.42 * g)); }
        }
        GL_renderer.render(GL_scene, GL_camera);`);

let applied = 0, skipped = 0;
for (const r of reps) {
  const n = t.split(r.old).length - 1;
  if (n === 0) { console.log('SKIP (已应用或缺失):', r.old.slice(0, 40).replace(/\n/g, ' ')); skipped++; continue; }
  if (n > 1) { console.log('ERROR 出现', n, '次:', r.old.slice(0, 40)); process.exit(1); }
  t = t.replace(r.old, r.nw); applied++;
  console.log('OK 应用:', r.old.slice(0, 40).replace(/\n/g, ' '));
}
fs.writeFileSync(F, t, 'utf8');
console.log(`\n完成：应用 ${applied} 处，跳过 ${skipped} 处`);
