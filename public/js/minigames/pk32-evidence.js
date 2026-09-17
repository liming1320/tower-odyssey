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
            add(facts, 'p', '', '内容迁移状态：' + (record.migrationComplete ? '迁移完成' : '尚未完成'));
            add(facts, 'p', '', '原版验证状态：' + (record.verificationComplete ? '验证完成' : '尚未完成'));
        }
        if (record.migrationEvidence) {
            const evidenceItems = [
                ['证据页', record.migrationEvidence.catalogEvidenceAdapterBound],
                ['流程文本', record.migrationEvidence.flowContentBound],
                ['标题引用', record.migrationEvidence.titleReferenceBound],
                ['启动映射', record.migrationEvidence.launchEvidenceBound],
                ['帮助文本', record.migrationEvidence.helpTextEvidenceBound],
                ['共享 p-code 元数据', record.migrationEvidence.sharedPcodeMetadataBound],
                ['运行时方法表', record.migrationEvidence.sharedRuntimeMethodTableBound]
            ];
            add(facts, 'p', '', '证据适配：' + evidenceItems.map(item => item[0] + (item[1] ? '已绑定' : '待补')).join('；'));
            if (record.migrationEvidence.flowContentBound) add(facts, 'p', '', '流程文本迁移：标题 ' + (record.migrationEvidence.flowTitleOffsets || []).length + ' 条；帮助 ' + (record.migrationEvidence.flowHelpCount || 0) + ' 条。');
            if (record.migrationEvidence.sharedRuntimeMethodTableBound) add(facts, 'p', '', '运行时方法表：' + (record.migrationEvidence.runtimeMethodEntries || 0) + ' 项；已捕获目标区 ' + (record.migrationEvidence.runtimeMethodRegionTargets || 0) + ' 项。');
            if (record.migrationEvidence.runtimePcodeSlices) add(facts, 'p', 'emu-tip', '运行时代码探针：候选切片 ' + (record.migrationEvidence.runtimePcodeSlices || 0) + ' 段；可信切片 ' + (record.migrationEvidence.runtimePcodeTrustedSlices || 0) + ' 段；当前不作为规则迁移完成依据。');
            add(facts, 'p', '', '证据置信层：' + (record.migrationEvidence.evidenceConfidence || 'unknown'));
        }
        add(facts, 'p', '', native && native.levelCount != null
            ? '原版关卡/回合证据：' + native.levelCount + '（' + (native.levelCountBasis || '来源待补充') + '）'
            : '原版关卡/回合证据：待解码');
        add(facts, 'p', '', '原始数字载荷：' + (native ? native.payloadCount || 0 : 0) + ' 条');
        if (record.resources) {
            add(facts, 'p', '', '原始资源包：' + (record.resources.resourcePackageBound ? '已绑定' : '待绑定') + '；共享图集 ' + (record.resources.atlasIds || []).length + ' 张；结构化载荷 ' + (record.resources.structuredPayloadCount || 0) + ' 条。');
            if (!record.resources.gameSpecificAssetMapping) add(facts, 'p', 'emu-tip', '当前图集来自 PK32 共用宿主资源区，已纳入项目资源包，但具体精灵归属和动画帧仍未逐游戏确认。');
        }
        if (record.structured) {
            add(facts, 'p', '', '结构化解析：' + record.structured.decodedPayloadCount + ' 条；主结构族：' + record.structured.dominantFamily + '；游戏语义未验证。');
            add(facts, 'p', '', '原生代码引用：' + (record.structured.nativeUsageVerified ? '全部载荷已定位' : '仍有载荷待定位') + '；处理函数 ' + (record.structured.nativeHandlerRvas || []).length + ' 个；分发表 ' + (record.structured.nativeDispatcherIndexes || []).length + ' 个。');
            if (record.structured.catalogAssignmentConflict) add(facts, 'p', 'emu-tip', '归属警告：原生分发表跨越旧标题边界，当前名称归属仍待菜单/对象入口确认。');
        }
        if (native && native.payloadAssignment) {
            add(facts, 'p', '', '载荷归属置信度：' + native.payloadAssignment.confidence + '（' + native.payloadAssignment.method + '）');
            (native.payloadAssignment.warnings || []).forEach(warning => add(facts, 'p', 'emu-tip', '归属警告：' + warning));
        }
        add(facts, 'p', '', '总完成状态：' + (record.originalComplete ? '内容迁移与原版验证均已完成' : '仅在内容迁移和原版验证都完成后标记为原版完成'));

        const help = native && Array.isArray(native.help) ? native.help : [];
        add(root, 'h3', '', '原程序文本证据');
        const flowHost = add(root, 'div', 'pk32-evidence-flow');
        fetch('/data/pk32-flow-content.json')
            .then(response => response.ok ? response.json() : Promise.reject(new Error('flow content unavailable')))
            .then(data => {
                const flow = data && Array.isArray(data.records) ? data.records.find(row => row.id === record.id) : null;
                if (!flow) return;
                if (flow.titleTexts && flow.titleTexts.length) {
                    add(flowHost, 'p', '', '原程序标题：' + flow.titleTexts.join('；'));
                }
                if (flow.help && flow.help.length) {
                    const flowList = add(flowHost, 'ul', 'pk32-evidence-help');
                    flow.help.forEach(text => add(flowList, 'li', '', text));
                }
            })
            .catch(() => {});
        if (!help.length) add(root, 'p', 'emu-tip', '当前分段没有提取到可归属的提示文本。');
        else {
            const list = add(root, 'ul', 'pk32-evidence-help');
            help.forEach(text => add(list, 'li', '', text));
        }

        const payloads = native && Array.isArray(native.nativePayloads) ? native.nativePayloads : [];
        if (record.resources && Array.isArray(record.resources.atlasIds) && record.resources.atlasIds.length) {
            add(root, 'h3', '', '原始美术图集');
            const atlasGrid = add(root, 'div', 'pk32-evidence-atlas-grid');
            const manifestController = typeof AbortController === 'function' ? new AbortController() : null;
            fetch('/data/pk32-resource-manifest.json', manifestController ? { signal: manifestController.signal } : undefined)
                .then(response => response.ok ? response.json() : Promise.reject(new Error('manifest unavailable')))
                .then(manifest => {
                    const byId = new Map((manifest.atlases || []).map(atlas => [atlas.id, atlas]));
                    record.resources.atlasIds.forEach(id => {
                        const atlas = byId.get(id);
                        if (!atlas) return;
                        const figure = document.createElement('figure');
                        figure.className = 'pk32-evidence-atlas';
                        const image = document.createElement('img');
                        image.src = atlas.path;
                        image.alt = record.name + ' 原始共享图集 ' + atlas.id;
                        image.loading = 'lazy';
                        figure.appendChild(image);
                        const caption = document.createElement('figcaption');
                        caption.textContent = atlas.id + ' · ' + atlas.width + '×' + atlas.height;
                        figure.appendChild(caption);
                        atlasGrid.appendChild(figure);
                    });
                })
                .catch(() => {});
        }
        if (record.migrationEvidence && record.migrationEvidence.charGridCandidatesBound) {
            add(root, 'h3', '', '字符地图候选');
            const charGridHost = add(root, 'div', 'pk32-evidence-char-grids');
            fetch('/data/pk32-char-grid-candidates.json')
                .then(response => response.ok ? response.json() : Promise.reject(new Error('char grids unavailable')))
                .then(data => {
                    const group = (data.groups || []).find(item => item.sectionId === record.id);
                    if (!group || !group.records || !group.records.length) return;
                    const controls = add(charGridHost, 'div', 'emu-toolbar');
                    const select = add(controls, 'select');
                    select.setAttribute('aria-label', '选择字符地图候选');
                    group.records.forEach((item, index) => {
                        const option = document.createElement('option');
                        option.value = String(index);
                        option.textContent = '候选 ' + (index + 1) + ' / ' + group.records.length + '，长度 ' + item.sourceLength + '，偏移 ' + item.sourceOffset;
                        select.appendChild(option);
                    });
                    const preview = add(charGridHost, 'div', 'pk32-evidence-char-grid-preview');
                    const raw = add(charGridHost, 'pre', 'pk32-evidence-payload');
                    const note = add(charGridHost, 'p', 'emu-tip');
                    function color(symbol) {
                        return symbol === '0' ? '#0f172a' : symbol === 'X' ? '#64748b' : symbol === '?' ? '#f59e0b' : symbol === 'S' ? '#22c55e' : symbol === '+' ? '#38bdf8' : '#ef4444';
                    }
                    function draw() {
                        const item = group.records[Number(select.value) || 0];
                        const shape = item.shape || { width: 16, height: Math.ceil(item.value.length / 16) };
                        preview.innerHTML = '';
                        preview.style.display = 'grid';
                        preview.style.gridTemplateColumns = 'repeat(' + shape.width + ', minmax(12px, 1fr))';
                        item.value.split('').forEach(symbol => {
                            const cell = document.createElement('span');
                            cell.textContent = symbol === '0' ? '' : symbol;
                            cell.style.background = color(symbol);
                            cell.dataset.symbol = symbol;
                            preview.appendChild(cell);
                        });
                        raw.textContent = item.value;
                        note.textContent = '候选形状：' + shape.width + '×' + shape.height + '；归属和规则语义未验证。';
                    }
                    select.onchange = draw;
                    draw();
                })
                .catch(() => { charGridHost.textContent = '字符地图候选读取失败。'; });
        }
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
