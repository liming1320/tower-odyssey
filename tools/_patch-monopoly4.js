// 大富翁 3D 优化补丁（画质 + 玩法视觉）：用 fs 精确替换落盘，规避 Edit 假成功
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'public', 'js', 'minigames', 'monopoly.js');
const IDX = path.join(__dirname, '..', 'public', 'index.html');
let s = fs.readFileSync(F, 'utf8');
let idx = fs.readFileSync(IDX, 'utf8');

function rep(arr, label) {
  const i = arr.indexOf(label.from);
  if (i < 0) throw new Error('未找到: ' + label.name + ' :: ' + label.from.slice(0, 50));
  const j = arr.indexOf(label.from, i + 1);
  if (j >= 0) throw new Error('多处匹配(应唯一): ' + label.name);
  return arr.replace(label.from, label.to);
}

// ---------- 1. 新增 GL 变量声明 ----------
s = rep(s, {
  name: 'vars',
  from: '    let GL_tiles = [], GL_pawns = [], GL_blv = [], GL_owner = [];',
  to: '    let GL_tiles = [], GL_pawns = [], GL_blv = [], GL_owner = [];\n    let GL_turnRing = null, GL_cellMark = null, GL_dice = null, GL_diceRolling = false;',
});

// ---------- 2. tileTexture 升 256px + 各向异性 ----------
s = rep(s, {
  name: 'tileTexture',
  from: `    function tileTexture(c, i) {
        const cv = document.createElement('canvas'); cv.width = cv.height = 128;
        const x = cv.getContext('2d');
        x.fillStyle = '#efe2c2'; x.fillRect(0, 0, 128, 128);
        const g = c.g ? GROUPS[c.g] : null;
        if (g) { x.fillStyle = g.color; x.fillRect(0, 0, 128, 22); }
        x.textAlign = 'center'; x.font = '42px sans-serif'; x.fillStyle = '#2b241a';
        x.fillText(c.e || '', 64, 62);
        x.font = 'bold 15px sans-serif'; x.fillStyle = '#3a2f20'; x.fillText(c.n, 64, 94);
        if (c.t === 'prop') { x.font = '13px sans-serif'; x.fillStyle = '#5a6'; x.fillText(money(S.price[i]), 64, 116); }
        const t = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
        return t;
    }`,
  to: `    function tileTexture(c, i) {
        const cv = document.createElement('canvas'); cv.width = cv.height = 256;
        const x = cv.getContext('2d');
        x.fillStyle = '#efe2c2'; x.fillRect(0, 0, 256, 256);
        const g = c.g ? GROUPS[c.g] : null;
        if (g) { x.fillStyle = g.color; x.fillRect(0, 0, 256, 44); }
        x.textAlign = 'center'; x.font = '84px sans-serif'; x.fillStyle = '#2b241a';
        x.fillText(c.e || '', 128, 122);
        x.font = 'bold 30px sans-serif'; x.fillStyle = '#3a2f20'; x.fillText(c.n, 128, 192);
        if (c.t === 'prop') { x.font = '26px sans-serif'; x.fillStyle = '#5a6'; x.fillText(money(S.price[i]), 128, 234); }
        const t = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
        if (GL_renderer && GL_renderer.capabilities) t.anisotropy = GL_renderer.capabilities.getMaxAnisotropy();
        return t;
    }`,
});

// ---------- 3. tile 顶面改受光材质 + owner 标记发光 ----------
s = rep(s, {
  name: 'buildTiles-top',
  from: `            const top = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tileTexture(c, i) }));
            top.rotation.x = -Math.PI / 2; top.position.y = 0.165; grp.add(top);
            const own = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
            own.position.set(0.34, 0.2, -0.34); own.visible = false; grp.add(own);`,
  to: `            const top = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshStandardMaterial({ map: tileTexture(c, i), roughness: 0.96 }));
            top.rotation.x = -Math.PI / 2; top.position.y = 0.165; top.receiveShadow = true; grp.add(top);
            const own = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.26), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000, roughness: 0.5 }));
            own.position.set(0.34, 0.205, -0.34); own.visible = false; grp.add(own);`,
});

// ---------- 4. syncScene owner emissive 发光 ----------
s = rep(s, {
  name: 'syncScene-own',
  from: `        for (let i = 0; i < N; i++) {
            const o = GL_owner[i], own = S.own[i];
            if (own) { const pl = S.players.find(p => p.id === own); o.visible = true; o.material.color.set(pl ? pl.c : '#ffffff'); }
            else o.visible = false;
        }`,
  to: `        for (let i = 0; i < N; i++) {
            const o = GL_owner[i], own = S.own[i];
            if (own) { const pl = S.players.find(p => p.id === own); o.visible = true; o.material.color.set(pl ? pl.c : '#ffffff'); if (o.material.emissive) { o.material.emissive.set(pl ? pl.c : '#000000'); o.material.emissiveIntensity = 0.4; } }
            else o.visible = false;
        }`,
});

