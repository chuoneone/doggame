// js/core.js — 全遊戲共用：角色/關卡設定、存檔、音效、語音朗讀、對話框
(() => {
    const SAVE_KEY = 'doggame.v2';

    // --- 角色：每隻狗都有真正會影響遊戲的能力 ---
    const CHARACTERS = {
        sheepdog: {
            id: 'sheepdog', name: '牧羊犬', img: 'images/sheepdog.webp',
            trait: '聰明絕頂，善於解決謎題',
            ability: '智慧之眼', abilityDesc: '每關可免費使用 1 次「刪去兩個錯誤選項」。'
        },
        shiba: {
            id: 'shiba', name: '柴犬', img: 'images/shiba.webp',
            trait: '敏捷迅速，擅長追蹤',
            ability: '連擊衝刺', abilityDesc: '連續答對 3 題以上，每題額外多拿 1 個肉乾。'
        },
        mix: {
            id: 'mix', name: '米克斯', img: 'images/mix.webp',
            trait: '適應力強，充滿驚喜',
            ability: '幸運驚喜', abilityDesc: '每次答對有 35% 機率獲得雙倍肉乾。'
        },
        bulldog: {
            id: 'bulldog', name: '鬥牛犬', img: 'images/bulldog.webp',
            trait: '力大無窮，勇往直前',
            ability: '永不放棄', abilityDesc: '每關有 1 次答錯後重新作答的機會。'
        }
    };

    // --- 關卡：依序解鎖，地下室需要前五關全部通過 ---
    // pos 為地圖上的百分比座標（對應 images/map.webp 上的建築）
    // 題目範圍：康軒版 七上 第二章「分數的運算」
    const STAGES = [
        { id: 'gate', name: '校門口', icon: '🏫', topic: '2-1 因數與倍數', bg: 'images/map.webp', pos: [10, 21], count: 6,
          intro: '校門被陰影鎖住了！門上刻著倍數判別的密碼——2、3、4、5、9、11 的倍數，還有質數與合數。' },
        { id: 'library', name: '圖書館', icon: '📚', topic: '2-1 質因數分解', bg: 'images/library.webp', pos: [68, 25], count: 6,
          intro: '書架上的書被拆成一頁一頁的質數。用短除法把它們拼回標準分解式，才能找到線索！' },
        { id: 'playground', name: '操場', icon: '🏃', topic: '2-2 最大公因數與最小公倍數', bg: 'images/ground.webp', pos: [16, 52], count: 6,
          intro: '跑道上的選手什麼時候會再相遇？蘋果要怎麼平分？用 (a, b) 和 [a, b] 解開操場的謎題。' },
        { id: 'lab', name: '實驗室', icon: '🧪', topic: '2-3 分數的加減', bg: 'images/lab.webp', pos: [66, 62], count: 6,
          intro: '藥水的份量都是分數！約分、擴分、通分、比大小，調錯比例可是會冒泡泡的……' },
        { id: 'forest', name: '後山林道', icon: '🌳', topic: '2-4 分數的乘除與四則運算', bg: 'images/forest_path.webp', pos: [37, 84], count: 6,
          intro: '林道的石碑上寫滿分數算式。記得倒數、正負號，還有「先乘除後加減」，才不會迷路。' },
        { id: 'basement', name: '地下室', icon: '🗝️', topic: '2-5 指數律・段考模擬', bg: 'images/basement_dark.webp', pos: [76, 84], count: 8,
          intro: '黑盒子就在這裡！最後的考驗是指數律，加上整個第二章的綜合題——就當作段考前的模擬考吧！', final: true }
    ];

    const STORY = [
        '有一天，一道神秘的陰影籠罩了狗子學校……',
        '時鐘停擺、書頁空白，連操場上的跑道都消失了。',
        '傳說只有解開散落在校園各處的數學謎題，才能讓光芒重新回到學校。',
        '勇敢的狗狗們決定挺身而出——現在，選一位夥伴，和牠一起出發吧！'
    ];

    const ENDING = [
        '黑盒子「喀」的一聲打開了，一道溫暖的光衝出地下室。',
        '時鐘重新滴答作響，書頁上的文字一個個回來了。',
        '原來，陰影是被遺忘的知識所化成的——只要願意學習，它就再也不會出現。',
        '狗子學校恢復了和平，而你，就是這次冒險的英雄！'
    ];

    // --- 存檔 ---
    function defaultState() {
        return { v: 2, character: null, jerky: 0, stages: {}, history: [], settings: { sound: true, tts: true }, endingSeen: false, startedAt: null };
    }

    function migrateLegacy() {
        // 把舊版（v1）的 localStorage 資料搬過來，避免玩家進度消失
        const state = defaultState();
        try {
            const oldChar = JSON.parse(localStorage.getItem('selectedCharacter') || 'null');
            if (oldChar && CHARACTERS[oldChar.id]) state.character = oldChar.id;
            state.jerky = parseInt(localStorage.getItem('meatJerkyCount'), 10) || 0;
            const oldHistory = JSON.parse(localStorage.getItem('answersHistory') || '[]');
            if (Array.isArray(oldHistory)) {
                state.history = oldHistory.map(r => ({
                    stage: (STAGES.find(s => s.name === r.location) || {}).id || '',
                    question: r.question, userAnswer: r.userAnswer, correctAnswer: r.correctAnswer,
                    correct: !!r.isCorrect, time: r.timestamp
                }));
            }
            ['selectedCharacter', 'meatJerkyCount', 'basementUnlocked', 'answersHistory'].forEach(k => localStorage.removeItem(k));
        } catch (e) { /* 舊資料損毀就從頭開始 */ }
        return state;
    }

    function load() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (raw) return Object.assign(defaultState(), JSON.parse(raw));
            if (localStorage.getItem('selectedCharacter') || localStorage.getItem('meatJerkyCount')) {
                const migrated = migrateLegacy();
                save(migrated);
                return migrated;
            }
        } catch (e) { /* 無痕模式或資料損毀 */ }
        return defaultState();
    }

    function save(state) {
        try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* 無法儲存時仍可遊玩 */ }
    }

    function reset() {
        const settings = load().settings;
        const fresh = defaultState();
        fresh.settings = settings;
        save(fresh);
        return fresh;
    }

    function stageIndex(id) { return STAGES.findIndex(s => s.id === id); }

    function isCleared(state, id) { return !!(state.stages[id] && state.stages[id].cleared); }

    function isUnlocked(state, id) {
        const i = stageIndex(id);
        if (i <= 0) return true;
        if (STAGES[i].final) return STAGES.filter(s => !s.final).every(s => isCleared(state, s.id));
        return isCleared(state, STAGES[i - 1].id);
    }

    function totalStars(state) {
        return STAGES.reduce((sum, s) => sum + ((state.stages[s.id] && state.stages[s.id].stars) || 0), 0);
    }

    function starsFor(score, total) {
        const r = score / total;
        if (r >= 1) return 3;
        if (r >= 0.8) return 2;
        if (r >= 0.6) return 1;
        return 0;
    }

    // --- 音效（Web Audio 即時合成，不需額外音檔） ---
    let audioCtx = null;
    function tone(freq, start, dur, type = 'sine', gain = 0.18) {
        const ctx = audioCtx;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
        osc.connect(g).connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.05);
    }
    const SOUNDS = {
        click: () => tone(660, 0, 0.06, 'triangle', 0.08),
        select: () => tone(520, 0, 0.08, 'triangle', 0.1),
        correct: () => { tone(660, 0, 0.12, 'triangle'); tone(880, 0.1, 0.12, 'triangle'); tone(1320, 0.2, 0.22, 'triangle'); },
        wrong: () => { tone(220, 0, 0.18, 'sawtooth', 0.08); tone(165, 0.15, 0.28, 'sawtooth', 0.08); },
        coin: () => { tone(988, 0, 0.08, 'square', 0.06); tone(1319, 0.07, 0.2, 'square', 0.06); },
        win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.15)),
        unlock: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.35, 'sine', 0.15)),
        magic: () => [1200, 900, 1500, 1100].forEach((f, i) => tone(f, i * 0.05, 0.12, 'sine', 0.08)),
        door: () => { tone(110, 0, 0.5, 'sawtooth', 0.05); tone(82, 0.15, 0.6, 'triangle', 0.1); tone(523, 0.45, 0.6, 'sine', 0.06); tone(784, 0.6, 0.7, 'sine', 0.05); }
    };
    function sfx(name) {
        if (!load().settings.sound || !SOUNDS[name]) return;
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            SOUNDS[name]();
        } catch (e) { /* 不支援音效就靜音 */ }
    }

    // --- 語音朗讀（特教／低年級友善：把數學符號念成中文） ---
    function toSpeech(text) {
        return text
            .replace(/(\d+)\{([^{}/]+)\/([^{}]+)\}/g, '$1又$3分之$2')
            .replace(/\{([^{}/]+)\/([^{}]+)\}/g, '$2分之$1')
            .replace(/\[(\w+(?:, \w+)+)\]/g, (m, list) => `${list.split(', ').join('和')}的最小公倍數`)
            .replace(/\((\w+), (\w+)\)/g, '$1和$2的最大公因數')
            .replace(/\^2(?!\d)/g, '的平方')
            .replace(/\^(\d+|\w)/g, '的$1次方')
            .replace(/\^\(([^)]*)\)/g, '的($1)次方')
            .replace(/□/g, '空格')
            .replace(/√(\d+)/g, '根號$1')
            .replace(/(\w)²/g, '$1的平方')
            .replace(/(\w)⁵/g, '$1的5次方')
            .replace(/π/g, '派')
            .replace(/×/g, '乘以').replace(/÷/g, '除以')
            .replace(/\s[-−]\s/g, '減').replace(/\s\+\s/g, '加')
            .replace(/(^|[(\s:：,，=|])[-−](\d)/g, '$1負$2')
            .replace(/≤/g, '小於或等於').replace(/≥/g, '大於或等於')
            .replace(/>/g, '大於').replace(/</g, '小於')
            .replace(/=/g, '等於')
            .replace(/(\d+)\/(\d+)/g, '$2分之$1')
            .replace(/\|([^|]+)\|/g, '$1的絕對值')
            .replace(/[？?]/g, '？');
    }
    let zhVoice = null;
    function pickVoice() {
        if (!('speechSynthesis' in window)) return;
        const voices = speechSynthesis.getVoices();
        zhVoice = voices.find(v => /zh[-_]TW/i.test(v.lang)) || voices.find(v => /^zh/i.test(v.lang)) || null;
    }
    if ('speechSynthesis' in window) {
        pickVoice();
        speechSynthesis.onvoiceschanged = pickVoice;
    }
    function speak(text) {
        if (!('speechSynthesis' in window)) return false;
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(toSpeech(text));
        u.lang = 'zh-TW';
        if (zhVoice) u.voice = zhVoice;
        u.rate = 0.9;
        speechSynthesis.speak(u);
        return true;
    }
    function stopSpeaking() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }

    // --- 自訂對話框（取代 alert / confirm） ---
    function dialog({ title, body, icon = '', actions = [{ label: '好', value: true, primary: true }] }) {
        return new Promise(resolve => {
            const prevFocus = document.activeElement;
            const overlay = document.createElement('div');
            overlay.className = 'dialog-overlay';
            overlay.innerHTML = `
                <div class="dialog panel" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
                    ${icon ? `<div class="dialog-icon" aria-hidden="true">${icon}</div>` : ''}
                    <h2 id="dlg-title"></h2>
                    <div class="dialog-body"></div>
                    <div class="dialog-actions"></div>
                </div>`;
            overlay.querySelector('#dlg-title').textContent = title;
            const bodyEl = overlay.querySelector('.dialog-body');
            if (body instanceof Node) {
                bodyEl.appendChild(body);
            } else {
                bodyEl.classList.add('plain');
                bodyEl.textContent = body || '';
            }
            const actionsEl = overlay.querySelector('.dialog-actions');
            const close = value => {
                overlay.classList.add('closing');
                document.removeEventListener('keydown', onKey);
                setTimeout(() => overlay.remove(), 180);
                if (prevFocus && prevFocus.focus) prevFocus.focus();
                resolve(value);
            };
            actions.forEach(a => {
                const b = document.createElement('button');
                b.className = 'btn ' + (a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : 'btn-ghost');
                b.textContent = a.label;
                b.addEventListener('click', () => { sfx('click'); close(a.value); });
                actionsEl.appendChild(b);
            });
            const onKey = e => { if (e.key === 'Escape') close(null); };
            document.addEventListener('keydown', onKey);
            overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
            document.body.appendChild(overlay);
            (actionsEl.querySelector('.btn-primary') || actionsEl.querySelector('button')).focus();
        });
    }

    function confirmReset() {
        return dialog({
            icon: '⚠️', title: '確定要重新開始嗎？',
            body: '角色、肉乾、星星、關卡進度與答題紀錄都會被清除，而且無法復原。',
            actions: [{ label: '取消', value: false }, { label: '清除並重新開始', value: true, danger: true }]
        });
    }

    function toast(msg, ms = 2200) {
        let wrap = document.querySelector('.toast-wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'toast-wrap';
            wrap.setAttribute('aria-live', 'polite');
            document.body.appendChild(wrap);
        }
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        wrap.appendChild(t);
        setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
    }

    // 換頁時淡出，讓轉場不突兀
    function go(url) {
        document.body.classList.add('page-leave');
        setTimeout(() => { window.location.href = url; }, 220);
    }

    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // --- 數學排版：{a/b} 分數、^n 次方、負號 ---
    function escapeHTML(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function mathHTML(text) {
        return escapeHTML(text)
            .replace(/\{([^{}/]+)\/([^{}]+)\}/g, '<span class="frac"><span>$1</span><span>$2</span></span>')
            .replace(/\^(\d+|\w|\([^)]*\))/g, (m, p) => `<sup>${p.replace(/^\((.*)\)$/, '$1')}</sup>`)
            .replace(/-/g, '−');
    }
    function mathPlain(text) {
        return String(text)
            .replace(/(\d+)\{([^{}/]+)\/([^{}]+)\}/g, '$1又$2/$3')
            .replace(/\{([^{}/]+)\/([^{}]+)\}/g, '$1/$2');
    }

    function starText(n, max = 3) { return '★'.repeat(n) + '☆'.repeat(max - n); }

    // 音效開關按鈕（各頁共用）
    function bindSoundToggle(btn) {
        if (!btn) return;
        const render = () => {
            const on = load().settings.sound;
            btn.textContent = on ? '🔊' : '🔇';
            btn.setAttribute('aria-label', on ? '關閉音效' : '開啟音效');
            btn.title = on ? '音效：開' : '音效：關';
        };
        btn.addEventListener('click', () => {
            const s = load();
            s.settings.sound = !s.settings.sound;
            save(s);
            render();
            sfx('click');
        });
        render();
    }

    window.Game = {
        CHARACTERS, STAGES, STORY, ENDING,
        load, save, reset, isUnlocked, isCleared, totalStars, starsFor, stageIndex,
        sfx, speak, stopSpeaking, dialog, confirmReset, toast, go, shuffle, starText, bindSoundToggle,
        mathHTML, mathPlain, escapeHTML
    };
})();
