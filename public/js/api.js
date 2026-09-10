// API 封装
const API = (() => {
    const token = () => localStorage.getItem('game-token');
    async function call(method, path, body) {
        const res = await fetch(path, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token() ? 'Bearer ' + token() : '',
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const json = await res.json();
        if (res.status === 404) throw new Error('版本过旧，请刷新页面后重试（Ctrl+F5）');
        if (!res.ok) throw new Error(json.error || '请求失败');
        return json;
    }
    return {
        token,
        setToken: t => localStorage.setItem('game-token', t),
        clearToken: () => localStorage.removeItem('game-token'),
        register: (username, password, extra) => call('POST', '/api/register', Object.assign({ username, password }, extra || {})),
        login: (username, password) => call('POST', '/api/login', { username, password }),
        // 手机号通道
        smsSend: (phone) => call('POST', '/api/sms/send', { phone }),
        phoneLogin: (phone, code, password) => call('POST', '/api/phone/login', { phone, code, password }),
        bindPhone: (phone, code) => call('POST', '/api/user/bind-phone', { phone, code }),
        setPassword: (oldPassword, newPassword) => call('POST', '/api/user/set-password', { oldPassword, newPassword }),
        logout: () => call('POST', '/api/logout'),
        giftRedeem: (code) => call('POST', '/api/gift/redeem', { code }),
        accountDelete: (password, confirm) => call('POST', '/api/account/delete', { password, confirm }),
        me: () => call('GET', '/api/me'),
        buildingUpgrade: (which) => call('POST', '/api/building/upgrade', { which }),
        camp: () => call('GET', '/api/camp'),
        campCollect: () => call('POST', '/api/camp/collect'),
        shopBuyWish: (count) => call('POST', '/api/shop/buy-wish', { count }),
        wallUpgrade: () => call('POST', '/api/wall/upgrade'),
        treasureEquip: (id) => call('POST', '/api/treasure/equip', { id }),
        treasureUnequip: (id) => call('POST', '/api/treasure/unequip', { id }),
        heroes: () => call('GET', '/api/heroes'),
        heroLevelup: (uid) => call('POST', '/api/hero/levelup', { uid }),
        heroStarup: (uid) => call('POST', '/api/hero/starup', { uid }),
        forgeLevelup: (uid, slot, times) => call('POST', '/api/hero/forge-levelup', { uid, slot, times }),
        forgeQualityup: (uid, slot) => call('POST', '/api/hero/forge-qualityup', { uid, slot }),
        events: () => call('GET', '/api/events'),
        eventClaim: (id) => call('POST', '/api/event/claim', { id }),
        heroEquip: (uid) => call('POST', '/api/hero/equip', { uid }),
        heroUnequip: (uid) => call('POST', '/api/hero/unequip', { uid }),
        // 装备 / 戒指 / 神器 / 宝石
        heroEquipItem: (uid, slot, itemId) => call('POST', '/api/hero/equip-item', { uid, slot, itemId }),
        heroUnequipItem: (uid, slot) => call('POST', '/api/hero/unequip-item', { uid, slot }),
        heroEquipRing: (uid, ringId) => call('POST', '/api/hero/equip-ring', { uid, ringId }),
        heroUnequipRing: (uid) => call('POST', '/api/hero/unequip-ring', { uid }),
        heroEquipArtifact: (uid, artifactId) => call('POST', '/api/hero/equip-artifact', { uid, artifactId }),
        heroUnequipArtifact: (uid) => call('POST', '/api/hero/unequip-artifact', { uid }),
        heroArtifactLevelup: (uid, cost) => call('POST', '/api/hero/artifact-levelup', { uid, cost }),
        heroArtifactStarup: (uid, cost) => call('POST', '/api/hero/artifact-starup', { uid, cost }),
        heroSetGem: (uid, slot, gemId) => call('POST', '/api/hero/set-gem', { uid, slot, gemId }),
        wish: (count) => call('POST', '/api/wish', { count: count || 1 }),
        wishReward: () => call('POST', '/api/wish/reward'),
        towerLevel: (floor, ancient) => call('GET', `/api/tower/level?floor=${floor}&ancient=${ancient ? 1 : 0}`),
        towerInfo: () => call('GET', '/api/tower/info'),
        towerClear: (floor, ancient) => call('POST', '/api/tower/clear', { floor, ancient }),
        towerStart: (floor, ancient) => call('POST', '/api/tower/start', { floor, ancient: ancient ? 1 : 0 }),
        towerChoice: (run, choice) => call('POST', '/api/tower/choice', { run, choice }),
        towerFinish: (rewards, floor, ancient) => call('POST', '/api/tower/finish', { rewards, floor, ancient }),
        world: () => call('GET', '/api/world'),
        worldGather: () => call('POST', '/api/world/gather'),
        clans: () => call('GET', '/api/clans'),
        clanCreate: (name) => call('POST', '/api/clan/create', { name }),
        clanJoin: (id) => call('POST', '/api/clan/join', { id }),
        clanMine: () => call('GET', '/api/clan/mine'),
        chatGet: (since) => call('GET', '/api/chat?since=' + (since || 0)),
        chatSend: (text) => call('POST', '/api/chat/send', { text }),
        setNickname: (nickname) => call('POST', '/api/user/set-nickname', { nickname }),
        mails: () => call('GET', '/api/mail'),
        mailClaim: (id) => call('POST', '/api/mail/claim', { id }),
        free: () => call('POST', '/api/free'),
    };
})();