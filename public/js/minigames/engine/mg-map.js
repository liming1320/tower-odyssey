// 小游戏引擎 · 地图模块（mg-map.js）
// 职责：瓦片地图渲染（网格地牢 / 塔 / 迷宫）、NPC 对话框、通用 RPG HUD。
window.MG = window.MG || {};
var MG = window.MG;

// ================= 瓦片地图渲染（网格地牢 / 塔 / 迷宫通用）=================
// 地形码：'#' 墙  '.' 地板  '^' 上楼  'v' 下楼  '~' 水  '"' 草  'L' 熔岩  '*' 陷阱
// bake(): 把静态地形烘培成离屏 canvas，每帧只 drawImage，避免逐格重绘
MG.grid = {
    isWall(c) { return c === '#'; },
    // 烘培整层地形 → 返回离屏 canvas（尺寸 = W*ts × H*ts）
    bake(cells, ts, opt) {
        opt = opt || {};
        const H = cells.length, W = cells[0] ? cells[0].length : 0;
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, W * ts); cv.height = Math.max(1, H * ts);
        const x = cv.getContext('2d');
        for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
            this._tile(x, xx * ts, y * ts, ts, cells[y][xx], opt.tint);
        }
        return cv;
    },
    _tile(x, px, py, s, c, tint) {
        const floorA = (tint && tint.floorA) || '#2a2740';
        const floorB = (tint && tint.floorB) || '#34314f';
        if (c === '#') {
            const g = x.createLinearGradient(px, py, px, py + s); g.addColorStop(0, '#5b5674'); g.addColorStop(1, '#393550');
            x.fillStyle = g; x.fillRect(px, py, s, s);
            x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 1;
            x.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
            x.beginPath(); x.moveTo(px, py + s / 2); x.lineTo(px + s, py + s / 2); x.stroke();
            x.beginPath(); x.moveTo(px + s / 2, py); x.lineTo(px + s / 2, py + s / 2); x.stroke();
            x.beginPath(); x.moveTo(px + s / 4, py + s / 2); x.lineTo(px + s / 4, py + s); x.stroke();
            x.beginPath(); x.moveTo(px + s * 3 / 4, py + s / 2); x.lineTo(px + s * 3 / 4, py + s); x.stroke();
            x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(px + 2, py + 2, s - 4, 2);
            return;
        }
        const fg = x.createLinearGradient(px, py, px, py + s); fg.addColorStop(0, floorA); fg.addColorStop(1, floorB);
        x.fillStyle = fg; x.fillRect(px, py, s, s);
        x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 1; x.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
        if (((px / s) + (py / s)) % 2 === 0) { x.fillStyle = 'rgba(255,255,255,0.03)'; x.fillRect(px + 1, py + 1, s - 2, s - 2); }
        if (c === '^' || c === 'v') {
            x.save(); x.translate(px + s / 2, py + s / 2);
            x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(-s * 0.34, -s * 0.34, s * 0.68, s * 0.68);
            x.strokeStyle = '#ffe6a0'; x.lineWidth = 2; x.lineCap = 'round';
            for (let i = 0; i < 4; i++) { const yy = c === '^' ? (s * 0.26 - i * s * 0.16) : (-s * 0.26 + i * s * 0.16); x.beginPath(); x.moveTo(-s * 0.26, yy); x.lineTo(s * 0.26, yy); x.stroke(); }
            x.restore();
        } else if (c === '~') {
            x.fillStyle = 'rgba(70,150,230,0.5)'; x.fillRect(px + 2, py + 2, s - 4, s - 4);
            x.strokeStyle = 'rgba(180,220,255,0.7)'; x.lineWidth = 1.5;
            for (let i = 0; i < 2; i++) { x.beginPath(); x.moveTo(px + 4, py + s * (0.4 + i * 0.3)); x.quadraticCurveTo(px + s / 2, py + s * (0.4 + i * 0.3) - 3, px + s - 4, py + s * (0.4 + i * 0.3)); x.stroke(); }
        } else if (c === '"') {
            x.fillStyle = 'rgba(80,180,90,0.35)'; x.fillRect(px + 2, py + 2, s - 4, s - 4);
            x.strokeStyle = '#5fd06a'; x.lineWidth = 1.4; x.lineCap = 'round';
            for (let i = 0; i < 3; i++) { const bx = px + s * (0.3 + i * 0.22); x.beginPath(); x.moveTo(bx, py + s * 0.7); x.lineTo(bx - 2, py + s * 0.35); x.moveTo(bx, py + s * 0.7); x.lineTo(bx + 2, py + s * 0.35); x.stroke(); }
        } else if (c === 'L') {
            const g = x.createRadialGradient(px + s / 2, py + s / 2, 2, px + s / 2, py + s / 2, s / 2); g.addColorStop(0, '#ffd070'); g.addColorStop(1, '#d84818');
            x.fillStyle = g; x.fillRect(px + 2, py + 2, s - 4, s - 4);
        } else if (c === '*') {
            x.fillStyle = 'rgba(200,60,90,0.35)'; x.fillRect(px + 2, py + 2, s - 4, s - 4);
            x.fillStyle = '#ff7a9a'; x.font = (s * 0.5) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('✕', px + s / 2, py + s / 2);
        }
    },
    // 小地图：seen 为已探索布尔矩阵；hero 高亮
    mini(ctx, cells, hx, hy, ts, ox, oy, seen) {
        const H = cells.length, W = cells[0].length;
        for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
            const vis = !seen || seen[y][xx];
            const v = !vis ? 0 : (cells[y][xx] === '#' ? 1 : 2);
            ctx.fillStyle = v === 0 ? 'rgba(255,255,255,0.10)' : v === 1 ? 'rgba(120,120,150,0.7)' : 'rgba(200,200,230,0.55)';
            ctx.fillRect(ox + xx * ts, oy + y * ts, ts - 0.4, ts - 0.4);
        }
        ctx.fillStyle = '#ffd56b'; ctx.fillRect(ox + hx * ts + ts * 0.18, oy + hy * ts + ts * 0.18, ts * 0.64, ts * 0.64);
    },
};

