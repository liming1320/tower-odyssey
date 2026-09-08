// 聊天
const ChatView = {
    lastSince: 0,
    timer: null,
    open(app) {
        U.openModal(`
            <h3>世界聊天</h3>
            <div class="chat-list" id="chat-list"></div>
            <div class="chat-input">
                <input id="chat-input" placeholder="说点什么... (最多 100 字)" maxlength="100">
                <button class="btn" id="chat-send">发送</button>
            </div>
        `);
        this.lastSince = 0;
        this.fetch();
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => this.fetch(), 3000);
        document.querySelector('#chat-send').onclick = () => this.send();
        document.querySelector('#chat-input').addEventListener('keydown', e => {
            if (e.key === 'Enter') this.send();
        });
    },
    async fetch() {
        try {
            const r = await API.chatGet(this.lastSince);
            this.lastSince = r.now;
            const list = document.querySelector('#chat-list');
            if (!list) return;
            if (r.messages && r.messages.length) {
                r.messages.forEach(m => {
                    const cls = m.isAdmin ? 'u admin' : 'u';
                    list.appendChild(U.el(`<div class="chat-msg"><span class="${cls}">${m.user}：</span>${m.text}<span class="time">${new Date(m.time).toLocaleTimeString()}</span></div>`));
                });
                list.scrollTop = list.scrollHeight;
            }
        } catch (e) {}
    },
    async send() {
        const inp = document.querySelector('#chat-input');
        const t = inp.value.trim();
        if (!t) return;
        try {
            await API.chatSend(t);
            inp.value = '';
            this.fetch();
        } catch (e) { U.toast(e.message); }
    },
    close() {
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        U.closeModal();
    }
};