// ---------- 5. start3D 渲染管线升级（start3D 体内 12 空格缩进）----------
s = rep(s, {
  name: 'pipe-tonemap',
  from: `            if (THREE.sRGBEncoding) GL_renderer.outputEncoding = THREE.sRGBEncoding;
            GL_renderer.shadowMap.enabled = true; GL_renderer.shadowMap.type = THREE.PCFSoftShadowMap;`,
  to: `            if (THREE.sRGBEncoding) GL_renderer.outputEncoding = THREE.sRGBEncoding;
            if (THREE.ACESFilmicToneMapping != null) { GL_renderer.toneMapping = THREE.ACESFilmicToneMapping; GL_renderer.toneMappingExposure = 1.12; }
            GL_renderer.shadowMap.enabled = true; GL_renderer.shadowMap.type = THREE.PCFSoftShadowMap;`,
});
s = rep(s, {
  name: 'pipe-scene',
  from: `            GL_scene = new THREE.Scene(); GL_scene.background = new THREE.Color(0x0e1622);
            GL_camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
            GL_scene.add(new THREE.HemisphereLight(0xbfd2ff, 0x40342a, 0.85));`,
  to: `            GL_scene = new THREE.Scene(); GL_scene.background = new THREE.Color(0x0e1622);
            if (THREE.Fog) GL_scene.fog = new THREE.Fog(0x0e1622, 26, 54);
            GL_camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
            GL_scene.add(new THREE.HemisphereLight(0xbfd2ff, 0x40342a, 0.6));
            GL_scene.add(new THREE.AmbientLight(0xffffff, 0.18));`,
});
s = rep(s, {
  name: 'pipe-sun',
  from: `            const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(8, 16, 6); sun.castShadow = true;
            sun.shadow.mapSize.set(1024, 1024);
            const sc = sun.shadow.camera; sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 50; sun.shadow.bias = -0.0006;
            GL_scene.add(sun);`,
  to: `            const sun = new THREE.DirectionalLight(0xfff2d8, 1.05); sun.position.set(8, 17, 6); sun.castShadow = true;
            sun.shadow.mapSize.set(2048, 2048);
            const sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 55; sun.shadow.bias = -0.0005; sun.shadow.radius = 3;
            GL_scene.add(sun);
            const fill = new THREE.DirectionalLight(0x88a0ff, 0.35); fill.position.set(-9, 8, -7); GL_scene.add(fill);
            const glow = new THREE.PointLight(0xffd27a, 0.5, 26, 2); glow.position.set(0, 4.2, 0); GL_scene.add(glow);   // 中央暖光（呼应 logo）`,
});
s = rep(s, {
  name: 'pipe-base',
  from: `            GL_board = new THREE.Group(); GL_scene.add(GL_board); GL_fx.length = 0;
            const base = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.3, 11.6), new THREE.MeshStandardMaterial({ color: 0x16331f, roughness: 0.95 }));
            base.position.y = -0.15; base.receiveShadow = true; GL_board.add(base);`,
  to: `            GL_board = new THREE.Group(); GL_scene.add(GL_board); GL_fx.length = 0;
            const table = new THREE.Mesh(new THREE.BoxGeometry(18, 0.4, 18), new THREE.MeshStandardMaterial({ color: 0x2a1d12, roughness: 0.95, metalness: 0.05 }));
            table.position.y = -0.42; table.receiveShadow = true; GL_board.add(table);        // 桌面（避免棋盘悬浮虚空）
            const base = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.3, 11.6), new THREE.MeshStandardMaterial({ color: 0x16331f, roughness: 0.92 }));
            base.position.y = -0.15; base.receiveShadow = true; GL_board.add(base);`,
});

// ---------- 6a. 建 marks / dice ----------
s = rep(s, {
  name: 'buildCenter-call',
  from: '            buildTiles(); buildBuildings(); buildPawns(); buildCenter();',
  to: '            buildTiles(); buildBuildings(); buildPawns(); buildCenter(); buildMarks(); buildDice();',
});

// ---------- 6b. 接 inspect ----------
s = rep(s, {
  name: 'setupControls-call',
  from: '            setupControls(GL_renderer.domElement);',
  to: '            setupControls(GL_renderer.domElement);\n            setupInspect(GL_renderer.domElement);',
});

