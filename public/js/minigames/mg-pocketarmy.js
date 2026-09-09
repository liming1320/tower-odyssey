// 口袋奇兵（Count Masters 风格）：方块小兵竖屏跑桥，加减数字门增减兵力，木桶掉枪械，撞敌人耗血
//   - 左右箭头控制横向
//   - 上箭头 / 跳跃：跳过低栏
//   - 蓝色 +N 门：增兵 N 个
//   - 红色 -N 门：减兵 N 个（最少 1）
//   - 木桶：撞开得到攻击力 buff 或额外兵力
//   - 敌人方块：带数字血条，撞上去敌我各损
//   - 桥尽头：到达即胜利；兵力归零即失败
window.MiniGames = window.MiniGames || {};
(function () {
    const E = (window.MG && window.MG.eng) || {};
    E.def && E.def('pocketarmy', {
        levels: [
            '草地桥','木桥','石桥','吊桥','竹桥','铁桥','雪山桥','火山桥','云中桥','星河桥',
            '彩虹桥','极光桥','冰裂桥','砂砾桥','沙漠桥','绿洲桥','海面桥','深渊桥','峡谷桥','长城桥',
            '月光桥','烈阳桥','晨曦桥','黄昏桥','暮色桥','夜幕桥','风暴桥','雷霆桥','烈火桥','寒冰桥',
            '樱花桥','金叶桥','枫林桥','雾凇桥','琉璃桥','水晶桥','钻石桥','琥珀桥','玛瑙桥','翡翠桥',
            '玄铁桥','紫金桥','赤霄桥','耀金桥','圣光桥','暗影桥','轮回桥','涅槃桥','归一桥','永恒桥'
        ],
        params: (i, t) => ({
            target: 600 + Math.floor(i * 80),                    // 桥长（到达即过关）
            initArmy: 5 + Math.floor(i / 5),                     // 初始兵力
            atk: 1 + Math.floor(i / 8),                          // 攻击力
            speed: 130 + 100 * t,                                // 移速（像素/秒）
            enemyMul: 0.6 + 0.4 * t,                              // 敌人密度
            gateMul: 0.4 + 0.6 * t,                              // 加减门密度
        }),
        endless: { name: '无尽·远征', desc: '桥无限长，看你能跑多远' },
        hint: '👈👉 调整方向 · ⬆ 跳跃 · 撞蓝门增兵 / 红门减兵 / 撞敌人耗血',
        w: 360, h: 520,
        init: P => ({
            army: P.initArmy || 5, atk: P.atk || 1,
            x: 30, y: 360, vx: 0, vy: 0, onGround: true,
            dist: 0, target: P.target || 600,
            speed: P.speed || 150,
            obstacles: [],   // {type:'gate'|'enemy'|'barrel', val, x, w, alive, hp?, taken}
            ticker: 0,
            enemyMul: P.enemyMul || 1, gateMul: P.gateMul || 1,
            buff: 0,         // 攻击力 buff 倒计时
            finishAt: 0,
            animPhase: 0,
        }),
        draw: (ctx, S, P, W, H, api) => {
            // 背景：天 → 草
            let bg = null; try { bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#a3d8f0'); bg.addColorStop(0.7, '#cae9bb'); bg.addColorStop(1, '#7bb96d'); } catch (e) {}
            ctx.fillStyle = bg || '#7bb96d'; ctx.fillRect(0, 0, W, H);
            // 远山
            ctx.fillStyle = '#8aac7d';
            ctx.beginPath(); ctx.moveTo(0, H * 0.5); ctx.lineTo(W * 0.2, H * 0.4); ctx.lineTo(W * 0.45, H * 0.5); ctx.lineTo(W * 0.7, H * 0.42); ctx.lineTo(W, H * 0.5); ctx.lineTo(W, H * 0.7); ctx.lineTo(0, H * 0.7); ctx.closePath(); ctx.fill();
            // 桥（横跨画面，相对相机移动）
            const bridgeY = 380;
            ctx.fillStyle = '#7a5028';
            ctx.fillRect(0, bridgeY, W, 14);
            ctx.fillStyle = '#5a3818';
            for (let i = 0; i < W; i += 28) ctx.fillRect(i, bridgeY + 10, 18, 4);
            // 桥两侧护栏
            ctx.fillStyle = '#3a2410';
            ctx.fillRect(0, bridgeY - 8, W, 4);
            // 终点旗
            const finishX = W - 60 - (S.target - S.dist) * (W - 60) / S.target;
            if (finishX > 0 && finishX < W) {
                ctx.fillStyle = '#cf2020';
                ctx.fillRect(finishX, bridgeY - 80, 4, 80);
                ctx.beginPath(); ctx.moveTo(finishX + 4, bridgeY - 80); ctx.lineTo(finishX + 40, bridgeY - 60); ctx.lineTo(finishX + 4, bridgeY - 40); ctx.closePath();
                ctx.fillStyle = '#ffd56b'; ctx.fill();
            }
            // 障碍物（按世界坐标 - 玩家偏移）
            const camX = S.dist;
            for (const o of S.obstacles) {
                const sx = W - 80 - (o.x - camX) * (W - 60) / S.target;   // 目标宽度 W-60
                if (sx < -40 || sx > W + 40) continue;
                if (o.type === 'gate') {
                    ctx.fillStyle = o.val >= 0 ? '#3a7fd0' : '#d04848';
                    ctx.fillRect(sx - 30, bridgeY - 80, 60, 80);
                    ctx.font = 'bold 36px "Microsoft YaHei"'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText((o.val >= 0 ? '+' : '') + o.val, sx, bridgeY - 40);
                    // 门框
                    ctx.lineWidth = 3; ctx.strokeStyle = '#1a1f2e'; ctx.strokeRect(sx - 30, bridgeY - 80, 60, 80);
                    // 顶条
                    ctx.fillStyle = o.val >= 0 ? '#5cc7ff' : '#ff7a7a';
                    ctx.fillRect(sx - 32, bridgeY - 86, 64, 6);
                } else if (o.type === 'barrel') {
                    // 木桶
                    ctx.fillStyle = '#a06820';
                    ctx.beginPath(); ctx.ellipse(sx, bridgeY - 12, 16, 12, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#7a4818';
                    ctx.fillRect(sx - 14, bridgeY - 22, 28, 20);
                    ctx.lineWidth = 2; ctx.strokeStyle = '#3a2410'; ctx.stroke();
                    if (o.taken) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(sx - 16, bridgeY - 26, 32, 28); }
                } else if (o.type === 'enemy') {
                    // 敌人方块（红）
                    ctx.fillStyle = '#b04848';
                    ctx.fillRect(sx - 16, bridgeY - 32 - 4, 32, 32);
                    ctx.fillStyle = '#ff7a7a';
                    ctx.fillRect(sx - 12, bridgeY - 28 - 4, 24, 24);
                    // 眼睛
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(sx - 7, bridgeY - 22 - 4, 4, 4);
                    ctx.fillRect(sx + 3, bridgeY - 22 - 4, 4, 4);
                    ctx.fillStyle = '#000';
                    ctx.fillRect(sx - 6, bridgeY - 21 - 4, 2, 2);
                    ctx.fillRect(sx + 4, bridgeY - 21 - 4, 2, 2);
                    // 血条
                    const hp = o.hp;
                    const max = o.maxHp;
                    ctx.fillStyle = '#1a1f2e'; ctx.fillRect(sx - 16, bridgeY - 42, 32, 4);
                    ctx.fillStyle = hp > max * 0.3 ? '#7ad86a' : '#ff7a8b';
                    ctx.fillRect(sx - 16, bridgeY - 42, 32 * (hp / max), 4);
                    // 数字
                    ctx.font = 'bold 12px Arial'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
                    ctx.fillText(hp, sx, bridgeY - 50);
                }
            }
            // 玩家小兵方阵（按队伍人数摆成 V 字）
            const baseX = S.x;
            const baseY = S.y;
            const N = S.army;
            // 主角
            ctx.fillStyle = '#5cc7ff';
            ctx.fillRect(baseX - 12, baseY - 28 - 4, 24, 24);
            ctx.fillStyle = '#a8e8f0';
            ctx.fillRect(baseX - 9, baseY - 25 - 4, 18, 18);
            ctx.fillStyle = '#fff'; ctx.fillRect(baseX - 5, baseY - 20 - 4, 3, 3); ctx.fillRect(baseX + 2, baseY - 20 - 4, 3, 3);
            ctx.fillStyle = '#000'; ctx.fillRect(baseX - 4, baseY - 19 - 4, 1.5, 1.5); ctx.fillRect(baseX + 3, baseY - 19 - 4, 1.5, 1.5);
            // 队伍（每排最多 4 个，V 字向下散开）
            for (let i = 1; i < N; i++) {
                const row = Math.floor(i / 4) + 1;
                const col = i % 4;
                const dx = (col - 1.5) * 18;
                const dy = row * 16 + 4;
                const ox = baseX + dx, oy = baseY - dy;
                if (oy < 200) continue;
                ctx.fillStyle = '#7a90d8';
                ctx.fillRect(ox - 10, oy - 20, 20, 20);
                ctx.fillStyle = '#b8c8e8';
                ctx.fillRect(ox - 7, oy - 17, 14, 14);
            }
            // 队伍数字
            ctx.font = 'bold 16px "Microsoft YaHei"'; ctx.fillStyle = '#1a1f2e'; ctx.textAlign = 'center';
            ctx.fillText('×' + S.army, baseX, baseY + 22);
            // 顶部 HUD
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, 36);
            ctx.font = 'bold 13px "Microsoft YaHei"'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
            ctx.fillText('👥 ×' + S.army + '   ⚔ ×' + (S.atk + (S.buff > 0 ? '+' + Math.floor(S.buff / 60) : '')) + '   📏 ' + Math.floor(S.dist) + ' / ' + S.target, 8, 22);
            ctx.textAlign = 'right';
            if (S.finishAt) {
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
                ctx.font = 'bold 28px "Microsoft YaHei"'; ctx.fillStyle = S.army > 0 ? '#ffd56b' : '#ff7a8b';
                ctx.fillText(S.army > 0 ? '🏆 抵达终点！' : '💥 全军覆没', W / 2, H / 2 - 20);
                ctx.font = '14px "Microsoft YaHei"'; ctx.fillStyle = '#fff';
                ctx.fillText(S.army + ' 名士兵冲到终点 · 行军 ' + Math.floor(S.dist) + ' 米', W / 2, H / 2 + 20);
            }
        },
        tap: (S, x, y, P, api) => {
            if (S.finishAt) return;
            const W = 360;
            if (y < 200) {
                if (S.onGround) { S.vy = -260; S.onGround = false; }
                return;
            }
            if (x < W / 3) S.vx = -90;
            else if (x > W * 2 / 3) S.vx = 90;
            else S.vx = 0;   // 中央松开回到匀速
        },
        key: (S, k, P, api) => {
            if (S.finishAt) return;
            if (k === 'ArrowLeft') S.vx = -120;
            else if (k === 'ArrowRight') S.vx = 120;
            else if (k === 'ArrowUp' || k === ' ') { if (S.onGround) { S.vy = -260; S.onGround = false; } }
        },
        tick: (S, dt, P, api) => {
            if (S.finishAt) {
                S.finishAt += dt;
                if (S.finishAt > 1.6) {
                    const win = S.army > 0;
                    api.finish({ win, stars: win ? (S.army >= P.initArmy * 1.5 ? 3 : S.army >= P.initArmy ? 2 : 1) : 0, score: S.dist + S.army * 50, lines: [`到达距离 ${Math.floor(S.dist)}`, `剩余兵力 ${S.army}`] });
                }
                return;
            }
            S.animPhase += dt;
            if (S.buff > 0) S.buff -= dt;
            // 自动前进 + 横向位移
            S.dist += S.speed * dt;
            S.x += (S.vx || 0) * dt;
            // 重力
            S.vy += 600 * dt;
            S.y += S.vy * dt;
            if (S.y > 360) { S.y = 360; S.vy = 0; S.onGround = true; }
            // 阻尼
            S.vx *= 0.9;
            // 生成障碍
            S.ticker += dt;
            const spawnGap = Math.max(0.4, 1.4 - 0.6 * P.t);
            if (S.ticker >= spawnGap) {
                S.ticker = 0;
                const x = S.dist + 60 + Math.random() * 80;
                const r = Math.random();
                if (r < 0.45 * P.gateMul) {
                    // 门
                    const val = (Math.random() < 0.65 ? 1 : -1) * (1 + Math.floor(Math.random() * (3 + Math.floor(P.t * 4))));
                    S.obstacles.push({ type: 'gate', val, x, alive: true });
                } else if (r < 0.7) {
                    // 木桶
                    S.obstacles.push({ type: 'barrel', x, taken: false });
                } else {
                    // 敌人
                    const lv = 1 + Math.floor(Math.random() * (3 + Math.floor(P.t * 3)));
                    S.obstacles.push({ type: 'enemy', x, hp: lv, maxHp: lv, alive: true });
                }
            }
            // 碰撞检测：玩家到达 x = o.x 时检查
            for (const o of S.obstacles) {
                const dx = Math.abs(S.x - o.x);
                if (dx < 36 && o.alive) {
                    if (o.type === 'gate') {
                        S.army = Math.max(1, S.army + o.val);
                        if (o.val > 0) S.army = S.army;
                        o.alive = false;
                    } else if (o.type === 'barrel' && !o.taken) {
                        o.taken = true;
                        // 撞开桶：攻击力+1 持续 6s
                        S.buff = 6;
                    } else if (o.type === 'enemy') {
                        // 双方各损
                        const atk = S.atk + (S.buff > 0 ? 1 : 0);
                        o.hp -= atk;
                        S.army = Math.max(0, S.army - 1);
                        if (o.hp <= 0) o.alive = false;
                        if (S.army <= 0) { S.finishAt = 0.001; return; }
                    }
                }
            }
            S.obstacles = S.obstacles.filter(o => o.x - S.dist < 30);
            // 终点
            if (S.dist >= S.target) {
                S.finishAt = 0.001;
                S.x = 30;
            }
        },
        score: S => `行军 ${Math.floor(S.dist)} / ${S.target} · 兵力 ${S.army}`,
    });
})();