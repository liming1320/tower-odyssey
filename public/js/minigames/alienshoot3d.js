// 孤胆枪手3D：Three.js 真 3D 第一人称射击（懒加载，零运行时外部依赖）
// 进游戏才注入本地 /js/lib/three.min.js，得到 window.THREE 后搭建场景。
// 复用框架契约：opts.levelIdx / opts.onComplete / opts.onScore / api.stop()
window.MiniGames = window.MiniGames || {};
(function () {
    const W = 420, H = 560;
    const MW = 24, MH = 24;
    const EYE = 0.55;                 // 视点高度
    const THREE_SRC = '/js/lib/three.min.js?v=20260916a';
    const NAMES = ['前哨遇袭', '隧道清剿', '巢穴深入', '钢铁风暴'];

    // ---- Three.js 懒加载（全局只加载一次）----
    let THREE = null, THREE_LOADING = null;
    function ensureThree() {
        if (THREE) return Promise.resolve(THREE);
        if (THREE_LOADING) return THREE_LOADING;
        THREE_LOADING = new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = THREE_SRC;
            s.onload = () => res(window.THREE);
            s.onerror = () => rej(new Error('Three.js 加载失败（请检查 /js/lib/three.min.js）'));
            document.head.appendChild(s);
        });
        THREE_LOADING.then(t => { THREE = t; }).catch(() => {});
        return THREE_LOADING;
    }

    function buildMap() {
        const g = [];
        for (let y = 0; y < MH; y++) {
            const row = [];
            for (let x = 0; x < MW; x++) row.push((x === 0 || y === 0 || x === MW - 1 || y === MH - 1) ? 1 : 0);
            g.push(row);
        }
        const rect = (x0, y0, w, h, v) => {
            for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++)
                if (y > 0 && y < MH - 1 && x > 0 && x < MW - 1) g[y][x] = v;
        };
        rect(2, 2, 4, 4, 2); rect(18, 2, 4, 4, 3); rect(2, 18, 4, 4, 3); rect(18, 18, 4, 4, 2);
        rect(11, 2, 2, 3, 2); rect(11, 19, 2, 3, 2); rect(2, 11, 3, 2, 2); rect(19, 11, 3, 2, 3);
        return g;
    }

    const lv = [];
    for (let i = 0; i < 50; i++) {
        const quota = 10 + i * 2;
        lv.push({ name: NAMES[i % NAMES.length] + ' ' + (Math.floor(i / NAMES.length) + 1), desc: `击杀 ${quota} 只异形 · 首领每 ${Math.max(3, 8 - Math.floor(i / 10))} 波出现` });
    }

    // 程序化草地贴图（不依赖任何外部图片）
    function grassTexture(THREE) {
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const x = c.getContext('2d');
        x.fillStyle = '#3f5a32'; x.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 1400; i++) {
            const px = Math.random() * 128, py = Math.random() * 128;
            const t = Math.random();
            x.fillStyle = t < 0.5 ? 'rgba(70,100,50,0.5)' : t < 0.8 ? 'rgba(45,70,38,0.5)' : 'rgba(110,140,80,0.4)';
            x.fillRect(px, py, 1.5, 1.5);
        }
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(MW, MH);
        if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
        return t;
    }

    // 程序化石材贴图（不依赖任何外部图片）
    function stoneTexture(THREE, base, dark) {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const x = c.getContext('2d');
        x.fillStyle = base; x.fillRect(0, 0, 64, 64);
        for (let i = 0; i < 240; i++) {
            const px = Math.random() * 64, py = Math.random() * 64, s = 2 + Math.random() * 5;
            x.fillStyle = Math.random() < 0.5 ? dark : 'rgba(255,255,255,0.06)';
            x.fillRect(px, py, s, s);
        }
        // 砖缝
        x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 1;
        for (let yy = 8; yy <= 64; yy += 16) { x.beginPath(); x.moveTo(0, yy); x.lineTo(64, yy); x.stroke(); }
        for (let xx = 8; xx <= 64; xx += 16) { x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, 64); x.stroke(); }
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1);
        if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
        return t;
    }

    MiniGames.alienshoot3d = {
        LEVELS: lv,
        start(container, opts) {
            const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : 0;
            const quota = 10 + idx * 2;
            const spawnInt = Math.max(0.5, 1.4 - idx * 0.018);
            const grid = buildMap();

            // 游戏状态
            let px = 12, py = 12, yaw = 0, pitch = 0, hp = 100, kills = 0, over = false, t = 0, wave = 0, score = 0;
            let aliens = [], decals = [], shake = 0, muzzle = 0, medkits = [], recoil = 0, hitMark = 0, medT = 6;
            let dirX = 1, dirY = 0;
            const canStand = (x, y) => { const cx = Math.floor(x), cy = Math.floor(y); return cx > 0 && cy > 0 && cx < MW - 1 && cy < MH - 1 && grid[cy][cx] === 0; };

            // UI 舞台
            container.innerHTML = '';
            const stage = document.createElement('div');
            stage.style.cssText = `position:relative;width:${W}px;height:${H}px;margin:0 auto;`;
            container.appendChild(stage);
            const loading = document.createElement('div');
            loading.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cfe3ff;font:14px sans-serif;text-align:center;background:#0a0e14;';
            loading.textContent = '加载 3D 引擎…';
            stage.appendChild(loading);

            let stopped = false, raf = 0, cleanups = [];
            const done = (win, lines) => {
                if (over) return; over = true;
                if (raf) cancelAnimationFrame(raf);
                try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
                opts.onComplete && opts.onComplete({ win, stars: win ? (hp >= 80 ? 3 : hp >= 45 ? 2 : 1) : 0, lines });
            };

            ensureThree().then(THREE => {
                if (stopped) return;
                loading.remove();
                buildGame(THREE);
            }).catch(err => {
                loading.textContent = '3D 引擎加载失败：' + err.message;
            });

            function buildGame(THREE) {
                // 渲染器
                const renderer = new THREE.WebGLRenderer({ antialias: true });
                renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
                renderer.setSize(W, H, false);
                if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
                renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:crosshair;background:#000;';
                stage.appendChild(renderer.domElement);

                const hud = document.createElement('canvas');
                hud.width = W; hud.height = H;
                hud.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
                stage.appendChild(hud);
                const hctx = hud.getContext('2d');

                const scene = new THREE.Scene();
                scene.background = new THREE.Color(0x0e131c);
                scene.fog = new THREE.Fog(0x0e131c, 7, 22);

                const camera = new THREE.PerspectiveCamera(72, W / H, 0.1, 100);
                scene.add(camera);

                // 灯光（户外黄昏感）
                scene.add(new THREE.HemisphereLight(0x88aadd, 0x334422, 0.75));
                const sun = new THREE.DirectionalLight(0xffffff, 0.65);
                sun.position.set(6, 14, 4);
                scene.add(sun);

                // 地面
                const ground = new THREE.Mesh(
                    new THREE.PlaneGeometry(MW, MH),
                    new THREE.MeshStandardMaterial({ map: grassTexture(THREE), roughness: 1 })
                );
                ground.rotation.x = -Math.PI / 2;
                ground.position.set(MW / 2, 0, MH / 2);
                scene.add(ground);

                // 墙体：每种类型单独 InstancedMesh + 程序化石材贴图（仍是极少 draw call）
                const wallCells = [];
                for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (grid[y][x] > 0) wallCells.push({ x, y, v: grid[y][x] });
                const wallGeo = new THREE.BoxGeometry(1, 1, 1);
                const m4 = new THREE.Matrix4();
                const wallMeshes = [];   // 用于射线射击求交
                const wallDefs = {
                    2: { base: '#6a4f2e', dark: 'rgba(40,28,14,0.5)', emissive: 0x140d05 },
                    3: { base: '#595563', dark: 'rgba(20,18,28,0.5)', emissive: 0x0e0d14 },
                    1: { base: '#444049', dark: 'rgba(15,13,18,0.5)', emissive: 0x0c0a0f },
                };
                for (const v in wallDefs) {
                    const def = wallDefs[v];
                    const cells = wallCells.filter(c => c.v === +v);
                    if (!cells.length) continue;
                    const mat = new THREE.MeshStandardMaterial({
                        map: stoneTexture(THREE, def.base, def.dark),
                        roughness: 0.95, metalness: 0, emissive: def.emissive, emissiveIntensity: 0.4,
                    });
                    const im = new THREE.InstancedMesh(wallGeo, mat, cells.length);
                    cells.forEach((c, i) => { m4.makeTranslation(c.x + 0.5, 0.5, c.y + 0.5); im.setMatrixAt(i, m4); });
                    im.instanceMatrix.needsUpdate = true;
                    scene.add(im); wallMeshes.push(im);
                }

                // 第一人称枪（挂在相机下，随视角移动）
                const gun = new THREE.Group();
                const gunMat = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.6, metalness: 0.4 });
                const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.42), gunMat); barrel.position.set(0, 0, -0.22);
                const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.22), gunMat); body.position.set(0, -0.02, 0.02);
                const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.06), gunMat); grip.position.set(0, -0.1, 0.1); grip.rotation.x = 0.3;
                gun.add(barrel); gun.add(body); gun.add(grip);
                gun.position.set(0.2, -0.24, -0.5);
                camera.add(gun);
                const muzzleLight = new THREE.PointLight(0xffb060, 0, 4);
                muzzleLight.position.set(0.2, -0.24, -0.75);
                camera.add(muzzleLight);

                // 异形资源（共享几何/材质）
                const TYPE = {
                    grunt: { r: 0.28, hp: 1, v: 2.2, color: 0x7fae4a },
                    runner: { r: 0.22, hp: 1, v: 3.7, color: 0xd8c24a },
                    tank: { r: 0.5, hp: 5 + Math.floor(idx / 12), v: 1.3, color: 0xb04ad8 },
                };
                const shared = {};
                for (const k in TYPE) {
                    const ty = TYPE[k];
                    shared[k] = {
                        body: new THREE.CapsuleGeometry(ty.r, ty.r * 1.2, 4, 12),
                        mat: new THREE.MeshStandardMaterial({ color: ty.color, roughness: 0.7, emissive: ty.color, emissiveIntensity: 0.12 }),
                        eyeMat: new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff2020, emissiveIntensity: 1.0 }),
                        eyeGeo: new THREE.SphereGeometry(ty.r * 0.18, 8, 8),
                    };
                }
                const hitMeshes = [];   // 用于射线射击的实体（胶囊体）
                const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });  // 命中闪白（共享）

                // 医疗包（红十字符子，走到附近自动拾取回血）
                function spawnMedkit() {
                    let x, y, tries = 0;
                    do { x = 1 + Math.random() * (MW - 2); y = 1 + Math.random() * (MH - 2); tries++; } while (!canStand(x, y) && tries < 60);
                    const g = new THREE.Group();
                    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0x222222 })));
                    const cm = new THREE.MeshBasicMaterial({ color: 0xff2b2b });
                    const cv = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.34), cm); cv.position.z = 0.001;
                    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.34), cm); ch.position.z = 0.001;
                    g.add(cv); g.add(ch);
                    g.position.set(x + 0.5, 0.28, y + 0.5);
                    scene.add(g);
                    medkits.push({ x: x + 0.5, y: y + 0.5, mesh: g, taken: false });
                }

                function spawnAlienMesh(a) {
                    const s = shared[a.type];
                    const g = new THREE.Group();
                    const body = new THREE.Mesh(s.body, s.mat);
                    body.userData.alien = a;
                    g.add(body);
                    for (const sgn of [-1, 1]) {
                        const eye = new THREE.Mesh(s.eyeGeo, s.eyeMat);
                        eye.position.set(sgn * a.r * 0.35, a.r * 0.7, -a.r * 0.9);
                        g.add(eye);
                    }
                    g.position.set(a.x, a.r + 0.05, a.y);
                    scene.add(g);
                    a.mesh = g; a.bodyMesh = body;
                    hitMeshes.push(body);
                }
                function removeAlienMesh(a) {
                    if (a.mesh) scene.remove(a.mesh);
                    const i = hitMeshes.indexOf(a.bodyMesh); if (i >= 0) hitMeshes.splice(i, 1);
                }

                function spawn() {
                    if (kills >= quota) return;  // 达成击杀目标后停刷，清场即胜
                    wave++;
                    const boss = wave % Math.max(3, 8 - Math.floor(idx / 10)) === 0;
                    let x, y, tries = 0;
                    do {
                        const a = Math.random() * Math.PI * 2, dist = 7 + Math.random() * 6;
                        x = px + Math.cos(a) * dist; y = py + Math.sin(a) * dist; tries++;
                    } while ((!canStand(x, y) || Math.hypot(x - px, y - py) < 5) && tries < 50);
                    x = Math.max(1, Math.min(MW - 2, x)); y = Math.max(1, Math.min(MH - 2, y));
                    const type = boss ? 'tank' : Math.random() < 0.25 ? 'runner' : 'grunt';
                    const st = TYPE[type];
                    const a = { x, y, type, r: st.r, hp: st.hp, v: st.v, maxHp: st.hp, hitT: 0 };
                    aliens.push(a); spawnAlienMesh(a);
                }

                const ray = new THREE.Raycaster();
                const center = new THREE.Vector2(0, 0);
                function fire() {
                    muzzle = 0.06; muzzleLight.intensity = 3.2; recoil = 0.05;
                    ray.setFromCamera(center, camera);
                    const objs = wallMeshes.concat(hitMeshes);
                    const hits = ray.intersectObjects(objs, false);
                    if (hits.length) {
                        const h = hits[0];
                        const a = h.object.userData.alien;
                        if (a && h.distance < 18) {
                            a.hp--; a.hitT = 0.1;
                            if (a.hp <= 0) {
                                kills++; score += a.type === 'tank' ? 50 : a.type === 'runner' ? 25 : 10;
                                removeAlienMesh(a);
                                aliens = aliens.filter(z => z !== a);
                                if (kills >= quota && aliens.length === 0) return done(true, ['区域肃清！', `击杀 ${kills} · 剩余 HP ${Math.round(hp)}`]);
                            } else hitMark = 0.16;
                        }
                    }
                }

                // ---- 输入 ----
                const keys = new Set();
                let firing = false, ptrLock = false, isTouch = false;
                let joyId = null, joyVx = 0, joyVy = 0, joyOx = 0, joyOy = 0;
                let turnId = null, turnOx = 0, turnOy = 0;
                const cvs = renderer.domElement;

                const kd = e => { const k = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e', ' '].includes(k)) { keys.add(k); if (k === ' ') firing = true; e.preventDefault(); } };
                const ku = e => { const k = e.key.toLowerCase(); keys.delete(k); if (k === ' ') firing = false; };
                window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
                cleanups.push(() => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); });

                cvs.addEventListener('click', () => { if (!isTouch && !ptrLock && cvs.requestPointerLock) cvs.requestPointerLock(); });
                const onMM = e => { if (ptrLock) { yaw += e.movementX * 0.0026; pitch -= e.movementY * 0.0022; pitch = Math.max(-0.5, Math.min(0.5, pitch)); } };
                document.addEventListener('mousemove', onMM);
                cleanups.push(() => document.removeEventListener('mousemove', onMM));
                const onPLC = () => { ptrLock = document.pointerLockElement === cvs; };
                document.addEventListener('pointerlockchange', onPLC);
                cleanups.push(() => document.removeEventListener('pointerlockchange', onPLC));
                cvs.addEventListener('mousedown', e => { if (e.pointerType === 'mouse' || e.pointerType === undefined) firing = true; });
                window.addEventListener('mouseup', () => { firing = false; });
                cleanups.push(() => window.removeEventListener('mouseup', () => { firing = false; }));

                cvs.addEventListener('pointerdown', e => {
                    if (e.pointerType === 'mouse') return;
                    isTouch = true;
                    const r = cvs.getBoundingClientRect();
                    const lx = (e.clientX - r.left) * (W / r.width);
                    if (lx < W * 0.42) { joyId = e.pointerId; joyOx = e.clientX; joyOy = e.clientY; joyVx = 0; joyVy = 0; }
                    else { firing = true; turnId = e.pointerId; turnOx = e.clientX; turnOy = e.clientY; }
                });
                cvs.addEventListener('pointermove', e => {
                    if (e.pointerType === 'mouse') return;
                    if (e.pointerId === joyId) {
                        const dx = e.clientX - joyOx, dy = e.clientY - joyOy, d = Math.hypot(dx, dy) || 1, f = Math.min(1, d / 42);
                        joyVx = dx / 42 * f; joyVy = dy / 42 * f;
                    } else if (e.pointerId === turnId) {
                        const dx = e.clientX - turnOx, dy = e.clientY - turnOy; turnOx = e.clientX; turnOy = e.clientY;
                        yaw += dx * 0.005; pitch -= dy * 0.004; pitch = Math.max(-0.5, Math.min(0.5, pitch));
                    }
                });
                const endPtr = e => {
                    if (e.pointerId === joyId) { joyId = null; joyVx = 0; joyVy = 0; }
                    if (e.pointerId === turnId) { turnId = null; firing = false; }
                    if (e.pointerType === 'mouse') firing = false;
                };
                cvs.addEventListener('pointerup', endPtr); cvs.addEventListener('pointercancel', endPtr);
                cleanups.push(() => { cvs.removeEventListener('pointerup', endPtr); cvs.removeEventListener('pointercancel', endPtr); });

                // ---- 主循环 ----
                let spawnT = 0, cool = 0, last = performance.now();
                const SP = 2.6;
                function step(now) {
                    if (over) return;
                    const dt = Math.min(0.05, (now - last) / 1000); last = now;
                    t += dt; cool -= dt; muzzle -= dt; spawnT -= dt; hitMark -= dt;
                    recoil = Math.max(0, recoil - dt * 0.45);
                    if (muzzleLight.intensity > 0) muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 40);

                    // 移动
                    let mvx = 0, mvy = 0;
                    if (keys.has('w') || keys.has('arrowup')) { mvx += dirX; mvy += dirY; }
                    if (keys.has('s') || keys.has('arrowdown')) { mvx -= dirX; mvy -= dirY; }
                    if (keys.has('a')) { mvx += -dirY; mvy += dirX; }
                    if (keys.has('d')) { mvx += dirY; mvy += -dirX; }
                    if (keys.has('arrowleft') || keys.has('q')) yaw -= 2.4 * dt;
                    if (keys.has('arrowright') || keys.has('e')) yaw += 2.4 * dt;
                    if (joyId !== null) { const fwd = -joyVy, str = joyVx; mvx += fwd * dirX + str * (-dirY); mvy += fwd * dirY + str * dirX; }
                    dirX = Math.cos(yaw); dirY = Math.sin(yaw);
                    const ml = Math.hypot(mvx, mvy);
                    if (ml > 0.001) {
                        const sp = SP * dt, dx = mvx / ml * sp, dy = mvy / ml * sp, r = 0.26;
                        if (canStand(px + dx + Math.sign(dx) * r, py)) px += dx;
                        if (canStand(px, py + dy + Math.sign(dy) * r)) py += dy;
                    }
                    if (firing && cool <= 0) { fire(); cool = 0.14; }
                    if (spawnT <= 0) { spawn(); spawnT = spawnInt * (0.7 + Math.random() * 0.6); }
                    medT -= dt; if (medT <= 0 && medkits.length < 3) { spawnMedkit(); medT = 9 + Math.random() * 5; }

                    // 异形移动 + 渲染同步
                    for (const a of aliens) {
                        const dx = px - a.x, dy = py - a.y, d = Math.hypot(dx, dy) || 1, sp = a.v * dt;
                        const mx = (dx / d) * sp, my = (dy / d) * sp;
                        if (canStand(a.x + mx + Math.sign(mx) * 0.2, a.y)) a.x += mx;
                        if (canStand(a.x, a.y + my + Math.sign(my) * 0.2)) a.y += my;
                        a.hitT -= dt;
                        a.mesh.position.set(a.x, a.r + 0.05 + Math.sin(t * 6 + a.x) * 0.04, a.y);
                        a.mesh.lookAt(px, a.r + 0.05, py);
                        if (a.hitT > 0) a.bodyMesh.material = flashMat; else a.bodyMesh.material = shared[a.type].mat;
                        if (d < a.r + 0.6) { hp -= (a.type === 'tank' ? 14 : 7) * dt * 3; shake = 4; if (hp <= 0) return done(false, ['你被异形吞没了…', `击杀 ${kills}/${quota}`]); }
                    }

                    // 医疗包：旋转 + 靠近拾取回血
                    for (const m of medkits) {
                        m.mesh.rotation.y += dt * 1.6;
                        if (Math.hypot(px - m.x, py - m.y) < 0.6) { hp = Math.min(100, hp + 35); m.taken = true; }
                    }
                    medkits = medkits.filter(m => { if (m.taken) { scene.remove(m.mesh); return false; } return true; });

                    // 相机（受击抖动）
                    let sx = 0, sy = 0;
                    if (shake > 0) { shake = Math.max(0, shake - dt * 22); sx = (Math.random() - 0.5) * shake * 0.02; sy = (Math.random() - 0.5) * shake * 0.02; }
                    camera.position.set(px + sx, EYE + sy, py + sy);
                    const cp = Math.cos(pitch), sp2 = Math.sin(pitch);
                    camera.lookAt(px + dirX * cp, EYE + sp2, py + dirY * cp);

                    // 枪械：后坐 + 行走晃动
                    const moving = ml > 0.001;
                    gun.position.z = -0.5 + recoil - (moving ? Math.abs(Math.sin(t * 9)) * 0.012 : 0);
                    gun.position.y = -0.24 + (moving ? Math.sin(t * 9) * 0.008 : 0);

                    renderer.render(scene, camera);
                    drawHUD();
                    opts.onScore && opts.onScore(`击杀 ${kills}/${quota} · HP ${Math.max(0, Math.round(hp))}`);
                    raf = requestAnimationFrame(step);
                }

                function drawHUD() {
                    const x = hctx; x.clearRect(0, 0, W, H);
                    // 暗角
                    const vg = x.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.8);
                    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)');
                    x.fillStyle = vg; x.fillRect(0, 0, W, H);
                    // 准星
                    x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 1.5;
                    x.beginPath(); x.arc(W / 2, H / 2, 7, 0, Math.PI * 2); x.stroke();
                    x.beginPath();
                    x.moveTo(W / 2 - 11, H / 2); x.lineTo(W / 2 - 4, H / 2);
                    x.moveTo(W / 2 + 4, H / 2); x.lineTo(W / 2 + 11, H / 2);
                    x.moveTo(W / 2, H / 2 - 11); x.lineTo(W / 2, H / 2 - 4);
                    x.moveTo(W / 2, H / 2 + 4); x.lineTo(W / 2, H / 2 + 11); x.stroke();
                    // 命中标记（击中异形但未致命时闪红 X）
                    if (hitMark > 0) {
                        x.strokeStyle = 'rgba(255,70,70,0.95)'; x.lineWidth = 2.5; const r = 9;
                        x.beginPath();
                        x.moveTo(W / 2 - r, H / 2 - r); x.lineTo(W / 2 + r, H / 2 + r);
                        x.moveTo(W / 2 + r, H / 2 - r); x.lineTo(W / 2 - r, H / 2 + r); x.stroke();
                    }
                    // 血条
                    x.fillStyle = '#333'; x.fillRect(8, 8, 120, 10);
                    x.fillStyle = hp > 40 ? '#5ad48a' : '#ff7b7b'; x.fillRect(8, 8, 120 * Math.max(0, hp / 100), 10);
                    x.fillStyle = 'rgba(255,255,255,0.8)'; x.font = '11px sans-serif'; x.textAlign = 'left'; x.fillText('HP', 8, 30);
                    // 小地图
                    const MM = 84, mx0 = W - MM - 6, my0 = 6, s = MM / MW;
                    x.fillStyle = 'rgba(8,16,10,0.7)'; x.fillRect(mx0, my0, MM, MM);
                    x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 1; x.strokeRect(mx0 + .5, my0 + .5, MM - 1, MM - 1);
                    for (let yy = 0; yy < MH; yy++) for (let xx = 0; xx < MW; xx++) if (grid[yy][xx] > 0) { x.fillStyle = grid[yy][xx] === 2 ? '#7a5a32' : '#6b6577'; x.fillRect(mx0 + xx * s, my0 + yy * s, s + 0.5, s + 0.5); }
                    x.fillStyle = 'rgba(255,91,91,0.95)'; for (const a of aliens) x.fillRect(mx0 + a.x * s - 1, my0 + a.y * s - 1, 2.5, 2.5);
                    x.fillStyle = '#ff4d4d'; for (const m of medkits) x.fillRect(mx0 + m.x * s - 1.5, my0 + m.y * s - 1.5, 3, 3);
                    x.fillStyle = '#7dff7d'; x.beginPath(); x.arc(mx0 + px * s, my0 + py * s, 2.5, 0, Math.PI * 2); x.fill();
                    x.strokeStyle = '#7dff7d'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(mx0 + px * s, my0 + py * s); x.lineTo(mx0 + (px + dirX * 2) * s, my0 + (py + dirY * 2) * s); x.stroke();
                    // 触屏提示
                    if (isTouch) {
                        x.save(); x.globalAlpha = 0.22; x.strokeStyle = '#cfe3ff'; x.lineWidth = 2; x.setLineDash([6, 6]);
                        x.beginPath(); x.arc(60, H - 60, 42, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
                        x.globalAlpha = 0.5; x.fillStyle = '#cfe3ff'; x.font = '12px sans-serif'; x.textAlign = 'center';
                        x.fillText('✥ 移动', 60, H - 104); x.fillText('🎯 转向/射击', W - 70, H - 104); x.restore();
                    }
                    if (t < 5) {
                        x.globalAlpha = Math.min(1, (5 - t) / 1.4);
                        x.fillStyle = '#cfe3ff'; x.font = '12px sans-serif'; x.textAlign = 'center';
                        x.fillText('PC：WASD 移动 · 点击锁定后鼠标转视角 · 左键射击 · 方向键/QE 转向', W / 2, H - 16);
                        x.fillText('手机：左半屏摇杆移动 · 右半屏拖动转向+射击', W / 2, H - 4);
                        x.globalAlpha = 1;
                    }
                }

                spawn(); spawn();
                raf = requestAnimationFrame(step);
            }

            return {
                stop() {
                    stopped = true;
                    if (raf) cancelAnimationFrame(raf);
                    cleanups.forEach(fn => { try { fn(); } catch (e) {} });
                    try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
                }
            };
        },
    };
})();