// ---------- 7. animate 加回合指示 + 骰子翻滚 ----------
s = rep(s, {
  name: 'animate-marks',
  from: '        // 临时特效推进（建楼闪环 / 飘字 / 高亮渐隐）',
  to: `        // 当前回合玩家指示：脚下金环 + 所在格高亮脉冲
        const ti = (S.turn >= 0 && S.turn < 4) ? S.turn : 0;
        if (GL_turnRing) {
            const tp = GL_pawns[ti];
            if (tp && tp.visible) { GL_turnRing.visible = true; GL_turnRing.position.set(tp.position.x, 0.22 + Math.abs(Math.sin(now * 0.004)) * 0.05, tp.position.z); }
            else GL_turnRing.visible = false;
        }
        if (GL_cellMark) { const cc = S.players[ti] ? S.players[ti].pos : 0, cw = CW[cc]; GL_cellMark.position.set(cw.x, 0.2, cw.z); GL_cellMark.material.opacity = 0.42 + 0.22 * Math.sin(now * 0.005); }
        // 3D 骰子翻滚
        if (GL_dice && GL_diceRolling) { GL_dice.forEach((d, k) => { d.rotation.x += dt * (6 + k * 2.5); d.rotation.y += dt * (5 + k * 2); d.position.y = 1.3 + Math.sin(now * 0.02 + k) * 0.16; }); }

        // 临时特效推进（建楼闪环 / 飘字 / 高亮渐隐）`,
});

// ---------- 8. animDice 接 3D 骰子 ----------
s = rep(s, {
  name: 'animDice',
  from: `    async function animDice(d1, d2) {
        for (let k = 0; k < 6; k++) {
            S.dices = [ri(1, 6), ri(1, 6)];
            if (el.dice) el.dice.innerHTML = \`<i>\${S.dices[0]}</i><i>\${S.dices[1]}</i>\`;
            if (dead) return;
            await sleep(50);
        }
        S.dices = [d1, d2];
        if (el.dice) el.dice.innerHTML = \`<i>\${d1}</i><i>\${d2}</i>\`;
    }`,
  to: `    async function animDice(d1, d2) {
        rollDiceStart();
        for (let k = 0; k < 6; k++) {
            S.dices = [ri(1, 6), ri(1, 6)];
            if (el.dice) el.dice.innerHTML = \`<i>\${S.dices[0]}</i><i>\${S.dices[1]}</i>\`;
            if (dead) return;
            await sleep(50);
        }
        S.dices = [d1, d2];
        if (el.dice) el.dice.innerHTML = \`<i>\${d1}</i><i>\${d2}</i>\`;
        rollDiceEnd(d1, d2);
    }`,
});

