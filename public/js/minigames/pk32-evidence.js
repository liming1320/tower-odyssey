// PK32 原始迁移证据查看器：只展示只读提取结果，不把载荷存在等同于原版迁移完成。
(function () {
    'use strict';

    function add(parent, tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        parent.appendChild(node);
        return node;
    }

    function inspectPayload(payload) {
        const value = String(payload && payload.value || '');
        const width = Number(value.slice(0, 2));
        const height = Number(value.slice(2, 4));
        if (width >= 2 && width <= 40 && height >= 2 && height <= 40) {
            for (const cellWidth of [1, 2, 3]) {
                if (value.length === 4 + width * height * cellWidth) return { family: ['none', 'dimension-prefix-single-cell', 'dimension-prefix-paired-cell', 'dimension-prefix-triple-cell'][cellWidth], confidence: 'exact-structure', width, height, cellWidth };
            }
            for (const cellWidth of [1, 2, 3]) {
                const trailerLength = value.length - (4 + width * height * cellWidth);
                if (trailerLength > 0 && trailerLength <= 12) return { family: ['none', 'dimension-prefix-single-cell', 'dimension-prefix-paired-cell', 'dimension-prefix-triple-cell'][cellWidth] + '-with-trailer', confidence: 'exact-body-plus-trailer', width, height, cellWidth, trailerLength };
            }
        }
        const compactWidth = Number(value.slice(0, 1));
        const compactHeight = Number(value.slice(1, 2));
        if (compactWidth >= 2 && compactHeight >= 2 && value.length === 2 + compactWidth * compactHeight) return { family: 'compact-dimension-grid', confidence: 'exact-structure', width: compactWidth, height: compactHeight, cellWidth: 1 };
        return { family: 'unverified-numeric-structure', confidence: 'shape-only' };
    }

    function render(host, record, native) {
        host.innerHTML = '';
        const root = add(host, 'div', 'pk32-evidence');
        const summary = add(root, 'div', 'emu-note');
        add(summary, 'b', '', '原始迁移资料');
        add(summary, 'div', 'emu-tip', '这里只展示从 PK32 原程序提取的证据，不代表规则、美术或完整流程已经还原。');

        const facts = add(root, 'div', 'pk32-evidence-facts');
        const titleState = native && native.titleFound ? '已在原程序字符串区定位' : '尚未在原程序字符串区定位';
        add(facts, 'p', '', '原版名称：' + record.name + '（' + titleState + '）');
        add(facts, 'p', '', '迁移编号：' + record.id);
        if (record.migration && record.verification) {
            const migrationItems = [['素材', record.migration.assetsMigrated], ['关卡/回合', record.migration.levelsMigrated], ['规则', record.migration.rulesMigrated], ['完整流程', record.migration.fullFlowMigrated]];
            const verificationItems = [['素材', record.verification.assetsVerified], ['关卡/回合', record.verification.levelsVerified], ['规则', record.verification.rulesVerified], ['完整流程', record.verification.fullFlowVerified]];
            add(facts, 'p', '', '内容迁移：' + migrationItems.map(item => item[0] + (item[1] ? '已迁移' : '待迁移')).join('；'));
            add(facts, 'p', '', '原版验证：' + verificationItems.map(item => item[0] + (item[1] ? '已验证' : '待验证')).join('；'));
        }
        add(facts, 'p', '', native && native.levelCount != null
            ? '原版关卡/回合证据：' + native.levelCount + '（' + (native.levelCountBasis || '来源待补充') + '）'
            : '原版关卡/回合证据：待解码');
        add(facts, 'p', '', '原始数字载荷：' + (native ? native.payloadCount || 0 : 0) + ' 条');
        if (record.structured) {
            add(facts, 'p', '', '结构化解析：' + record.structured.decodedPayloadCount + ' 条；主结构族：' + record.structured.dominantFamily + '；游戏语义未验证。');
            add(facts, 'p', '', '原生代码引用：' + (record.structured.nativeUsageVerified ? '全部载荷已定位' : '仍有载荷待定位') + '；处理函数 ' + (record.structured.nativeHandlerRvas || []).length + ' 个；分发表 ' + (record.structured.nativeDispatcherIndexes || []).length + ' 个。');
            if (record.structured.catalogAssignmentConflict) add(facts, 'p', 'emu-tip', '归属警告：原生分发表跨越旧标题边界，当前名称归属仍待菜单/对象入口确认。');
        }
        if (native && native.payloadAssignment) {
            add(facts, 'p', '', '载荷归属置信度：' + native.payloadAssignment.confidence + '（' + native.payloadAssignment.method + '）');
            (native.payloadAssignment.warnings || []).forEach(warning => add(facts, 'p', 'emu-tip', '归属警告：' + warning));
        }
        add(facts, 'p', '', '当前阶段：原始证据已绑定；素材映射、状态规则和完整流程仍需验证。');

        const help = native && Array.isArray(native.help) ? native.help : [];
        add(root, 'h3', '', '原程序文本证据');
        if (!help.length) add(root, 'p', 'emu-tip', '当前分段没有提取到可归属的提示文本。');
        else {
            const list = add(root, 'ul', 'pk32-evidence-help');
            help.forEach(text => add(list, 'li', '', text));
        }

        const payloads = native && Array.isArray(native.nativePayloads) ? native.nativePayloads : [];
        add(root, 'h3', '', '完整原始载荷');
        if (!payloads.length) {
            add(root, 'p', 'emu-tip', '当前游戏没有识别出定长数字串；这不表示原版没有数据，数据也可能位于代码、资源或二进制结构中。');
            return;
        }

        const controls = add(root, 'div', 'emu-toolbar');
        const select = add(controls, 'select');
        select.setAttribute('aria-label', '选择原始载荷');
        payloads.forEach((payload, index) => {
            const option = document.createElement('option');
            option.value = String(index);
            const profile = inspectPayload(payload);
            const dimensions = profile.width && profile.height ? '，候选盘面 ' + profile.width + '×' + profile.height + '，单元宽度 ' + profile.cellWidth : '';
            option.textContent = '载荷 ' + (index + 1) + ' / ' + payloads.length + '，长度 ' + payload.length + '，偏移 ' + payload.offset + dimensions;
            select.appendChild(option);
        });
        const output = add(root, 'pre', 'pk32-evidence-payload');
        const profileText = add(root, 'p', 'emu-tip');
        function showPayload() {
            const payload = payloads[Number(select.value) || 0];
            output.textContent = payload && payload.value || '';
            const profile = inspectPayload(payload);
            profileText.textContent = profile
                ? '结构候选：' + profile.family + '；置信范围：' + profile.confidence + '；语义与规则未验证。'
                : '结构候选尚未生成；语义与规则未验证。';
        }
        select.onchange = showPayload;
        showPayload();
    }

    function start(host, record) {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        if (record && record.native) {
            render(host, record, record.native);
            return { destroy() { if (controller) controller.abort(); } };
        }
        host.innerHTML = '<div class="emu-note">正在读取原始迁移资料...</div>';
        fetch('/data/pk32-native-catalog.json', controller ? { signal: controller.signal } : undefined)
            .then(response => response.ok ? response.json() : Promise.reject(new Error('catalog unavailable')))
            .then(data => {
                const native = data && Array.isArray(data.records) ? data.records.find(row => row.id === record.id) : null;
                render(host, record, native);
            })
            .catch(error => {
                if (error && error.name === 'AbortError') return;
                host.innerHTML = '<div class="emu-note">原始迁移资料读取失败，未改变该游戏的迁移状态。</div>';
            });
        return { destroy() { if (controller) controller.abort(); } };
    }

    window.PK32Evidence = { start };
}());
