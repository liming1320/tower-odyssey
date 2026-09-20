/* 无浏览器回归：驱动 battle.js 的 update/draw，覆盖所有敌人 shape、BOSS/精英、
 * 英雄受击/阵亡/必杀以及新加的淡入 + 顿帧 + 白环 + 飘字逻辑，确保不抛错。
 * 用法：node tools/smoke-battle-polish.js
 */
const fs = require('fs');
const path = require('path');

const noop = () => {};
function makeCtx() {
    const grad = { addColorStop: noop };
    const base = { canvas: { width: 360, height: 640 } };
    return new Proxy(base, {
        get(t, p) {
            if (p in t) return t[p];
            return (...a) => {
                if (p === 'createLinearGradient' || p === 'createRadialGradient') return grad;
                if (p === 'measureText') return { width: 10 };
                return undefined;
            };
        },
        set(t, p, v) { t[p] = v; return true; },
    });
}
const ctx = makeCtx();
const canvas = { getContext: () => ctx, clientWidth: 360, clientHeight: 640, width: 360, height: 640, addEventListener: noop };

global.document = { body: { classList: { add: noop, remove: noop } }, getElementById: () => null, createElement: () => canvas };
global.window = { addEventListener: noop, removeEventListener: noop, devicePixelRatio: 1, innerWidth: 360, innerHeight: 640 };
let T = 0;
global.performance = { now: () => T };
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = noop;
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
global.Image = class { set src(v) { this._src = v; if (this.onload) this.onload(); } get src() { return this._src; } };
// 共享打击感底座 U.fx 的测试桩（方法签名与 utils.js 的 U.fx 一致，便于 battle.js 无浏览器驱动）
let _fxCalls = 0;
global.U = {
    starColor: s => (s >= 15 ? '#ff7a8b' : s >= 11 ? '#b78bff' : '#ffd56b'),
    imgSrc: f => '/img/' + f,
    fx: {
        _hs: 0,
        hitStop(sec) { this._hs = Math.max(this._hs, sec || 0); return this._hs > 0; },
        consumeHitStop(dt) { if (this._hs > 0) this._hs = Math.max(0, this._hs - dt); return this._hs > 0; },
        shake() { _fxCalls++; }, updateCam() {}, update() {},
        applyCam() {}, burst() { _fxCalls++; }, text() { _fxCalls++; }, ring() {}, flash() {}, draw() { _fxCalls++; },
    },
};
// 模拟 MG 引擎底座，确保 U.fx 在「MG 存在」分支下也不抛错（cam/fxPool 接口与 mg-effects.js 对齐）
global.window.MG = {
    a11y: null, _quality: 1,
    cam() {
        let amt = 0, t = 0, dur = 0;
        return {
            shake(a, d) { amt = Math.max(amt, a || 6); dur = Math.max(dur, d || 0.28); t = 0; return this; },
            set() { return this; }, reset() { return this; },
            update(dt) { if (amt > 0) { t += dt; if (t >= dur) amt = 0; } return this; },
            apply(ctx, W, H) { if (amt > 0.2 && ctx && ctx.translate) ctx.translate(0, 0); return this; },
        };
    },
    fxPool(cap) {
        const list = [];
        return {
            list, burst() { _fxCalls++; }, text() { _fxCalls++; }, ring() {}, flash() {}, hitstop() {},
            update() {}, draw() { _fxCalls++; }, clear() {},
        };
    },
};
global.__fxCalls = () => _fxCalls;

// 载入 battle.js（浏览器全局对象，eval 到本作用域）
const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'battle.js'), 'utf8');
eval(code + '\nglobal.Battle = Battle;');

const SHAPES = ['blob', 'brute', 'undead', 'beast', 'bat', 'golem', 'ghost', 'spider', 'insect', 'plant', 'demon', 'bird', 'serpent', 'mage', 'knight', 'wisp', 'dragon'];

