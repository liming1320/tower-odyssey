// 鸠摩智转刀（2026-09-10 重做为正版割草玩法）
//   参考原作（B站 UP 主"火山哥哥"《鸠摩智转刀》PingDao）：
//   · 横版割草 Roguelike：操控鸠摩智移动，身边自动旋转的飞刀攻击敌人
//   · 敌人从四周涌来，击败掉落经验球，拾取升级
//   · 每升一级三选一技能：小无相功/凌波微步/易筋经/火焰刀/控鹤功…
//   · 血条耗尽即失败；达成击杀目标过关
// 操作：WASD/方向键，或按住屏幕拖动指向移动
window.MiniGames = window.MiniGames || {};
(function () {
    const E = (window.MG && window.MG.eng) || {};
    E.def && E.def('knife', {
        levels: [
            '初入江湖', '小试锋芒', '刀随心动', '微风', '林间', '山谷', '云端', '雷雨', '霜降', '雪原',
            '荒漠', '幽谷', '熔岩', '深渊', '星海', '幻境', '苍穹', '混沌', '鸿蒙', '太虚',
            '归墟', '化境', '绝顶', '通天', '御虚', '破界', '入圣', '不灭', '永劫', '归元',
            '神化', '霸者', '绝响', '傲视', '凌霄', '破晓', '风暴', '雷霆', '烈火', '寒冰',
            '圣光', '暗影', '轮回', '涅槃', '归一', '永恒', '不朽', '太初', '无极', '万刃归宗'
        ],
        params: (i, t) => ({
            t,
            need: 8 + i * 4,                                  // 击杀目标
            spawnGap: Math.max(0.3, 1.15 - t),                // 出怪间隔（秒）
            enemyHp: 3 + i * 1.1,                             // 敌人血量
            enemySpd: 34 + 26 * t,                            // 敌人速度
            mixFast: i >= 3, mixTank: i >= 6,                 // 3 关起加快速怪，6 关起加壮汉
        }), endless: { name: '无尽·割草', desc: '杀到力竭为止，看你能割多少' },
        hint: '按住屏幕指哪走哪（电脑 WASD/方向键） · 飞刀自动旋转杀敌 · 吃经验球升级三选一',
        w: 360, h: 520,
        init: P => ({
            px: 180, py: 300,                                  // 玩家位置
            hp: 10, maxHp: 10, invuln: 0,
            knives: 2, kAngle: 0, kSpeed: 3.2, kRange: 58, kDmg: 2,
            spd: 130, pickup: 26,
            lv: 1, exp: 0, expNeed: 6,
            kills: 0, need: P.need || 8,
            enemies: [], orbs: [], sparks: [],
            spawnT: 0.5, elapsed: 0,
            keyVec: null, keyT: 0,
            touch: null,                                     // 按住屏幕的目标点（指哪走哪）
            upgrading: null,                                   // 三选一面板
            flash: 0,                                          // 受伤闪白
        }),

        tick(S, dt, P, api) {
            S.elapsed += dt;
            if (S.invuln > 0) S.invuln -= dt;
            if (S.flash > 0) S.flash -= dt;
            // 升级面板打开时全场暂停
            if (S.upgrading) return;

            // ---- 移动输入：指哪走哪 ----
            // 按住屏幕/鼠标 → 鸠摩智朝手指位置精确移动（近了自动减速停住，不飘）
            let mvx = 0, mvy = 0, mSpd = S.spd;
            if (S.touch) {
                const tx = S.touch.x - S.px, ty = S.touch.y - S.py, td = Math.hypot(tx, ty);
                if (td > 3) { mvx = tx; mvy = ty; mSpd = Math.min(S.spd, td * 6); }
            } else if (S.keyVec && (performance.now() - S.keyT) < 250) { mvx = S.keyVec.x; mvy = S.keyVec.y; }
            const ml = Math.hypot(mvx, mvy);
            if (ml > 0.01) {
                S.px += mvx / ml * mSpd * dt;
                S.py += mvy / ml * mSpd * dt;
                S.px = Math.max(20, Math.min(340, S.px));
                S.py = Math.max(70, Math.min(490, S.py));
            }

            // ---- 飞刀旋转 ----
            S.kAngle += S.kSpeed * dt;

            // ---- 生成敌人（屏幕边缘外）----
            S.spawnT -= dt;
            if (S.spawnT <= 0 && S.enemies.length < 40) {
                S.spawnT = P.spawnGap * (0.7 + Math.random() * 0.6);
                const side = MG.ri(0, 3);
                let ex, ey;
                if (side === 0) { ex = Math.random() * 360; ey = -20; }
                else if (side === 1) { ex = 380; ey = 60 + Math.random() * 440; }
                else if (side === 2) { ex = Math.random() * 360; ey = 540; }
                else { ex = -20; ey = 60 + Math.random() * 440; }
                const roll = Math.random();
                let type = 'grunt';
                if (P.mixTank && roll < 0.18) type = 'tank';
                else if (P.mixFast && roll < 0.45) type = 'fast';
                const spec = type === 'tank' ? { hp: P.enemyHp * 3, spd: P.enemySpd * 0.55, r: 15, col: '#8a5adf', pts: 3 }
                    : type === 'fast' ? { hp: P.enemyHp * 0.6, spd: P.enemySpd * 1.7, r: 8, col: '#e05a9a', pts: 1 }
                        : { hp: P.enemyHp, spd: P.enemySpd, r: 11, col: '#d04848', pts: 1 };
                S.enemies.push({ x: ex, y: ey, hp: spec.hp, maxHp: spec.hp, spd: spec.spd, r: spec.r, col: spec.col, pts: spec.pts, hitCd: 0, wob: Math.random() * 6 });
            }

            // ---- 敌人：追玩家 + 简单分离 ----
            for (let i = S.enemies.length - 1; i >= 0; i--) {
                const e = S.enemies[i];
                e.hitCd = Math.max(0, e.hitCd - dt);
                const vx = S.px - e.x, vy = S.py - e.y, vd = Math.hypot(vx, vy) || 1;
                e.x += vx / vd * e.spd * dt;
                e.y += vy / vd * e.spd * dt;
                // 分离（避免叠成一坨）
                for (let k = i - 1; k >= 0 && k > i - 6; k--) {
                    const o = S.enemies[k];
                    const ox2 = e.x - o.x, oy2 = e.y - o.y, od = Math.hypot(ox2, oy2) || 1, min = e.r + o.r;
                    if (od < min) { e.x += ox2 / od * (min - od) * 0.5; e.y += oy2 / od * (min - od) * 0.5; }
                }
                // 飞刀命中
                const kn = S.knives;
                for (let k = 0; k < kn; k++) {
                    const a = S.kAngle + k * Math.PI * 2 / kn;
                    const kx = S.px + Math.cos(a) * S.kRange, ky = S.py + Math.sin(a) * S.kRange;
                    if (e.hitCd <= 0 && Math.hypot(e.x - kx, e.y - ky) < e.r + 7) {
                        e.hp -= S.kDmg; e.hitCd = 0.22;
                        S.sparks.push({ x: e.x, y: e.y, t: 0 });
                        if (e.hp <= 0) {
                            S.enemies.splice(i, 1);
                            S.kills += 1;
                            S.orbs.push({ x: e.x, y: e.y, v: e.pts });
                            if (api.fx) api.fx.burst(e.x, e.y, { n: 6, color: e.col, speed: 90 });
                            break;
                        }
                    }
                }
                if (!S.enemies.includes(e)) continue;
                // 碰玩家
                if (S.invuln <= 0 && Math.hypot(e.x - S.px, e.y - S.py) < e.r + 10) {
                    const dmg = e.pts >= 3 ? 3 : 1;
                    S.hp -= dmg; S.invuln = 0.7; S.flash = 0.25;
                    api.shake && api.shake(5, 0.25);
                    // 撞击后把敌人弹开一点
                    e.x -= vx / vd * 26; e.y -= vy / vd * 26;
                    if (S.hp <= 0) {
                        api.finish({ win: false, stars: 0, score: S.kills, lines: [`存活 ${S.elapsed.toFixed(0)} 秒 · 击杀 ${S.kills}/${S.need}`] });
                        return;
                    }
                }
            }

            // ---- 经验球 ----
            for (let i = S.orbs.length - 1; i >= 0; i--) {
                const o = S.orbs[i];
                const d = Math.hypot(o.x - S.px, o.y - S.py);
                if (d < S.pickup + 6) {          // 吸附
                    o.x += (S.px - o.x) * Math.min(1, dt * 9);
                    o.y += (S.py - o.y) * Math.min(1, dt * 9);
                }
                if (d < 14) {
                    S.orbs.splice(i, 1);
                    S.exp += o.v;
                    while (S.exp >= S.expNeed) {
                        S.exp -= S.expNeed;
                        S.lv++;
                        S.expNeed = 4 + S.lv * 4;
                        S.upgrading = rollSkills();
                    }
                }
            }

            // ---- 特效计时 ----
            for (let i = S.sparks.length - 1; i >= 0; i--) { S.sparks[i].t += dt; if (S.sparks[i].t > 0.25) S.sparks.splice(i, 1); }

            // ---- 胜利 ----
            if (S.kills >= S.need && !P.endless) {
                const star = S.hp >= S.maxHp * 0.7 ? 3 : S.hp >= S.maxHp * 0.35 ? 2 : 1;
                api.finish({ win: true, stars: star, score: S.kills, lines: [`击杀 ${S.kills} · 剩余血量 ${Math.max(0, Math.round(S.hp))}/${S.maxHp}`, `等级 ${S.lv} · 用时 ${S.elapsed.toFixed(0)} 秒`] });
            }
        },

        // ---- 指哪走哪：按住期间持续更新目标点 ----
        drag(S, x, y) {
            S.touch = { x, y };
        },
        dragend(S) { S.touch = null; },
        key(S, k, P, api) {
            const m = {
                w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
                ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
            }[k];
            if (m) { S.keyVec = { x: m[0], y: m[1] }; S.keyT = performance.now(); }
        },

        tap(S, x, y, P, api) {
            // 升级三选一
            if (S.upgrading) {
                const H = 520;
                for (let k = 0; k < 3; k++) {
                    const by = 170 + k * 92;
                    if (E.hit(x, y, 40, by, 280, 78)) {
                        S.upgrading[k].apply(S);
                        S.upgrading = null;
                        if (api.fx) api.fx.ring(S.px, S.py, { color: '#ffd56b' });
                        return;
                    }
                }
            }
            // 移动不再靠点按 —— 按住屏幕拖动即"指哪走哪"
        },

        draw(ctx, S, P, W, H, api) {
            E.bg(ctx, W, H, '#3a4a3f', '#1a2420');
            // 地面纹理（棋盘淡格）
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            for (let gx = 0; gx < W; gx += 40) ctx.fillRect(gx, 56, 1, H - 56);
            for (let gy = 80; gy < H; gy += 40) ctx.fillRect(0, gy, W, 1);

            // ---- 手指目标点标记（指哪走哪的视觉反馈）----
            if (S.touch) {
                const pu = 0.75 + 0.25 * Math.sin(S.elapsed * 10);
                ctx.save();
                ctx.strokeStyle = 'rgba(255,213,107,0.85)'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(S.touch.x, S.touch.y, 11 * pu, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = 'rgba(255,213,107,0.22)';
                ctx.beginPath(); ctx.arc(S.touch.x, S.touch.y, 5, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }

            // ---- 经验球 ----
            for (const o of S.orbs) {
                const pulse = 0.7 + 0.3 * Math.sin(S.elapsed * 6 + o.x);
                ctx.save();
                ctx.shadowColor = '#5ce87a'; ctx.shadowBlur = 8;
                ctx.fillStyle = '#5ce87a';
                ctx.beginPath(); ctx.arc(o.x, o.y, 4 * pulse, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }

            // ---- 敌人 ----
            for (const e of S.enemies) {
                const wob = Math.sin(S.elapsed * 7 + e.wob) * 2;
                ctx.save();
                ctx.translate(e.x + wob * 0.4, e.y);
                // 身体
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
                const g = (() => { try { const gg = ctx.createRadialGradient(-3, -4, 2, 0, 0, e.r + 3); gg.addColorStop(0, MG.gfx ? MG.gfx.lighten(e.col, 0.35) : e.col); gg.addColorStop(1, e.col); return gg; } catch (err) { return e.col; } })();
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
                // 怒眼
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(-e.r * 0.32, -e.r * 0.2, e.r * 0.24, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(e.r * 0.32, -e.r * 0.2, e.r * 0.24, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#1a1a28';
                ctx.beginPath(); ctx.arc(-e.r * 0.28, -e.r * 0.16, e.r * 0.11, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(e.r * 0.36, -e.r * 0.16, e.r * 0.11, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#3a0a0a'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(-e.r * 0.55, -e.r * 0.55); ctx.lineTo(-e.r * 0.12, -e.r * 0.4); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(e.r * 0.55, -e.r * 0.55); ctx.lineTo(e.r * 0.12, -e.r * 0.4); ctx.stroke();
                ctx.restore();
                // 血条（受损才显示）
                if (e.hp < e.maxHp) {
                    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - e.r, e.y - e.r - 8, e.r * 2, 4);
                    ctx.fillStyle = '#7ad86a';
                    ctx.fillRect(e.x - e.r + 0.5, e.y - e.r - 7.5, (e.r * 2 - 1) * (e.hp / e.maxHp), 3);
                }
            }

            // ---- 鸠摩智 ----
            drawJiumozhi(ctx, S.px, S.py, S.elapsed);
            // ---- 环绕飞刀 ----
            for (let k = 0; k < S.knives; k++) {
                const a = S.kAngle + k * Math.PI * 2 / S.knives;
                const kx = S.px + Math.cos(a) * S.kRange, ky = S.py + Math.sin(a) * S.kRange;
                // 刀刃轨迹微光
                ctx.save();
                ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(S.px, S.py, S.kRange, a - 0.5, a); ctx.stroke();
                ctx.translate(kx, ky); ctx.rotate(a + Math.PI / 2);
                // 刀刃
                const bg = (() => { try { const g = ctx.createLinearGradient(0, 0, 0, -20); g.addColorStop(0, '#f0f4fa'); g.addColorStop(1, '#8898b8'); return g; } catch (e) { return '#c8d4e8'; } })();
                ctx.fillStyle = bg;
                ctx.beginPath();
                ctx.moveTo(-2.6, 0); ctx.lineTo(2.6, 0); ctx.lineTo(1.4, -19); ctx.lineTo(-1.4, -19);
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = 'rgba(30,40,60,0.7)'; ctx.lineWidth = 0.8; ctx.stroke();
                // 金柄
                ctx.fillStyle = '#d8a028'; ctx.fillRect(-2, 0, 4, 6);
                ctx.fillStyle = '#ffd56b'; ctx.beginPath(); ctx.arc(0, 6.5, 2.2, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }

            // ---- 命中火花 ----
            for (const sp of S.sparks) {
                const k = sp.t / 0.25;
                ctx.save();
                ctx.globalAlpha = 1 - k;
                ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(sp.x, sp.y, 3 + k * 10, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
            }

            // ---- 受伤闪白 ----
            if (S.flash > 0) {
                ctx.fillStyle = `rgba(255,60,60,${S.flash * 1.2})`;
                ctx.fillRect(0, 0, W, H);
            }

            // ---- HUD：血条 / 经验条 / 击杀 ----
            ctx.fillStyle = 'rgba(10,14,10,0.75)'; ctx.fillRect(0, 0, W, 52);
            ctx.fillStyle = '#3a1414'; ctx.fillRect(10, 10, 200, 12);
            const hpCol = S.hp > S.maxHp * 0.35 ? '#e84a4a' : '#ff2222';
            ctx.fillStyle = hpCol;
            ctx.beginPath(); ctx.roundRect ? ctx.roundRect(10, 10, 200 * Math.max(0, S.hp / S.maxHp), 12, 6) : ctx.fillRect(10, 10, 200 * Math.max(0, S.hp / S.maxHp), 12); ctx.fill();
            ctx.font = 'bold 10px "Microsoft YaHei"'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(`❤ ${Math.max(0, Math.ceil(S.hp))}/${S.maxHp}`, 14, 16.5);
            ctx.fillStyle = '#1a3a20'; ctx.fillRect(10, 28, 200, 8);
            ctx.fillStyle = '#5ce87a';
            ctx.fillRect(10, 28, 200 * Math.min(1, S.exp / S.expNeed), 8);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#ffd56b';
            ctx.font = 'bold 13px "Microsoft YaHei"';
            ctx.fillText(P.endless ? `⚔ ${S.kills}` : `⚔ ${S.kills}/${S.need}`, W - 12, 14);
            ctx.fillStyle = '#9ad8ff';
            ctx.font = 'bold 11px "Microsoft YaHei"';
            ctx.fillText(`Lv.${S.lv}`, W - 12, 32);
            ctx.fillText(`🔪×${S.knives}`, W - 58, 32);
            ctx.textAlign = 'left';
            E.txt(ctx, (P.endless ? '∞ 无尽割草' : (P.name || '')) + ' · ' + SKILL_HINT, W / 2, 62, 13, '#cfe8d8', true);

            // ---- 升级三选一面板 ----
            if (S.upgrading) {
                ctx.fillStyle = 'rgba(8,12,10,0.78)';
                ctx.fillRect(0, 0, W, H);
                E.txt(ctx, `⬆ 升级！Lv.${S.lv}`, W / 2, 110, 26, '#ffd56b', true);
                E.txt(ctx, '选择一门武功', W / 2, 138, 14, '#cfe8d8', true);
                for (let k = 0; k < 3; k++) {
                    const sk = S.upgrading[k], by = 170 + k * 92;
                    E.card(ctx, 40, by, 280, 78, '#4a6a8a', '#22344a', 10);
                    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                    ctx.font = 'bold 18px "Microsoft YaHei"'; ctx.fillStyle = '#ffd56b';
                    ctx.fillText(sk.name, 56, by + 26);
                    ctx.font = '13px "Microsoft YaHei"'; ctx.fillStyle = '#e8f0ff';
                    ctx.fillText(sk.desc, 56, by + 52);
                }
            }
        },
    });

    // ============ 技能池 ============
    const SKILL_HINT = '按住屏幕指哪走哪';
const SKILLS = [
        { name: '小无相功', desc: '攻击力 +1（刀刀更疼）', apply: S => { S.kDmg += 1; } },
        { name: '火焰刀', desc: '飞刀 +1 把', apply: S => { S.knives += 1; } },
        { name: '凌波微步', desc: '移动速度 +15%', apply: S => { S.spd *= 1.15; } },
        { name: '易筋经', desc: '血量上限 +6 并回复 6', apply: S => { S.maxHp += 6; S.hp = Math.min(S.maxHp, S.hp + 6); } },
        { name: '控鹤功', desc: '经验球拾取范围 +30%', apply: S => { S.pickup *= 1.3; } },
        { name: '般若掌', desc: '飞刀旋转半径 +15%', apply: S => { S.kRange *= 1.15; } },
        { name: '乾坤心法', desc: '飞刀转速 +25%', apply: S => { S.kSpeed *= 1.25; } },
    ];
    function rollSkills() {
        const pool = SKILLS.slice();
        const out = [];
        while (out.length < 3 && pool.length) out.push(pool.splice(MG.ri(0, pool.length - 1), 1)[0]);
        return out;
    }

    // ============ Q 版鸠摩智（红僧袍 · 光头 · 长须 · 持袖摆动）============
    function drawJiumozhi(ctx, x, y, t) {
        const bob = Math.sin(t * 5) * 1.5;
        ctx.save();
        ctx.translate(x, y + bob);
        ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
        // 僧袍（红色梯形 + 摆袖）
        const rg = (() => { try { const g = ctx.createLinearGradient(0, -6, 0, 20); g.addColorStop(0, '#e85a3a'); g.addColorStop(1, '#a02a1a'); return g; } catch (e) { return '#c04a30'; } })();
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(-11, -4);
        ctx.quadraticCurveTo(-14, 12, -12, 20);
        ctx.lineTo(12, 20);
        ctx.quadraticCurveTo(14, 12, 11, -4);
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#701a10'; ctx.lineWidth = 1.2; ctx.stroke();
        // 袍领（黄色袈裟边）
        ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-7, -3); ctx.lineTo(0, 8); ctx.lineTo(7, -3); ctx.stroke();
        // 头（光亮洁白）
        const hg = (() => { try { const g = ctx.createRadialGradient(-3, -12, 1, 0, -10, 10); g.addColorStop(0, '#fff2e2'); g.addColorStop(1, '#eec8a0'); return g; } catch (e) { return '#f5d8b5'; } })();
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(0, -11, 9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#b08858'; ctx.lineWidth = 1; ctx.stroke();
        // 戒疤三点
        ctx.fillStyle = '#c05838';
        [[-3, -17], [0, -18.5], [3, -17]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(dx, dy, 0.9, 0, Math.PI * 2); ctx.fill(); });
        // 眯眼 + 长须（飘飘的白胡子）
        ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-4, -11); ctx.lineTo(-1.5, -11); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(1.5, -11); ctx.lineTo(4, -11); ctx.stroke();
        ctx.fillStyle = '#e8e8e8';
        ctx.beginPath();
        ctx.moveTo(-4, -6);
        ctx.quadraticCurveTo(0 + Math.sin(t * 3) * 1.5, 6, 3, -6);
        ctx.quadraticCurveTo(0, -2, -4, -6);
        ctx.fill();
        ctx.restore();
    }

})();
