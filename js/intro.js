// js/intro.js — 標題畫面、故事、角色選擇

document.addEventListener('DOMContentLoaded', () => {
    const { CHARACTERS, STORY } = Game;
    let state = Game.load();

    const screens = {
        title: document.getElementById('title-screen'),
        story: document.getElementById('story-screen'),
        select: document.getElementById('select-screen')
    };
    function show(name) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[name].classList.add('active');
        window.scrollTo(0, 0);
    }

    // --- 標題畫面 ---
    const continueBtn = document.getElementById('continue-btn');
    const newGameBtn = document.getElementById('new-game-btn');
    Game.bindSoundToggle(document.getElementById('sound-btn'));

    if (state.character && CHARACTERS[state.character]) {
        const c = CHARACTERS[state.character];
        document.getElementById('continue-info').textContent = `（${c.name}・★${Game.totalStars(state)}）`;
        continueBtn.classList.remove('hidden');
        newGameBtn.textContent = '重新開始';
        newGameBtn.classList.replace('btn-primary', 'btn-ghost');
        continueBtn.focus();
    } else {
        newGameBtn.focus();
    }

    continueBtn.addEventListener('click', () => { Game.sfx('click'); Game.go('map_selection.html'); });
    newGameBtn.addEventListener('click', async () => {
        Game.sfx('click');
        if (state.character) {
            if (!await Game.confirmReset()) return;
            state = Game.reset();
        }
        startStory();
    });

    // --- 故事（打字機效果） ---
    const storyText = document.getElementById('story-text');
    const dots = document.getElementById('story-dots');
    dots.innerHTML = STORY.map(() => '<i></i>').join('');
    let line = -1;
    let typing = null;
    let typedFull = true;

    function typeLine() {
        const text = STORY[line];
        let i = 0;
        typedFull = false;
        storyText.innerHTML = '';
        const span = document.createElement('span');
        const caret = document.createElement('span');
        caret.className = 'caret';
        storyText.append(span, caret);
        [...dots.children].forEach((d, k) => d.classList.toggle('on', k <= line));
        clearInterval(typing);
        typing = setInterval(() => {
            span.textContent = text.slice(0, ++i);
            if (i >= text.length) { clearInterval(typing); typedFull = true; }
        }, 55);
    }

    function advance() {
        if (!typedFull) {
            // 正在打字時點擊：直接顯示整句
            clearInterval(typing);
            storyText.querySelector('span').textContent = STORY[line];
            typedFull = true;
            return;
        }
        Game.sfx('click');
        if (line + 1 >= STORY.length) { toSelect(); return; }
        line++;
        typeLine();
    }

    function startStory() {
        line = -1;
        show('story');
        advance();
    }

    function toSelect() {
        clearInterval(typing);
        show('select');
    }

    screens.story.addEventListener('click', e => { if (!e.target.closest('#skip-btn')) advance(); });
    document.getElementById('skip-btn').addEventListener('click', () => { Game.sfx('click'); toSelect(); });
    document.addEventListener('keydown', e => {
        if (!screens.story.classList.contains('active')) return;
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); advance(); }
        if (e.key === 'Escape') toSelect();
    });

    // --- 角色選擇 ---
    const grid = document.getElementById('char-grid');
    const confirmBtn = document.getElementById('confirm-btn');
    const pickedText = document.getElementById('picked-text');
    let picked = null;

    Object.values(CHARACTERS).forEach(c => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'char-card';
        card.setAttribute('role', 'radio');
        card.setAttribute('aria-checked', 'false');
        card.dataset.id = c.id;
        card.innerHTML = `
            <img class="portrait" src="${c.img}" alt="${c.name}" loading="lazy">
            <span class="check" aria-hidden="true">✓</span>
            <div class="char-info">
                <h3>${c.name}</h3>
                <p class="char-trait">${c.trait}</p>
                <span class="ability-tag">✦ ${c.ability}</span>
                <p class="ability-desc">${c.abilityDesc}</p>
            </div>`;
        card.addEventListener('click', () => pick(c.id));
        grid.appendChild(card);
    });

    function pick(id) {
        picked = id;
        Game.sfx('select');
        grid.querySelectorAll('.char-card').forEach(card => card.setAttribute('aria-checked', String(card.dataset.id === id)));
        pickedText.textContent = `已選擇：${CHARACTERS[id].name}`;
        confirmBtn.disabled = false;
    }

    // 方向鍵在角色間移動
    grid.addEventListener('keydown', e => {
        const cards = [...grid.querySelectorAll('.char-card')];
        const i = cards.indexOf(document.activeElement);
        if (i < 0) return;
        const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!delta) return;
        e.preventDefault();
        const next = cards[(i + delta + cards.length) % cards.length];
        next.focus();
        pick(next.dataset.id);
    });

    confirmBtn.addEventListener('click', () => {
        if (!picked) return;
        state = Game.load();
        state.character = picked;
        state.startedAt = state.startedAt || new Date().toISOString();
        Game.save(state);
        Game.sfx('unlock');
        Game.go('map_selection.html');
    });

    // 從地圖頁「更換夥伴」連過來時直接進角色選擇
    function openSelectFromHash() {
        if (location.hash !== '#select') return;
        if (state.character) pick(state.character);
        show('select');
    }
    openSelectFromHash();
    window.addEventListener('hashchange', openSelectFromHash);
});