function buildWaves() {
    const waves = [];
    for (let w = 0; w < 8; w++) {
        const enemies = [];
        for (let i = 0; i < SHAPES.length; i++) {
            enemies.push({
                name: '怪' + i, emoji: '👾', shape: SHAPES[i],
                body: '#8a8a8a', accent: '#333',
                hp: 30, maxHp: 30, atk: 5, speed: 30,
                skill: i % 4 === 0 ? '毒' : '',
                elite: i === 3,
            });
        }
        if (w === 4) {
            enemies.push({ name: 'BOSS', emoji: '👹', shape: 'demon', body: '#aa3333', accent: '#ffcc00', hp: 400, maxHp: 400, atk: 12, speed: 18, boss: true, skill: '狂暴' });
        }
        waves.push({ enemies });
    }
    return waves;
}

function buildHeroes() {
    return [
        { uid: 'h1', name: '英雄A', img: 'heroes/h01.svg', rarity: '传说+', element: '水', star: 16, atk: 60, hp: 600, maxHp: 600,
          skills: [{ name: '水刃', desc: '造成伤害', cd: 4, multiplier: 1.5, fx: 'tidal', tint: '#5cc7ff' }],
          ult: { name: '怒涛', cd: 10, mul: 4, fx: 'bloom', tint: '#5cc7ff' }, perks: { aura: 10, allDmg: 5, shield: 20, stun: 30, stunUp: true } },
        { uid: 'h2', name: '英雄B', img: 'heroes/h02.svg', rarity: '传说', element: '火', star: 12, atk: 50, hp: 500, maxHp: 500,
          skills: [{ name: '火球', desc: '点燃', cd: 5, multiplier: 1.8, fx: 'fire', tint: '#ff7a2f' }],
          ult: { name: '业火', cd: 12, mul: 3.5, fx: 'meteor', tint: '#ff7a2f' }, perks: { revive: 1 } },
    ];
}

let frames = 0, draws = 0, errors = [];
function run(mode) {
    T = 0;
    Battle.start(canvas, { waves: buildWaves(), heroes: buildHeroes(), ancient: mode === 'ancient', floor: 5, autoSkill: true });
    Battle.stats.crit = 100; // 强制暴击，触发震屏 + 顿帧分支
    for (let i = 0; i < 240; i++) {
        T += 50; // 50ms/帧
        try {
            Battle.update(0.05, T);
            Battle.draw();
            frames++; draws++;
        } catch (e) {
            errors.push(mode + ' frame ' + i + ': ' + (e && e.stack ? e.stack : e));
            break;
        }
        // 第 30 帧手动击杀一个敌人（覆盖 dealDamage 死亡分支）
        if (i === 30 && Battle.enemies[0]) { try { Battle.dealDamage(Battle.enemies[0], 99999, true, '#fff', true); } catch (e) { errors.push('kill: ' + e); } }
        // 第 60 帧手动击杀一名英雄（覆盖英雄阵亡 + 顿帧分支）
        if (i === 60 && Battle.heroes[0]) { try { Battle.dealDamage(Battle.heroes[0], 99999, true, '#ff5252', true); } catch (e) { errors.push('herokill: ' + e); } }
        // 第 90 帧放必杀（覆盖 castUlt + bloom + shake）
        if (i === 90 && Battle.heroes[1] && !Battle.heroes[1].dead) { try { Battle.heroes[1].ult.cdTimer = 0; Battle.castUlt(Battle.heroes[1]); } catch (e) { errors.push('ult: ' + e); } }
    }
    Battle.stop();
}

run('normal');
run('ancient');

console.log(`frames=${frames} draws=${draws} errors=${errors.length}`);
if (errors.length) { errors.forEach(e => console.log('  ✗ ' + e)); process.exit(1); }
console.log('✅ battle.js 表现增强回归通过（淡入/顿帧/白环/震屏/飘字，全部 shape + BOSS + 精英 + 英雄阵亡 + 必杀，normal & ancient 双模式）');
