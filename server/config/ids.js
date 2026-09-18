// 游戏内容配置（纯数据）—— 由 server.js 抽出，请勿在此写逻辑
const crypto = require('crypto');

const DISPLAY_ID_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const DISPLAY_ID_LEN = 14;

const DISPLAY_NICK_MAX = 12;

const SMS_ENABLED = false;

const SMS = {
    codes: new Map(),     // phone -> { code, expires }（验证通过即作废）
    nextSend: new Map(),  // phone -> 下次可发送时间戳（独立存放：验证码作废后限流依然生效）
    recent: [],           // 最近发送记录（后台查看用）：{ phone, code, time }
    codeTTL: 5 * 60 * 1000,                                  // 验证码 5 分钟有效
    resendGap: (parseInt(process.env.SMS_RESEND_SEC) || 60) * 1000, // 同号重发间隔（测试可调小）
    recentMax: 30,
    send(phone) {
        if (!SMS_ENABLED) return { ok: false, error: '短信通道暂未开放，请使用账号密码登录' };
        const now = Date.now();
        const ns = this.nextSend.get(phone) || 0;
        if (now < ns) {
            return { ok: false, error: `发送太频繁，请 ${Math.ceil((ns - now) / 1000)} 秒后再试` };
        }
        const code = String(crypto.randomInt(100000, 1000000));
        this.codes.set(phone, { code, expires: now + this.codeTTL });
        this.nextSend.set(phone, now + this.resendGap);
        this.recent.unshift({ phone, code, time: now });
        if (this.recent.length > this.recentMax) this.recent.length = this.recentMax;
        // 开发模式：直接打日志（接真实短信时替换为厂商 API 调用）
        console.log(`[sms] 验证码 → ${phone}：${code}（${this.codeTTL / 60000} 分钟内有效）`);
        return { ok: true, dev: true };
    },
    verify(phone, code) {
        const rec = this.codes.get(phone);
        if (!rec) return { ok: false, error: '请先获取验证码' };
        if (Date.now() > rec.expires) { this.codes.delete(phone); return { ok: false, error: '验证码已过期，请重新获取' }; }
        if (String(code) !== rec.code) return { ok: false, error: '验证码错误' };
        this.codes.delete(phone); // 验证通过即作废，一次性使用
        return { ok: true };
    },
};

module.exports = {
  DISPLAY_ID_CHARS,
  DISPLAY_ID_LEN,
  DISPLAY_NICK_MAX,
  SMS_ENABLED,
  SMS,
};
