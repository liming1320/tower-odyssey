// 鸠摩智转刀：转盘上插刀，避开已有刀插进空位，全插满即胜
//   - 旋转速度随关卡加快（角速度 ω 上升）
//   - 同色同款刀（千刃刀）一柄接一柄插到转盘
//   - 撞到已有刀 = 失败 / 飞出转盘外 = 失败
window.MiniGames = window.MiniGames || {};
(function () {
    const E = (window.MG && window.MG.eng) || {};
    E.def && E.def('knife', { levels: [
        '微风','林间','山谷','云端','雷雨','霜降','雪原','荒漠','幽谷','熔岩',
        '深渊','星海','幻境','苍穹','混沌','鸿蒙','太虚','归墟','化境','绝顶',
        '通天','御虚','破界','入圣','不灭','永劫','归元','神化','霸者','绝响',
        '傲视','凌霄','破晓','风暴','雷霆','烈火','寒冰','圣光','暗影','轮回',
        '涅槃','归一','永恒','不朽','鸿蒙Ⅱ','太初','无极','归墟Ⅱ','终极','万刃归一'
    ], params: (i, t) => ({
        omega: 0.012 + 0.022 * t,        // 角速度（弧度/帧），越高越快
        knives: 5 + Math.min(15, Math.floor(i * 0.6)),   // 刀总数 5..20
        baseLen: 110 + i * 2,             // 转盘半径
    }), endless: { name: '无尽·转刀', desc: '永不停止，撞到即输' },
        hint: '🎯 在刀柄处点/点击屏幕丢刀，撞到已有刀即输',
        w: 360, h: 520,
        init: P => ({ knives: [], angle: -Math.PI / 2, phase: 'idle', spinTimer: 0 }),
        draw: (ctx, S, P, W, H, api) => {
            // 背景
            let g = null; try { g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a3044'); g.addColorStop(1, '#1a1f2e'); } catch (e) {}
            ctx.fillStyle = g || '#2a3044'; ctx.fillRect(0, 0, W, H);
            const cx = W / 2, cy = H * 0.42;
            // 转盘中心圆
            ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2);
            ctx.fillStyle = '#3d5a80'; ctx.fill();
            ctx.lineWidth = 3; ctx.strokeStyle = '#1a2c44'; ctx.stroke();
            ctx.font = 'bold 16px "Microsoft YaHei",sans-serif';
            ctx.fillStyle = '#ffd56b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('鸠摩智', cx, cy - 2);
            ctx.font = '10px "Microsoft YaHei"'; ctx.fillStyle = '#b9b3d8';
            ctx.fillText('转刀', cx, cy + 12);
            // 转盘轨道圈
            ctx.beginPath(); ctx.arc(cx, cy, P.baseLen, 0, Math.PI * 2);
            ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.stroke();
            // 已插的刀
            for (let i = 0; i < S.knives.length; i++) {
                const k = S.knives[i];
                const a = k.angle;
                const dx = cx + Math.cos(a) * P.baseLen;
                const dy = cy + Math.sin(a) * P.baseLen;
                ctx.save();
                ctx.translate(dx, dy); ctx.rotate(a + Math.PI / 2);
                // 刀柄（圆点）
                ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#ffd56b'; ctx.fill();
                // 刀刃
                const blade = ctx.createLinearGradient(0, -6, 0, -P.baseLen - 14);
                blade.addColorStop(0, '#e9ecf4'); blade.addColorStop(1, '#7a8aa8');
                ctx.fillStyle = blade;
                ctx.beginPath();
                ctx.moveTo(-3, -4); ctx.lineTo(3, -4); ctx.lineTo(2, -P.baseLen - 6); ctx.lineTo(-2, -P.baseLen - 6);
                ctx.closePath(); ctx.fill();
                ctx.lineWidth = 1; ctx.strokeStyle = '#2a3450'; ctx.stroke();
                // 刀柄缠绳
                ctx.fillStyle = '#a06820';
                ctx.fillRect(-3, -1, 6, 6);
                ctx.restore();
            }
            // 待插的刀（屏底）
            const ry = H - 50;
            ctx.save();
            ctx.translate(W / 2, ry);
            // 刀影
            const a2 = S.angle;
            const dx = cx - W / 2 + Math.cos(a2) * P.baseLen;
            const dy = cy - ry + Math.sin(a2) * P.baseLen;
            // 不画屏外刀，直接在底部画「下一把」
            ctx.rotate(Math.PI / 2);
            ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fillStyle = '#ffd56b'; ctx.fill();
            const b2 = ctx.createLinearGradient(0, -6, 0, -80);
            b2.addColorStop(0, '#e9ecf4'); b2.addColorStop(1, '#7a8aa8');
            ctx.fillStyle = b2;
            ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(3, -4); ctx.lineTo(2, -86); ctx.lineTo(-2, -86);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#a06820'; ctx.fillRect(-3, -1, 6, 6);
            ctx.restore();
            // 提示文字
            ctx.font = 'bold 13px "Microsoft YaHei"'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
            ctx.fillText(S.phase === 'idle' ? '点击屏幕丢刀' : '已丢 ' + S.knives.length + ' / ' + P.knives + ' 把', W / 2, 28);
            if (S.phase === 'fail') {
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
                ctx.font = 'bold 28px "Microsoft YaHei"'; ctx.fillStyle = '#ff7a8b';
                ctx.fillText('💥 刀撞上了！', W / 2, H / 2);
            } else if (S.phase === 'win') {
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
                ctx.font = 'bold 28px "Microsoft YaHei"'; ctx.fillStyle = '#ffd56b';
                ctx.fillText('🏆 万刃归一', W / 2, H / 2);
            }
            ctx.font = '11px "Microsoft YaHei"'; ctx.fillStyle = '#b9b3d8'; ctx.textAlign = 'left';
            ctx.fillText('关卡 ' + (P.endless ? '∞' : i_round(P)), 8, H - 8);
        },
        tap: (S, x, y, P, api) => {
            if (S.phase !== 'idle') return;
            // 检查转盘是否还有空位：本次丢刀角度 = 当前 S.angle
            const a = S.angle;
            // 简单碰撞检测：与最近刀角度差 > 0.18 弧度 ≈ 10° 才算空
            for (const k of S.knives) {
                let d = Math.abs(k.angle - a);
                if (d > Math.PI) d = Math.PI * 2 - d;
                if (d < 0.22) { S.phase = 'fail'; api.finish({ win: false, score: S.knives.length, lines: ['第 ' + (S.knives.length + 1) + ' 把撞到第 ' + (S.knives.indexOf(k) + 1) + ' 把'] }); return; }
            }
            S.knives.push({ angle: a });
            S.phase = 'idle';
            if (S.knives.length >= P.knives) {
                S.phase = 'win';
                api.finish({ win: true, score: S.knives.length * 100 + Math.floor(60 / Math.max(0.01, P.omega)), lines: ['插完 ' + S.knives.length + ' 把刀', '用时 ' + (S.t | 0) + 's'] });
            }
        },
        tick: (S, dt, P, api) => {
            if (S.phase === 'idle') {
                S.angle += P.omega * (dt * 60);
                // wrap to [-PI, PI]
                if (S.angle > Math.PI) S.angle -= Math.PI * 2;
            }
        },
        score: S => S.knives.length,
    });
    function i_round(P) { return (P && P._i) || 1; }
})();