// ================= NPC 对话框（通用）=================
// dlg: { speaker, text, color, choices:[{label}], icon }
// draw 返回可选区域数组 [{x,y,w,h,i}] 供点击命中
MG.dialogue = {
    draw(ctx, W, H, dlg) {
        if (!dlg) return [];
        const pad = 14, bw = W - pad * 2, bh = 104, by = H - bh - 12;
        MG.ui.rr(ctx, pad, by, bw, bh, 12); ctx.fillStyle = 'rgba(12,14,26,0.92)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = dlg.color || '#8ad0ff'; ctx.stroke();
        if (dlg.speaker) { ctx.fillStyle = dlg.color || '#8ad0ff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(dlg.speaker, pad + 12, by + 10); }
        ctx.fillStyle = '#e8ecf4'; ctx.font = '14px sans-serif'; ctx.textBaseline = 'top';
        const lines = this._wrap(ctx, dlg.text || '', W - pad * 2 - 24, 20);
        lines.slice(0, 3).forEach((ln, i) => ctx.fillText(ln, pad + 12, by + 32 + i * 20));
        const rects = [];
        if (dlg.choices && dlg.choices.length) {
            const cw = (bw - 24) / dlg.choices.length, ch = 30;
            dlg.choices.forEach((c, i) => {
                const rx = pad + 12 + i * cw, ry = by + bh - ch - 8;
                MG.ui.rr(ctx, rx, ry, cw - 6, ch, 8); ctx.fillStyle = 'rgba(90,130,200,0.35)'; ctx.fill();
                ctx.strokeStyle = dlg.color || '#8ad0ff'; ctx.lineWidth = 1.2; ctx.stroke();
                ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(c.label, rx + (cw - 6) / 2, ry + ch / 2);
                rects.push({ x: rx, y: ry, w: cw - 6, h: ch, i });
            });
        }
        return rects;
    },
    _wrap(ctx, text, maxw) {
        const out = []; let line = '';
        for (const ch of (text || '')) {
            if (ctx.measureText(line + ch).width > maxw) { out.push(line); line = ch; }
            else line += ch;
        }
        if (line) out.push(line);
        return out;
    },
};

// ================= 通用 HUD（RPG 状态栏）=================
MG.hud = {
    // 圆角数值条（HP / 经验等），ratio 0~1
    meter(ctx, x, y, w, h, ratio, color, label, valTxt) {
        MG.ui.rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
        const r = Math.max(0, Math.min(1, ratio));
        if (r > 0) { MG.ui.rr(ctx, x, y, Math.max(h, w * r), h, h / 2); ctx.fillStyle = color; ctx.fill(); }
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(h * 0.62) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label + (valTxt != null ? ' ' + valTxt : ''), x + w / 2, y + h / 2 + 1);
    },
    // 图标数值胶囊，返回自身宽度
    chip(ctx, x, y, icon, text, color) {
        ctx.font = 'bold 13px sans-serif'; const tw = ctx.measureText(text).width;
        const ww = 24 + tw + 8;
        MG.ui.rr(ctx, x, y, ww, 22, 11); ctx.fillStyle = color || 'rgba(0,0,0,0.4)'; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = '14px sans-serif'; ctx.fillText(icon, x + 7, y + 12);
        ctx.font = 'bold 13px sans-serif'; ctx.fillText(text, x + 25, y + 12);
        return ww;
    },
    label(ctx, x, y, text, color, size, align) {
        ctx.fillStyle = color || '#fff'; ctx.font = (size || 13) + 'px sans-serif';
        ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
    },
};
