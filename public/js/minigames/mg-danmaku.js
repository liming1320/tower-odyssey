// 弹幕樱华祭 / Danmaku Sakura Festival —— 东方Project 风格弹幕射击（原创角色 · 零依赖 Canvas2D）
// 玩法：拖动/方向键移动自机（巫女「雾岛 樱」），自动向上射击；躲开敌弹，击破 BOSS 的符卡即过关。
//       点右下角炸弹按钮或按 Z 清屏并重伤全场。3 残机 + 2 炸弹；只有自机中心小红点碰到弹幕才掉命。
// 性能：弹幕用离屏发光精灵 + 对象池批量绘制，可稳定渲染数百发弹幕。

(function () {
  const MG = window.MG;
  const E = MG.eng;
  const ri = (a, b) => MG.ri(a, b);
  const rf = () => Math.random();
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  // ---- 离屏发光精灵（弹幕用，避免每帧 shadowBlur 拖垮性能）----
  function makeGlow(color, r) {
    const c = document.createElement('canvas');
    c.width = c.height = r * 2 + 4;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(r + 2, r + 2, 0, r + 2, r + 2, r + 2);
    grd.addColorStop(0, color);
    grd.addColorStop(0.45, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(r + 2, r + 2, r + 2, 0, TAU); g.fill();
    return c;
  }
  const GLOW = {};
  function glow(color, r) {
    const k = color + '|' + r;
    return GLOW[k] || (GLOW[k] = makeGlow(color, r));
  }

  function lvl(i) {
    const t = i / 19;
    return {
      t,
      bossHp: 80 + i * 52,
      waves: 2 + Math.floor(i / 2),
      enemyFire: 1.5 - 0.95 * t,
      bulletSpd: 95 + 100 * t,
      bossFire: 0.95 - 0.5 * t,
    };
  }

  const PALETTES = [
    ['#ff5d8f', '#ffd0e0', '#ff8fb3'], ['#5db4ff', '#cfeaff', '#8fd0ff'],
    ['#b07dff', '#ecd9ff', '#c9a3ff'], ['#ffd24a', '#fff0bf', '#ffe08a'],
    ['#5ce8a0', '#d6ffe9', '#9af0c4'], ['#ff8a5d', '#ffe0cf', '#ffb08a'],
  ];

  function build(P, opts) {
    const endless = !!opts.endless;
    const li = endless ? Math.floor((opts.levelIdx || 0)) : (opts.levelIdx || 0);
    const pal = PALETTES[li % PALETTES.length];

    function rr(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }

    return {
      w: 360, h: 560,
      hint: '拖动 / 方向键 移动 · 自动射击 · 点右下炸弹(Z)清屏 · 只有中心红点碰到弹幕才掉命',
      init(S) {
        S.px = 180; S.py = 470;
        S.moveSpd = 240;
        S.lives = 3; S.bombs = 2;
        S.focus = false;
        S.inv = 0;
        S.score = 0; S.graze = 0;
        S.pbul = []; S.ebul = []; S.enemies = []; S.parts = []; S.items = [];
        S.boss = null;
        S.phase = 'intro';
        S.timer = 1.0;
        S.waveIdx = 0; S.spawnT = 0;
        S.bossT = 0; S.bossPattern = 0; S.bossPatT = 0; S.bossSpin = 0;
        S.shake = 0;
        S.toast = 'STAGE ' + (li + 1); S.toastT = 1.0;
        S.over = false; S.done = null; S.bombFx = 0;
        S.pal = pal; S.stage = li;
        S.touch = null; S.keyVec = null; S.keyT = 0;
        S.pFire = 0;
        S.diff = lvl(li);
        S.bombBtn = { x: 322, y: 522, r: 28 };
        S.W = 360; S.H = 560;
        S.stars = [];
        for (let i = 0; i < 60; i++) S.stars.push({ x: Math.random() * 360, y: Math.random() * 560, s: 0.4 + Math.random() * 1.4, v: 8 + Math.random() * 26 });
        return S;
      },

      tick(S, dt, P, api) {
        const W = api.W || 360, H = api.H || 560;
        S.W = W; S.H = H;
        S.timer -= dt; S.toastT -= dt; if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 2);
        if (S.bombFx > 0) S.bombFx -= dt;
        if (S.inv > 0) S.inv -= dt;
        S.diff = lvl(S.stage);

        // ---- 自机移动（拖动/点按指哪走哪，键盘方向）----
        let mvx = 0, mvy = 0, mSpd = S.moveSpd * (S.focus ? 0.42 : 1);
        if (S.touch) {
          const dx = S.touch.x - S.px, dy = S.touch.y - S.py, d = Math.hypot(dx, dy);
          if (d > 1) { mvx = dx; mvy = dy; mSpd = Math.min(mSpd, d * 14); S.focus = true; }
          else S.focus = false;
        } else S.focus = false;
        if (!S.touch && S.keyVec && (performance.now() - S.keyT) < 220) { mvx = S.keyVec.x; mvy = S.keyVec.y; }
        const ml = Math.hypot(mvx, mvy);
        if (ml > 0.01) {
          S.px = clamp(S.px + mvx / ml * mSpd * dt, 12, W - 12);
          S.py = clamp(S.py + mvy / ml * mSpd * dt, 46, H - 26);
        }
        if (S.touch && Math.hypot(S.touch.x - S.px, S.touch.y - S.py) <= 1) S.touch = null;

        // ---- 自机自动射击 ----
        S.pFire -= dt;
        if (S.pFire <= 0 && S.phase !== 'intro' && S.phase !== 'clear') {
          S.pFire = 0.07;
          const spread = S.score > 4000 ? 3 : 2;
          for (let i = 0; i < spread; i++) {
            const ox = (i - (spread - 1) / 2) * 7;
            S.pbul.push({ x: S.px + ox, y: S.py - 10, vx: ox * 1.2, vy: -560, dmg: 1 });
          }
        }

        // ---- 阶段机 ----
        if (S.phase === 'intro') {
          if (S.timer <= 0) { S.phase = 'wave'; S.spawnT = 0.3; }
        } else if (S.phase === 'wave') {
          S.spawnT -= dt;
          if (S.spawnT <= 0 && S.waveIdx < S.diff.waves) {
            S.spawnT = 1.6 - S.diff.t * 0.7;
            S.waveIdx++;
            const n = 4 + Math.floor(S.diff.t * 3);
            for (let i = 0; i < n; i++) {
              const ex = 40 + rf() * (W - 80);
              S.enemies.push({ x: ex, y: -24 - i * 30, hp: 3 + Math.floor(S.diff.t * 3), maxHp: 3 + Math.floor(S.diff.t * 3), r: 11, fire: 0.6 + rf() * S.diff.enemyFire, t: rf() * TAU, vy: 60 + S.diff.t * 40, vx: (rf() < 0.5 ? -1 : 1) * (20 + rf() * 30), kind: ri(0, 2) });
            }
          }
          if (S.waveIdx >= S.diff.waves && S.enemies.length === 0) {
            // 出 BOSS
            S.phase = 'boss'; S.bossT = 1.2; S.bossPattern = 0; S.bossPatT = 0; S.bossSpin = 0;
            S.boss = { x: W / 2, y: 110, hp: S.diff.bossHp, maxHp: S.diff.bossHp, r: 26, t: 0, dir: 1, name: '霜花 灵' };
            S.toast = 'BOSS · ' + S.boss.name; S.toastT = 1.4;
          }
        } else if (S.phase === 'boss') {
          const b = S.boss; b.t += dt;
          b.x += b.dir * (40 + S.diff.t * 30) * dt;
          if (b.x < 60) { b.x = 60; b.dir = 1; }
          if (b.x > W - 60) { b.x = W - 60; b.dir = -1; }
          S.bossT -= dt; S.bossPatT -= dt; S.bossSpin += dt * 2.4;
          if (S.bossT <= 0) {
            S.bossT = S.diff.bossFire * 1.1;
            fireBossPattern(S, b, W, H);
            S.bossPattern = (S.bossPattern + 1) % 4;
            S.bossPatT = S.diff.bossFire;
          } else if (S.bossPatT <= 0 && (S.bossPattern === 1 || S.bossPattern === 3)) {
            // 持续型：螺旋/散花 每帧补弹
            S.bossPatT = 0.055;
            fireBossPattern(S, b, W, H);
          }
          if (b.hp <= 0) {
            S.phase = 'clear'; S.timer = 1.1;
            S.score += 2000 + S.stage * 300;
            explode(S, b.x, b.y, 60, pal[0]);
            S.shake = 0.5;
            for (let i = 0; i < 40; i++) S.items.push({ x: b.x + (rf() - 0.5) * 80, y: b.y + (rf() - 0.5) * 60, vx: (rf() - 0.5) * 40, vy: -30 - rf() * 60, t: 0, kind: rf() < 0.5 ? 'p' : 's' });
          }
        } else if (S.phase === 'clear') {
          if (S.timer <= 0) {
            if (endless) {
              S.stage++; S.phase = 'wave'; S.waveIdx = 0; S.spawnT = 0.4;
              S.bombs = Math.min(5, S.bombs + 1);
              S.toast = 'STAGE ' + (S.stage + 1); S.toastT = 1.0;
              S.diff = lvl(S.stage);
            } else {
              S.done = { win: true, stars: S.lives >= 3 ? 3 : S.lives >= 1 ? 2 : 1, score: Math.floor(S.score), lines: ['击破 BOSS · 残余机 ' + S.lives, '得分 ' + Math.floor(S.score)] };
            }
          }
        }

        // ---- 自机弹 ----
        for (const b of S.pbul) { b.x += b.vx * dt; b.y += b.vy * dt; }
        for (let i = S.pbul.length - 1; i >= 0; i--) if (S.pbul[i].y < -10) S.pbul.splice(i, 1);

        // ---- 敌弹移动 + 命中自机 ----
        const hitR = S.focus ? 3 : 4;
        for (const b of S.ebul) {
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (Math.hypot(b.x - S.px, b.y - S.py) < hitR + b.r * 0.5) {
            b.dead = true;
            if (S.inv <= 0) playerHit(S, W, H);
          }
        }
        for (let i = S.ebul.length - 1; i >= 0; i--) {
          const b = S.ebul[i];
          if (b.dead || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) S.ebul.splice(i, 1);
        }

        // ---- 杂兵 ----
        for (const e of S.enemies) {
          e.t += dt; e.y += e.vy * dt; e.x += e.vx * dt;
          if (e.x < 16 || e.x > W - 16) e.vx *= -1;
          e.fire -= dt;
          if (e.fire <= 0 && e.y > 0 && e.y < H - 120) {
            e.fire = e.maxHp * 0.5 + rf() * S.diff.enemyFire;
            const dx = S.px - e.x, dy = S.py - e.y, d = Math.hypot(dx, dy) || 1;
            const sp = S.diff.bulletSpd * 0.85;
            S.ebul.push({ x: e.x, y: e.y, vx: dx / d * sp, vy: dy / d * sp, r: 5, col: pal[2] });
          }
        }
        // 自机弹 vs 杂兵
        for (let i = S.enemies.length - 1; i >= 0; i--) {
          const e = S.enemies[i];
          for (const b of S.pbul) {
            if (!b.dead && Math.hypot(b.x - e.x, b.y - e.y) < e.r + 4) {
              b.dead = true; e.hp -= b.dmg;
              explode(S, b.x, b.y, 3, pal[2]);
              break;
            }
          }
          if (e.hp <= 0) {
            S.score += 120; explode(S, e.x, e.y, 10, pal[1]);
            if (rf() < 0.35) S.items.push({ x: e.x, y: e.y, vx: (rf() - 0.5) * 40, vy: -40, t: 0, kind: 's' });
            S.enemies.splice(i, 1);
          }
        }
        for (let i = S.pbul.length - 1; i >= 0; i--) if (S.pbul[i].dead) S.pbul.splice(i, 1);

        // ---- BOSS 受弹 ----
        if (S.boss) {
          for (const b of S.pbul) {
            if (!b.dead && Math.hypot(b.x - S.boss.x, b.y - S.boss.y) < S.boss.r + 4) {
              b.dead = true; S.boss.hp -= b.dmg; explode(S, b.x, b.y, 2, pal[0]);
            }
          }
        }

        // ---- 道具 ----
        for (const it of S.items) {
          it.t += dt; it.x += it.vx * dt; it.y += it.vy * dt; it.vy += 60 * dt;
          if (Math.hypot(it.x - S.px, it.y - S.py) < 16) {
            it.dead = true; S.score += it.kind === 'p' ? 60 : 30;
          }
        }
        for (let i = S.items.length - 1; i >= 0; i--) if (S.items[i].dead || S.items[i].y > H + 20) S.items.splice(i, 1);

        // ---- 粒子 ----
        for (const p of S.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 40 * dt; }
        for (let i = S.parts.length - 1; i >= 0; i--) if (S.parts[i].t > 0.5) S.parts.splice(i, 1);

        // ---- 星空背景 ----
        for (const s of S.stars) { s.y += s.v * dt; if (s.y > H) { s.y = 0; s.x = rf() * W; } }

        if (S.lives <= 0 && !S.done) S.done = { win: false, stars: 0, score: Math.floor(S.score), lines: ['被弹幕击落了…', '得分 ' + Math.floor(S.score)] };
      },

      check(S) { return S.done || null; },
      score(S) { return Math.floor(S.score); },

      tap(S, x, y, P, api) {
        if (Math.hypot(x - S.bombBtn.x, y - S.bombBtn.y) < S.bombBtn.r) { doBomb(S, api.W || 360, api.H || 560); return; }
        S.touch = { x, y };
      },
      drag(S, x, y) { S.touch = { x, y }; },
      dragend(S) { /* 保留 touch，自机会缓动到手指最后位置 */ },
      key(S, k) {
        const m = { w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
        if (m) { S.keyVec = { x: m[0], y: m[1] }; S.keyT = performance.now(); }
        if (k === 'z' || k === 'Z' || k === ' ' || k === 'x' || k === 'X') doBomb(S, S.W || 360, S.H || 560);
      },

      draw(ctx, S, P, W, H, api) {
        ctx.save();
        if (S.shake > 0) { const a = S.shake * 8; ctx.translate((rf() - 0.5) * a, (rf() - 0.5) * a); }
        // 背景
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#0a0a1e'); bg.addColorStop(0.6, '#160a24'); bg.addColorStop(1, '#1a0e1f');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        for (const s of S.stars) ctx.fillRect(s.x, s.y, s.s, s.s);
        // 地面光晕
        const fg = ctx.createRadialGradient(W / 2, H, 20, W / 2, H, W * 0.7);
        fg.addColorStop(0, 'rgba(255,120,180,.10)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);

        // 道具
        for (const it of S.items) {
          ctx.fillStyle = it.kind === 'p' ? '#ffd24a' : '#5ce8a0';
          ctx.beginPath(); ctx.arc(it.x, it.y, 5, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = 'bold 7px Arial'; ctx.textAlign = 'center';
          ctx.fillText(it.kind === 'p' ? 'P' : 'S', it.x, it.y + 2.5);
        }

        // 敌弹（发光精灵）
        for (const b of S.ebul) {
          const g = glow(b.col || '#ff6fae', b.r + 2);
          ctx.drawImage(g, b.x - g.width / 2, b.y - g.height / 2);
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(1.4, b.r * 0.4), 0, TAU); ctx.fill();
        }

        // 自机弹
        ctx.fillStyle = '#bff0ff'; ctx.shadowColor = '#7fdfff'; ctx.shadowBlur = 6;
        for (const b of S.pbul) { ctx.beginPath(); ctx.ellipse(b.x, b.y, 2.4, 6, 0, 0, TAU); ctx.fill(); }
        ctx.shadowBlur = 0;

        // 杂兵
        for (const e of S.enemies) drawFairy(ctx, e, S.pal);

        // BOSS
        if (S.boss) drawBoss(ctx, S.boss, S.pal, S);

        // 粒子
        for (const p of S.parts) {
          ctx.globalAlpha = Math.max(0, 1 - p.t / 0.5);
          ctx.fillStyle = p.col;
          ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;

        // 自机（巫女）
        if (S.inv <= 0 || Math.floor(S.inv * 12) % 2 === 0) drawMaiden(ctx, S.px, S.py, S.pal, S.focus);

        // 炸弹特效
        if (S.bombFx > 0) {
          ctx.globalAlpha = S.bombFx / 0.5;
          const rg = ctx.createRadialGradient(S.px, S.py, 0, S.px, S.py, W);
          rg.addColorStop(0, 'rgba(255,255,255,.9)'); rg.addColorStop(0.4, 'rgba(255,200,240,.5)'); rg.addColorStop(1, 'rgba(255,150,220,0)');
          ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
          ctx.globalAlpha = 1;
        }

        // BOSS 血条
        if (S.boss) {
          const bw = W - 60, bx = 30, by = 30;
          ctx.fillStyle = 'rgba(0,0,0,.4)'; rr(ctx, bx, by, bw, 7, 3); ctx.fill();
          ctx.fillStyle = S.pal[0]; rr(ctx, bx, by, bw * Math.max(0, S.boss.hp / S.boss.maxHp), 7, 3); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'left';
          ctx.fillText(S.boss.name, bx, by - 3);
        }

        // HUD
        ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Arial';
        ctx.fillText('分数 ' + Math.floor(S.score), 8, 20);
        for (let i = 0; i < S.lives; i++) { ctx.fillStyle = '#ff6f8f'; ctx.beginPath(); ctx.arc(14 + i * 14, 34, 5, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#fff'; ctx.font = '11px Arial'; ctx.fillText('残机', 14 + S.lives * 14, 38);
        for (let i = 0; i < S.bombs; i++) { ctx.fillStyle = '#5db4ff'; ctx.fillRect(W - 16 - i * 12, 12, 9, 12); }

        // 炸弹按钮
        const bb = S.bombBtn;
        ctx.fillStyle = 'rgba(93,180,255,.85)'; ctx.beginPath(); ctx.arc(bb.x, bb.y, bb.r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
        ctx.fillText('炸弹', bb.x, bb.y - 3); ctx.fillText('BOMB', bb.x, bb.y + 10);

        // 提示
        if (S.toastT > 0) {
          ctx.globalAlpha = Math.min(1, S.toastT * 1.5);
          ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center';
          ctx.fillText(S.toast, W / 2, H / 2 - 40);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      },
    };
  }

  function playerHit(S, W, H) {
    S.lives--; S.inv = 2.2; S.shake = 0.4;
    S.score = Math.max(0, S.score - 300);
    explode(S, S.px, S.py, 24, '#ff6f8f');
    // 清掉自机周围弹幕
    for (const b of S.ebul) if (Math.hypot(b.x - S.px, b.y - S.py) < 70) b.dead = true;
  }

  function doBomb(S, W, H) {
    if (S.bombs <= 0 || S.bombFx > 0 || S.phase === 'intro') return;
    S.bombs--; S.bombFx = 0.5; S.inv = Math.max(S.inv, 0.6);
    for (const b of S.ebul) { b.dead = true; S.score += 5; }
    for (const e of S.enemies) { e.hp -= 4; explode(S, e.x, e.y, 6, '#9af0c4'); }
    if (S.boss) S.boss.hp -= Math.max(20, S.boss.maxHp * 0.12);
    explode(S, S.px, S.py, 30, '#ffd24a');
  }

  function explode(S, x, y, n, col) {
    for (let i = 0; i < n; i++) {
      const a = rf() * TAU, sp = 40 + rf() * 160;
      S.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, col });
    }
  }

  function fireBossPattern(S, b, W, H) {
    const pat = S.bossPattern, sp = S.diff.bulletSpd;
    if (pat === 0) {                                   // 环形爆发
      const n = 18 + Math.floor(S.diff.t * 14), off = rf() * TAU;
      for (let i = 0; i < n; i++) {
        const a = off + i / n * TAU;
        S.ebul.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 5, col: S.pal[2] });
      }
    } else if (pat === 1) {                            // 双向螺旋
      for (let k = 0; k < 2; k++) {
        const a = S.bossSpin + k * Math.PI;
        S.ebul.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp * 0.8, vy: Math.sin(a) * sp * 0.8, r: 5, col: S.pal[0] });
      }
    } else if (pat === 2) {                            // 瞄准三连
      const dx = S.px - b.x, dy = S.py - b.y, d = Math.hypot(dx, dy) || 1;
      for (let k = -1; k <= 1; k++) {
        const a = Math.atan2(dy, dx) + k * 0.18;
        S.ebul.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp * 1.05, vy: Math.sin(a) * sp * 1.05, r: 5, col: S.pal[1] });
      }
    } else {                                           // 花瓣散花
      const n = 14 + Math.floor(S.diff.t * 10), off = rf() * TAU;
      for (let i = 0; i < n; i++) {
        const a = off + i / n * TAU;
        const r = sp * (0.55 + (i % 3) * 0.22);
        S.ebul.push({ x: b.x, y: b.y, vx: Math.cos(a) * r, vy: Math.sin(a) * r, r: 5, col: S.pal[2] });
      }
    }
  }

  function drawFairy(ctx, e, pal) {
    ctx.save();
    ctx.fillStyle = pal[1];
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(e.x - 3, e.y - 2, 2, 0, TAU); ctx.arc(e.x + 3, e.y - 2, 2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a2030';
    ctx.beginPath(); ctx.arc(e.x - 3, e.y - 2, 1, 0, TAU); ctx.arc(e.x + 3, e.y - 2, 1, 0, TAU); ctx.fill();
    // 血条
    if (e.hp < e.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(e.x - 10, e.y - e.r - 6, 20, 3);
      ctx.fillStyle = '#7ad86a'; ctx.fillRect(e.x - 10, e.y - e.r - 6, 20 * (e.hp / e.maxHp), 3);
    }
    ctx.restore();
  }

  function drawBoss(ctx, b, pal, S) {
    ctx.save();
    // 旋转光环
    ctx.strokeStyle = pal[2]; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 6 + k * 5 + Math.sin(S.bossSpin + k) * 2, S.bossSpin + k, S.bossSpin + k + 3.6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 身体
    const g = ctx.createRadialGradient(b.x, b.y - 6, 4, b.x, b.y, b.r);
    g.addColorStop(0, '#fff'); g.addColorStop(0.4, pal[0]); g.addColorStop(1, pal[2]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    // 头发/角
    ctx.fillStyle = pal[2];
    ctx.beginPath(); ctx.moveTo(b.x - 10, b.y - b.r); ctx.quadraticCurveTo(b.x, b.y - b.r - 16, b.x + 10, b.y - b.r); ctx.fill();
    // 眼
    ctx.fillStyle = '#2a2030';
    ctx.beginPath(); ctx.arc(b.x - 8, b.y - 2, 2.4, 0, TAU); ctx.arc(b.x + 8, b.y - 2, 2.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(b.x - 8, b.y - 3, 0.9, 0, TAU); ctx.arc(b.x + 8, b.y - 3, 0.9, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawMaiden(ctx, x, y, pal, focus) {
    ctx.save();
    // 裙摆
    ctx.fillStyle = '#f4f0ff';
    ctx.beginPath(); ctx.moveTo(x - 11, y + 12); ctx.lineTo(x + 11, y + 12); ctx.lineTo(x + 7, y - 2); ctx.lineTo(x - 7, y - 2); ctx.closePath(); ctx.fill();
    // 上衣（红）
    ctx.fillStyle = '#e23b5a';
    ctx.beginPath(); ctx.ellipse(x, y - 4, 7, 8, 0, 0, TAU); ctx.fill();
    // 头
    ctx.fillStyle = '#ffe0c4';
    ctx.beginPath(); ctx.arc(x, y - 14, 8, 0, TAU); ctx.fill();
    // 头发
    ctx.fillStyle = '#3a2b4a';
    ctx.beginPath(); ctx.arc(x, y - 16, 8.5, Math.PI, TAU); ctx.fill();
    ctx.fillRect(x - 8.5, y - 16, 17, 4);
    // 团子（两侧红白）
    ctx.fillStyle = '#e23b5a'; ctx.beginPath(); ctx.arc(x - 9, y - 18, 2.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + 9, y - 18, 2.4, 0, TAU); ctx.fill();
    // 眼
    ctx.fillStyle = '#2a2030';
    ctx.beginPath(); ctx.arc(x - 3, y - 14, 1.3, 0, TAU); ctx.arc(x + 3, y - 14, 1.3, 0, TAU); ctx.fill();
    // 聚焦时显示判定点
    if (focus) {
      ctx.fillStyle = 'rgba(255,40,40,.9)';
      ctx.beginPath(); ctx.arc(x, y - 8, 3, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,80,.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y - 8, 9, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  window.MiniGames['danmaku'] = {
    id: 'danmaku',
    name: '弹幕樱华祭',
    emoji: '🎆',
    hint: '拖动/方向键移动自机 · 自动射击 · 点炸弹(Z)清屏 · 只有中心红点碰弹幕才掉命',
    LEVELS: Array.from({ length: 20 }, (_, i) => lvl(i)),
    ENDLESS: true,
    start(container, opts) {
      const P = Object.assign({}, opts.level || {});
      P.endless = !!opts.endless;
      return E.game(container, opts, build(P, opts));
    },
  };
})();