// ---------- 9. 新增函数（插在 start3D 之前）----------
s = rep(s, {
  name: 'new-funcs',
  from: '    function start3D(container) {',
  to: `    function buildMarks() {
        if (!GL_board) return;
        GL_turnRing = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9 }));
        GL_turnRing.rotation.x = Math.PI / 2; GL_turnRing.position.y = 0.22; GL_board.add(GL_turnRing);
        GL_cellMark = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 32), new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
        GL_cellMark.rotation.x = -Math.PI / 2; GL_cellMark.position.y = 0.2; GL_board.add(GL_cellMark);
    }
    function buildDice() {
        if (!GL_board) return;
        GL_dice = [];
        for (let k = 0; k < 2; k++) {
            const d = new THREE.Group();
            const cube = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xf6f1e6, roughness: 0.5 }));
            cube.castShadow = true; d.add(cube);
            const sp = emojiSprite('⚀'); sp.scale.set(0.32, 0.32, 0.32); sp.position.y = 0.26; d.add(sp); d.userData.sprite = sp;
            d.position.set(-0.55 + k * 1.1, 1.3, 0); d.visible = false;
            GL_board.add(d); GL_dice.push(d);
        }
    }
    function faceTex(e) {
        const cv = document.createElement('canvas'); cv.width = cv.height = 64;
        const x = cv.getContext('2d'); x.font = '48px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#222'; x.fillText(e, 32, 34);
        const t = new THREE.CanvasTexture(cv); if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; return t;
    }
    function rollDiceStart() { if (!GL_dice) return; GL_diceRolling = true; GL_dice.forEach(d => d.visible = true); }
    function rollDiceEnd(d1, d2) {
        if (!GL_dice) return;
        const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        GL_dice.forEach((d, k) => { const sp = d.userData.sprite; if (sp) { sp.material.map = faceTex(faces[(k === 0 ? d1 : d2) - 1]); sp.material.needsUpdate = true; } d.rotation.set(0, 0, 0); });
        GL_diceRolling = false;
        later(() => { if (GL_dice) GL_dice.forEach(d => d.visible = false); }, 1100);
    }
    function inspectCell(i) {
        const c = CELLS[i]; if (!c) return null;
        const own = S.own[i]; const owner = own ? S.players.find(p => p.id === own) : null;
        let html = '<b>' + (c.e || '') + ' ' + c.n + '</b>';
        if (c.t === 'prop') {
            html += '<br>售价 ' + money(S.price[i]);
            if (S.lv[i] > 0) html += ' · ' + (S.lv[i] >= 5 ? '🏨酒店' : '🏠Lv' + S.lv[i]);
            else if (c.g && ownsGroup(own || -1, c.g)) html += ' · 街区已集齐';
            html += '<br>租金 ' + money(rentOf(i));
            html += '<br>归属 ' + (owner ? owner.name : '无主') + (S.mort[i] ? '（已抵押）' : '');
        } else if (c.t === 'station') html += '<br>车站 · 售价 ' + money(S.price[i]) + ' · 持有车站数决定租金';
        else if (c.t === 'utility') html += '<br>水电 · 售价 ' + money(S.price[i]) + ' · 按骰子点数收租';
        else if (c.t === 'tax') html += '<br>税 · 缴纳 ' + money(c.v);
        else if (c.t === 'chance') html += '<br>机会格 · 抽机会卡';
        else if (c.t === 'fortune') html += '<br>命运格 · 抽命运卡';
        else if (c.t === 'god') html += '<br>神明格 · 随机遇神明';
        else if (c.t === 'go') html += '<br>起点 · 经过领工资';
        else if (c.t === 'jail') html += '<br>监狱';
        else if (c.t === 'gotojail') html += '<br>进监狱';
        else if (c.t === 'park') html += '<br>免费停车';
        return html;
    }
    function setupInspect(cv) {
        if (!cv || !THREE || !GL_board || !GL_camera) return;
        const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
        let tip = null;
        const hide = () => { if (tip) { tip.remove(); tip = null; } };
        cv.addEventListener('click', e => {
            if (!GL_renderer) return;
            const r = cv.getBoundingClientRect();
            ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
            ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
            ray.setFromCamera(ndc, GL_camera);
            const hit = ray.intersectObjects(GL_tiles, true)[0];
            if (!hit) return hide();
            let g = hit.object; while (g && GL_tiles.indexOf(g) < 0) g = g.parent;
            const ix = GL_tiles.indexOf(g); if (ix < 0) return hide();
            const html = inspectCell(ix); if (!html) return hide();
            if (!tip) { tip = document.createElement('div'); tip.style.cssText = 'position:absolute;z-index:9;max-width:210px;background:rgba(18,24,34,.94);color:#e8eefb;font:12px/1.5 system-ui;padding:8px 10px;border:1px solid #3a4a63;border-radius:8px;pointer-events:none;box-shadow:0 6px 18px rgba(0,0,0,.4)'; cv.parentElement.appendChild(tip); }
            tip.innerHTML = html; tip.style.left = (e.clientX - r.left + 12) + 'px'; tip.style.top = (e.clientY - r.top + 12) + 'px';
        });
        cv.addEventListener('pointermove', e => { if (tip) { const r = cv.getBoundingClientRect(); tip.style.left = (e.clientX - r.left + 12) + 'px'; tip.style.top = (e.clientY - r.top + 12) + 'px'; } });
    }
    function start3D(container) {`,
});

// ---------- 10. _debug 暴露新钩子 ----------
s = rep(s, {
  name: 'debug-hooks',
  from: '        fxCount: () => GL_fx.length,',
  to: `        fxCount: () => GL_fx.length,
        turnRing: () => !!GL_turnRing,
        cellMark: () => !!GL_cellMark,
        diceCount: () => GL_dice ? GL_dice.length : 0,
        inspect: (i) => inspectCell(i),`,
});

// ---------- 11. index.html 版本号 bump ----------
if (!/monopoly\.js\?v=20260920k/.test(idx)) {
  idx = rep(idx, {
    name: 'idx-version',
    from: '<script src="/js/minigames/monopoly.js?v=20260920j"></script>',
    to: '<script src="/js/minigames/monopoly.js?v=20260920k"></script>',
  });
}

fs.writeFileSync(F, s);
fs.writeFileSync(IDX, idx);
console.log('OK 全部补丁应用');
