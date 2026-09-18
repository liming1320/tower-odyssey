// 小游戏引擎 · 轻量文案表（mg-i18n.js）—— Tier3-10
window.MG = window.MG || {}; var MG = window.MG;
// MG.i18n.set(dict, lang) 注入文案表；MG.t('键') 取译文，缺省回退原串。
MG.i18n = {
    lang: 'zh',
    dict: {},
    languages: [{ id: 'zh', name: '中文' }, { id: 'en', name: 'English' }],
    set(dict, lang) { if (lang) this.lang = lang; if (dict) Object.assign(this.dict, dict); },
    t(s) { return (this.dict[s] != null ? this.dict[s] : s); },
};
MG.t = function (s) { return MG.i18n.t(s); };
