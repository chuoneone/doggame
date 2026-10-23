// js/map_select.js — 校園地圖：關卡解鎖進度、地點介紹、結局

document.addEventListener('DOMContentLoaded', () => {
    const { STAGES, CHARACTERS } = Game;
    const state = Game.load();
    const character = CHARACTERS[state.character];

    if (!character) {
        window.location.replace('index.html');
        return;
    }

    // --- HUD ---
    document.getElementById('hud-avatar').src = character.img;
    document.getElementById('hud-avatar').alt = character.name;
    document.getElementById('hud-name').textContent = character.name;
    document.getElementById('hud-ability').textContent = `✦ ${character.ability}：${character.abilityDesc}`;
    document.getElementById('hud-jerky').textContent = state.jerky;
    document.getElementById('hud-stars').textContent = `${Game.totalStars(state)}/${STAGES.length * 3}`;
    Game.bindSoundToggle(document.getElementById('sound-btn'));

    const clearedCount = STAGES.filter(s => Game.isCleared(state, s.id)).length;
    const current = STAGES.find(s => Game.isUnlocked(state, s.id) && !Game.isCleared(state, s.id));

    // --- 任務橫幅 ---
    const questTitle = document.getElementById('quest-title');
    const questDesc = document.getElementById('quest-desc');
    if (current) {
        questTitle.textContent = `下一站：${current.icon} ${current.name}`;
        questDesc.textContent = current.final
            ? '五個地點的謎題都解開了！地下室的封印鬆動了……'
            : `挑戰「${current.topic}」，答對 60% 以上就能通過，解鎖下一個地點。`;
    } else {
        document.getElementById('quest-icon').textContent = '🏆';
        questTitle.textContent = '冒險完成！校園恢復了和平';
        questDesc.innerHTML = '';
        const link = document.createElement('button');
        link.className = 'btn btn-sm btn-ghost';
        link.textContent = '查看獎狀';
        link.addEventListener('click', showCertificate);
        questDesc.append('試著把每一關都拿到三顆星吧！ ', link);
    }
    document.getElementById('progress-text').textContent = `探索進度 ${clearedCount} / ${STAGES.length}`;
    requestAnimationFrame(() => {
        document.getElementById('progress-bar').style.width = `${clearedCount / STAGES.length * 100}%`;
    });

    // --- 地圖上的路線與地點 ---
    const frame = document.getElementById('map-frame');
    const route = document.getElementById('route');
    for (let i = 1; i < STAGES.length; i++) {
        const [x1, y1] = STAGES[i - 1].pos;
        const [x2, y2] = STAGES[i].pos;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const mx = (x1 + x2) / 2 * 1.5, my = (y1 + y2) / 2 - 6;
        path.setAttribute('d', `M${x1 * 1.5},${y1} Q${mx},${my} ${x2 * 1.5},${y2}`);
        if (Game.isCleared(state, STAGES[i - 1].id)) path.classList.add('done');
        route.appendChild(path);
    }

    const list = document.getElementById('stage-list');
    STAGES.forEach((stage, i) => {
        const unlocked = Game.isUnlocked(state, stage.id);
        const record = state.stages[stage.id];
        const stars = (record && record.stars) || 0;
        const status = !unlocked ? 'locked' : (record && record.cleared ? 'cleared' : '');

        const pin = document.createElement('button');
        pin.type = 'button';
        pin.className = `pin ${status} ${stage === current ? 'current' : ''}`;
        pin.style.left = `${stage.pos[0]}%`;
        pin.style.top = `${stage.pos[1]}%`;
        pin.setAttribute('aria-label', `${stage.name}${unlocked ? '' : '（未解鎖）'}，${stars} 顆星`);
        pin.innerHTML = `
            ${stage === current ? `<img class="you" src="${character.img}" alt="">` : ''}
            <span class="pin-badge" aria-hidden="true">${unlocked ? stage.icon : '🔒'}</span>
            <span class="pin-label">${stage.name}</span>
            ${record && record.cleared ? `<span class="pin-stars">${Game.starText(stars)}</span>` : ''}`;
        pin.addEventListener('click', () => openStage(stage));
        frame.appendChild(pin);

        const item = document.createElement('button');
        item.type = 'button';
        item.className = `stage-item ${status} ${stage === current ? 'current' : ''}`;
        item.innerHTML = `
            <span class="num" aria-hidden="true">${unlocked ? stage.icon : '🔒'}</span>
            <span><strong>${i + 1}. ${stage.name}</strong><small>${stage.topic}</small></span>
            <span class="s">${unlocked ? Game.starText(stars) : '未解鎖'}</span>`;
        item.addEventListener('click', () => openStage(stage));
        list.appendChild(item);
    });

    // --- 地點介紹 ---
    async function openStage(stage) {
        Game.sfx('click');
        if (!Game.isUnlocked(state, stage.id)) {
            const prev = STAGES[Game.stageIndex(stage.id) - 1];
            await Game.dialog({
                icon: '🔒', title: `${stage.name}還沒開放`,
                body: stage.final ? '要先通過前面五個地點的挑戰，地下室的封印才會解開。' : `先通過「${prev.name}」的挑戰，才能前往這裡。`
            });
            return;
        }
        const record = state.stages[stage.id];
        const body = document.createElement('div');
        body.innerHTML = `<img class="stage-dialog-art" src="${stage.bg}" alt="">`;
        const intro = document.createElement('p');
        intro.style.margin = '0';
        intro.textContent = stage.intro;
        const meta = document.createElement('div');
        meta.className = 'stage-meta';
        meta.innerHTML = `<span>📐 ${stage.topic}</span><span>📝 ${stage.count} 題</span>` +
            (record ? `<span>🏅 最佳 ${record.best}/${record.total}・${Game.starText(record.stars || 0)}</span>` : '<span>✨ 首次挑戰</span>');
        body.append(intro, meta);

        const go = await Game.dialog({
            title: `${stage.icon} ${stage.name}`, body,
            actions: [{ label: '再想想', value: false }, { label: record ? '再次挑戰' : '出發！', value: true, primary: true }]
        });
        if (go) Game.go(`quiz.html?map=${stage.id}`);
    }

    // --- 選單 ---
    document.getElementById('menu-btn').addEventListener('click', async () => {
        Game.sfx('click');
        const choice = await Game.dialog({
            icon: '⚙️', title: '選單',
            body: '更換夥伴會保留目前的冒險進度。',
            actions: [
                { label: '更換夥伴', value: 'switch' },
                { label: '回標題畫面', value: 'title' },
                { label: '重新開始', value: 'reset', danger: true }
            ]
        });
        if (choice === 'switch') Game.go('index.html#select');
        if (choice === 'title') Game.go('index.html');
        if (choice === 'reset' && await Game.confirmReset()) {
            Game.reset();
            Game.go('index.html');
        }
    });

    // --- 剛解鎖新地點的提示 ---
    const justUnlocked = new URLSearchParams(location.search).get('unlocked');
    const unlockedStage = STAGES.find(s => s.id === justUnlocked);
    if (unlockedStage && Game.isUnlocked(state, unlockedStage.id)) {
        setTimeout(() => { Game.sfx('unlock'); Game.toast(`🔓 新地點解鎖：${unlockedStage.icon} ${unlockedStage.name}`, 3200); }, 400);
        history.replaceState(null, '', location.pathname);
    }

    // --- 結局與獎狀 ---
    function showCertificate() {
        const s = Game.load();
        const cert = document.createElement('div');
        cert.className = 'certificate';
        const date = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
        cert.innerHTML = `
            <h2>獎狀</h2>
            <img src="${character.img}" alt="${character.name}">
            <p>茲證明冒險夥伴</p>
            <p class="big">${character.name}</p>
            <p>解開狗子學校全部 ${STAGES.length} 個地點的數學謎題，</p>
            <p>共獲得 <b>${Game.totalStars(s)}</b> 顆星、<b>${s.jerky}</b> 個肉乾，</p>
            <p>讓光芒重新回到校園，特頒此狀，以資鼓勵。</p>
            <p class="date">${date}</p>`;
        Game.dialog({
            title: '🏆 校園英雄', body: cert,
            actions: [{ label: '列印獎狀', value: 'print' }, { label: '太棒了！', value: true, primary: true }]
        }).then(v => { if (v === 'print') window.print(); });
    }

    async function playEnding() {
        Game.sfx('win');
        for (let i = 0; i < Game.ENDING.length; i++) {
            const last = i === Game.ENDING.length - 1;
            await Game.dialog({
                icon: ['📦', '🕰️', '💡', '🏆'][i] || '✨', title: last ? '冒險完成！' : '終章',
                body: Game.ENDING[i],
                actions: [{ label: last ? '領取獎狀' : '繼續', value: true, primary: true }]
            });
        }
        state.endingSeen = true;
        Game.save(state);
        showCertificate();
    }

    if (Game.isCleared(state, 'basement') && !state.endingSeen) setTimeout(playEnding, 500);
});
