// js/quiz_logic.js — 第一人稱 3D 答題房間：黑板出題、石碑選答、推開大門走進下一題

document.addEventListener('DOMContentLoaded', () => {
    const { STAGES, CHARACTERS } = Game;
    let state = Game.load();
    const character = CHARACTERS[state.character];
    const stageId = new URLSearchParams(location.search).get('map');
    const stage = STAGES.find(s => s.id === stageId);

    if (!character) { window.location.replace('index.html'); return; }
    if (!stage || !Game.isUnlocked(state, stage.id) || !QUIZ_BANK[stage.id]) {
        window.location.replace('map_selection.html');
        return;
    }

    const $ = id => document.getElementById(id);
    const els = {
        stage3d: $('stage3d'), world: $('world'), board: $('board'), boardContent: $('board-content'),
        qText: $('q-text'), qNum: $('q-num'), hintText: $('hint-text'), tablets: $('tablets'), fader: $('fader'),
        steps: $('steps'), feedback: $('feedback'), submit: $('submit-btn'), next: $('next-btn'),
        hintBtn: $('hint-btn'), abilityBtn: $('ability-btn'), readBtn: $('read-btn'), autoReadBtn: $('auto-read-btn'),
        jerky: $('hud-jerky'), jerkyChip: $('jerky-chip'), streak: $('hud-streak'), streakChip: $('streak-chip')
    };
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- 頁面初始化 ---
    document.title = `${stage.name} - 狗子冒險之旅`;
    $('stage-title').textContent = `${stage.icon} ${stage.name}`;
    $('stage-topic').textContent = stage.topic;
    document.documentElement.style.setProperty('--wall-img', `url('${new URL(stage.bg, location.href).href}')`);
    document.body.dataset.stage = stage.id;
    Game.bindSoundToggle($('sound-btn'));

    // --- 本次挑戰的題目：隨機抽題、選項打亂 ---
    const questions = Game.shuffle(QUIZ_BANK[stage.id]).slice(0, stage.count).map(item => {
        const options = Game.shuffle(item.a.map((text, i) => ({ text, correct: i === 0 })));
        return { ...item, options, answer: options.findIndex(o => o.correct) };
    });

    const run = {
        index: 0, score: 0, streak: 0, bestStreak: 0, jerkyGained: 0,
        results: [], wrong: [],
        selected: null, answered: false, busy: true,
        abilityUsed: false        // 牧羊犬 / 鬥牛犬：每關一次
    };

    els.steps.innerHTML = questions.map(() => '<i></i>').join('');
    if (character.id === 'sheepdog') els.abilityBtn.classList.remove('hidden');
    renderHud();

    function renderHud() {
        els.jerky.textContent = state.jerky;
        els.streak.textContent = run.streak;
        els.streakChip.style.opacity = run.streak > 0 ? 1 : .5;
    }
    function bump(el) {
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
    }

    // =========================================================
    // 3D 場景：用螢幕座標排版，再換算成真實深度，確保手機上字夠大
    // =========================================================
    let G = null;
    const tabletEls = [];

    for (let i = 0; i < 4; i++) {
        const t = document.createElement('button');
        t.type = 'button';
        t.className = 'tablet';
        t.innerHTML = '<span class="t-top"></span><span class="t-shadow"></span><span class="t-face"><span class="t-key"></span><span class="t-text"></span></span>';
        t.querySelector('.t-key').textContent = 'ABCD'[i];
        t.addEventListener('click', () => {
            if (run.selected === i && !run.answered) submit(); else select(i);
        });
        els.tablets.appendChild(t);
        tabletEls.push(t);
    }

    function layout() {
        const W = els.stage3d.clientWidth;
        const H = els.stage3d.clientHeight;
        const hudBottom = document.querySelector('.quiz-hud').getBoundingClientRect().bottom;
        const barTop = $('quiz-bar').getBoundingClientRect().top;
        const portrait = W / H < 0.95;
        const S = Math.min(W, H);

        const wallTop = hudBottom + H * 0.015;
        const wallBottom = portrait ? H * 0.5 : H * 0.54;
        const ox = W / 2;
        const oy = (wallTop + wallBottom) / 2;
        const P = Math.max(W, H) * 0.85;
        const zBack = -1.15 * P;
        const sBack = P / (P - zBack);
        const fy = (wallBottom - oy) / sBack;
        const ceilY = (wallTop - oy) / sBack;
        const zNear = P * 0.8;

        els.stage3d.style.perspective = `${P}px`;
        els.stage3d.style.perspectiveOrigin = `${ox}px ${oy}px`;
        els.world.style.left = `${ox}px`;
        els.world.style.top = `${oy}px`;
        els.world.style.transformOrigin = `0 0 ${P}px`;

        const toReal = (sx, sy, s) => [(sx - ox) / s, (sy - oy) / s];
        const scaleAt = z => P / (P - z);

        // 房間：後牆、地板、天花板、左右牆
        const [X0] = toReal(W * 0.03, 0, sBack);
        const [X1] = toReal(W * 0.97, 0, sBack);
        const RW = X1 - X0, RH = fy - ceilY, L = zNear - zBack;
        const setFace = (id, w, h, transform) => {
            const el = $(id);
            el.style.width = `${w}px`;
            el.style.height = `${h}px`;
            el.style.transform = transform;
        };
        setFace('wall-back', RW, RH, `translate3d(${X0}px, ${ceilY}px, ${zBack}px)`);
        setFace('floor', RW, L, `translate3d(${X0}px, ${fy}px, ${zBack}px) rotateX(90deg)`);
        setFace('ceiling', RW, L, `translate3d(${X0}px, ${ceilY}px, ${zBack}px) rotateX(90deg)`);
        setFace('wall-left', L, RH, `translate3d(${X0}px, ${ceilY}px, ${zBack}px) rotateY(-90deg)`);
        setFace('wall-right', L, RH, `translate3d(${X1}px, ${ceilY}px, ${zBack}px) rotateY(-90deg)`);

        // 用螢幕上的矩形與深度擺放物件
        const place = (el, x, y, w, h, z, extra = '') => {
            const s = scaleAt(z);
            const [rx, ry] = toReal(x, y, s);
            el.style.width = `${w / s}px`;
            el.style.height = `${h / s}px`;
            el.style.setProperty('--base', `translate3d(${rx}px, ${ry}px, ${z}px)${extra}`);
            return s;
        };

        // 黑板（也是通往下一題的雙開門）與門後的光
        const bx = W * 0.08, bw = W * 0.84, by = wallTop + H * 0.02, bh = wallBottom - by - H * 0.03;
        const sb = place(els.board, bx, by, bw, bh, zBack + 2);
        place($('portal'), bx, by, bw, bh, zBack + 1);
        const boardFont = Math.min(30, Math.max(19, S * 0.058));
        els.board.style.setProperty('--fs', `${boardFont / sb}px`);

        // 石碑：直式手機 2×2，橫式／平板一排 4 個
        const regionTop = wallBottom + H * 0.025;
        const regionBottom = barTop - H * 0.02;
        const regionH = regionBottom - regionTop;
        const slots = portrait
            ? [
                { cx: W * 0.27, bottom: regionTop + regionH * 0.47, w: W * 0.42, h: regionH * 0.42 },
                { cx: W * 0.73, bottom: regionTop + regionH * 0.47, w: W * 0.42, h: regionH * 0.42 },
                { cx: W * 0.26, bottom: regionBottom, w: W * 0.45, h: regionH * 0.46 },
                { cx: W * 0.74, bottom: regionBottom, w: W * 0.45, h: regionH * 0.46 }
            ]
            : [0, 1, 2, 3].map(i => ({ cx: W * (0.5 + (i - 1.5) * 0.235), bottom: regionBottom, w: W * 0.21, h: Math.min(regionH * 0.8, W * 0.16) }));
        const tabletFont = Math.min(28, Math.max(18, S * 0.058));
        slots.forEach((slot, i) => {
            // 石碑立在地板上：由底部的螢幕高度反推深度
            const s = (slot.bottom - oy) / fy;
            const z = P - P / s;
            place(tabletEls[i], slot.cx - slot.w / 2, slot.bottom - slot.h, slot.w, slot.h, z);
            tabletEls[i].style.setProperty('--fs', `${tabletFont / s}px`);
            tabletEls[i].style.setProperty('--depth', `${(slot.w / s) * 0.1}px`);
            tabletEls[i].dataset.cx = (slot.cx - ox) / W;
        });

        G = { W, H, P, zBack };
    }

    // --- 攝影機：待機微晃、拖曳／傾斜環顧、走路 ---
    const cam = { z: 0, bob: 0, lean: 0, leanTarget: 0, lookX: 0, lookY: 0, lookTX: 0, lookTY: 0 };
    let tiltBase = null;

    function frame(t) {
        cam.lean += (cam.leanTarget - cam.lean) * 0.06;
        cam.lookX += (cam.lookTX - cam.lookX) * 0.08;
        cam.lookY += (cam.lookTY - cam.lookY) * 0.08;
        const idle = reduceMotion ? 0 : 1;
        const yaw = Math.sin(t / 2300) * 0.9 * idle + cam.lean + cam.lookX;
        const pitch = Math.sin(t / 1700) * 0.45 * idle + cam.lookY;
        els.world.style.transform = `translate3d(0, ${cam.bob}px, ${cam.z}px) rotateX(${pitch}deg) rotateY(${yaw}deg)`;
        requestAnimationFrame(frame);
    }

    function walk(from, to, ms, { bob = 7, ease = 'inOut' } = {}) {
        if (reduceMotion) { cam.z = to; cam.bob = 0; return Promise.resolve(); }
        return new Promise(resolve => {
            const start = performance.now();
            const step = now => {
                const p = Math.min(1, (now - start) / ms);
                const e = ease === 'in' ? p * p * p : ease === 'out' ? 1 - Math.pow(1 - p, 3) : (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
                cam.z = from + (to - from) * e;
                cam.bob = Math.sin(p * Math.PI * 5) * bob * Math.sin(p * Math.PI);
                if (p < 1) requestAnimationFrame(step); else { cam.bob = 0; resolve(); }
            };
            requestAnimationFrame(step);
        });
    }
    const wait = ms => new Promise(r => setTimeout(r, reduceMotion ? 0 : ms));

    // 拖曳畫面可以稍微轉頭看看
    let drag = null;
    els.stage3d.addEventListener('pointerdown', e => {
        if (e.target.closest('.tablet')) return;
        drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', e => {
        if (!drag) return;
        cam.lookTX = Math.max(-7, Math.min(7, (e.clientX - drag.x) / 25));
        cam.lookTY = Math.max(-4, Math.min(4, -(e.clientY - drag.y) / 40));
    });
    window.addEventListener('pointerup', () => { drag = null; cam.lookTX = 0; cam.lookTY = 0; });
    window.addEventListener('deviceorientation', e => {
        if (drag || e.gamma == null) return;
        if (!tiltBase) tiltBase = { g: e.gamma, b: e.beta };
        cam.lookTX = Math.max(-5, Math.min(5, (e.gamma - tiltBase.g) / 4));
        cam.lookTY = Math.max(-3, Math.min(3, (e.beta - tiltBase.b) / 6));
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { tiltBase = null; layout(); }, 120);
    });

    // =========================================================
    // 朗讀
    // =========================================================
    function renderAutoRead() {
        const on = state.settings.tts !== false;
        els.autoReadBtn.textContent = on ? '🗣️' : '🤐';
        els.autoReadBtn.setAttribute('aria-pressed', String(on));
        els.autoReadBtn.title = on ? '自動朗讀：開' : '自動朗讀：關';
        els.autoReadBtn.setAttribute('aria-label', els.autoReadBtn.title);
    }
    renderAutoRead();
    els.autoReadBtn.addEventListener('click', () => {
        state = Game.load();
        state.settings.tts = state.settings.tts === false;
        Game.save(state);
        renderAutoRead();
        Game.toast(state.settings.tts ? '🗣️ 自動朗讀已開啟' : '🤐 自動朗讀已關閉');
        if (state.settings.tts) readQuestion(); else Game.stopSpeaking();
    });
    if (!('speechSynthesis' in window)) {
        els.readBtn.classList.add('hidden');
        els.autoReadBtn.classList.add('hidden');
    }
    function readQuestion() {
        const q = questions[run.index];
        Game.speak(`${q.q}。${q.options.map((o, i) => `${'ABCD'[i]}，${o.text}`).join('。')}`);
    }
    els.readBtn.addEventListener('click', readQuestion);

    // =========================================================
    // 出題與作答
    // =========================================================
    function renderQuestion() {
        const q = questions[run.index];
        run.selected = null;
        run.answered = false;
        cam.leanTarget = 0;

        els.qNum.textContent = `第 ${run.index + 1} / ${questions.length} 題`;
        els.qText.innerHTML = Game.mathHTML(q.q);
        els.hintText.classList.add('hidden');
        els.board.classList.remove('open', 'reset');
        els.boardContent.classList.remove('fade');

        [...els.steps.children].forEach((s, i) => {
            s.className = i < run.index ? (run.results[i] ? 'ok' : 'no') : (i === run.index ? 'now' : '');
        });

        tabletEls.forEach((t, i) => {
            t.className = 'tablet';
            t.disabled = false;
            t.setAttribute('aria-pressed', 'false');
            t.setAttribute('aria-label', `選項 ${'ABCD'[i]}：${Game.mathPlain(q.options[i].text)}`);
            t.querySelector('.t-text').innerHTML = Game.mathHTML(q.options[i].text);
        });

        els.feedback.classList.add('hidden');
        els.hintBtn.disabled = false;
        els.abilityBtn.disabled = run.abilityUsed;
        els.submit.classList.remove('hidden');
        els.submit.disabled = true;
        els.submit.textContent = '點選一塊石碑';
        els.next.classList.add('hidden');
    }

    function select(i) {
        const t = tabletEls[i];
        if (run.answered || run.busy || !t || t.disabled) return;
        run.selected = i;
        Game.sfx('select');
        tabletEls.forEach((b, k) => {
            b.classList.toggle('selected', k === i);
            b.setAttribute('aria-pressed', String(k === i));
        });
        cam.leanTarget = parseFloat(t.dataset.cx) * -5;
        els.submit.disabled = false;
        els.submit.textContent = `確定選 ${'ABCD'[i]}`;
    }

    // --- 提示：寫在黑板上（花 1 個肉乾） ---
    els.hintBtn.addEventListener('click', () => {
        if (run.answered || run.busy) return;
        state = Game.load();
        if (state.jerky < 1) {
            Game.toast('肉乾不夠了！先答對題目來收集肉乾吧 🦴');
            return;
        }
        state.jerky -= 1;
        Game.save(state);
        renderHud();
        bump(els.jerkyChip);
        Game.sfx('magic');
        els.hintText.innerHTML = `💡 ${Game.mathHTML(questions[run.index].hint)}`;
        els.hintText.classList.remove('hidden');
        els.hintBtn.disabled = true;
    });

    // --- 牧羊犬能力：兩塊錯誤的石碑倒下 ---
    els.abilityBtn.addEventListener('click', () => {
        if (run.answered || run.abilityUsed || run.busy) return;
        const q = questions[run.index];
        const wrongIdx = Game.shuffle([0, 1, 2, 3].filter(i => i !== q.answer && !tabletEls[i].disabled)).slice(0, 2);
        wrongIdx.forEach(i => {
            const t = tabletEls[i];
            t.classList.remove('selected');
            t.classList.add('fallen');
            t.disabled = true;
            if (run.selected === i) { run.selected = null; els.submit.disabled = true; els.submit.textContent = '點選一塊石碑'; }
        });
        run.abilityUsed = true;
        els.abilityBtn.disabled = true;
        Game.sfx('magic');
        Game.toast('👁️ 智慧之眼發動！兩塊錯誤的石碑倒下了');
    });

    els.submit.addEventListener('click', submit);

    function submit() {
        if (run.answered || run.busy || run.selected === null) return;
        const q = questions[run.index];
        const chosen = run.selected;
        const isCorrect = chosen === q.answer;

        // 鬥牛犬能力：第一次答錯可以再試一次
        if (!isCorrect && character.id === 'bulldog' && !run.abilityUsed) {
            run.abilityUsed = true;
            Game.sfx('wrong');
            const t = tabletEls[chosen];
            t.classList.remove('selected');
            t.classList.add('cracked');
            t.disabled = true;
            run.selected = null;
            els.submit.disabled = true;
            els.submit.textContent = '再選一次！';
            Game.toast('💪 永不放棄！這題再給你一次機會（本關限一次）', 3000);
            return;
        }

        run.answered = true;
        tabletEls.forEach(t => { t.disabled = true; });
        tabletEls[q.answer].classList.add('correct');
        run.results.push(isCorrect);
        Game.stopSpeaking();

        state = Game.load();
        let title;
        if (isCorrect) {
            run.score++;
            run.streak++;
            run.bestStreak = Math.max(run.bestStreak, run.streak);
            const reward = rewardFor();
            state.jerky += reward.amount;
            run.jerkyGained += reward.amount;
            Game.sfx('correct');
            setTimeout(() => Game.sfx('coin'), 250);
            floatReward(tabletEls[chosen], `+${reward.amount} 🦴`);
            bump(els.jerkyChip);
            const praise = ['答對了！', '太厲害了！', '完全正確！', '漂亮！', '好聰明！'][Math.floor(Math.random() * 5)];
            title = `✅ ${praise}${reward.note ? ' ' + reward.note : ''}`;
        } else {
            run.streak = 0;
            tabletEls[chosen].classList.add('wrong');
            run.wrong.push({ q: q.q, yours: q.options[chosen].text, right: q.options[q.answer].text, explain: q.explain });
            Game.sfx('wrong');
            title = '❌ 差一點！正確答案是';
        }
        showFeedback(isCorrect, title, isCorrect ? null : q.options[q.answer].text, q.explain);

        state.history.push({
            stage: stage.id, character: character.id, question: q.q,
            userAnswer: q.options[chosen].text, correctAnswer: q.options[q.answer].text,
            correct: isCorrect, time: new Date().toISOString()
        });
        if (state.history.length > 2000) state.history = state.history.slice(-2000);
        Game.save(state);
        renderHud();
        if (run.streak >= 2) bump(els.streakChip);

        [...els.steps.children][run.index].className = isCorrect ? 'ok' : 'no';
        els.submit.classList.add('hidden');
        els.next.textContent = run.index + 1 >= questions.length ? '打開最後的門 🏁' : '推開大門 →';
        els.next.classList.remove('hidden');
        els.next.focus();
    }

    function rewardFor() {
        if (character.id === 'shiba' && run.streak >= 3) return { amount: 2, note: `🔥 ${run.streak} 連擊！額外 +1` };
        if (character.id === 'mix' && Math.random() < 0.35) return { amount: 2, note: '🎉 幸運驚喜，肉乾加倍！' };
        return { amount: 1, note: '' };
    }

    function showFeedback(ok, title, rightText, explain) {
        els.feedback.className = `sheet ${ok ? 'ok' : 'no'}`;
        els.feedback.innerHTML = '<h3></h3><p class="explain"></p>';
        const h = els.feedback.querySelector('h3');
        h.textContent = title;
        if (rightText) h.insertAdjacentHTML('beforeend', ` <span class="answer">${Game.mathHTML(rightText)}</span>`);
        els.feedback.querySelector('.explain').innerHTML = `📖 ${Game.mathHTML(explain)}`;
    }

    function floatReward(anchor, text) {
        const r = anchor.getBoundingClientRect();
        const f = document.createElement('div');
        f.className = 'float-reward';
        f.textContent = text;
        f.style.left = `${r.left + r.width / 2 - 30}px`;
        f.style.top = `${r.top}px`;
        document.body.appendChild(f);
        setTimeout(() => f.remove(), 1200);
    }

    // --- 推開大門，走進下一間教室 ---
    els.next.addEventListener('click', async () => {
        if (run.busy) return;
        run.busy = true;
        Game.sfx('click');
        els.next.classList.add('hidden');
        els.feedback.classList.add('hidden');
        cam.leanTarget = 0;

        tabletEls.forEach(t => t.classList.add('leaving'));
        els.boardContent.classList.add('fade');
        await wait(250);
        els.board.classList.add('open');
        Game.sfx('door');
        await wait(450);
        els.fader.className = 'fader to-light';
        await walk(0, -G.zBack + G.P * 0.35, 1300, { ease: 'in' });

        run.index++;
        if (run.index >= questions.length) {
            finish();
            return;
        }

        renderQuestion();
        els.board.classList.add('reset');
        cam.z = -G.P * 0.55;
        els.fader.className = 'fader';
        await walk(cam.z, 0, 1100, { ease: 'out' });
        run.busy = false;
        if (state.settings.tts !== false) readQuestion();
    });

    // --- 鍵盤操作 ---
    document.addEventListener('keydown', e => {
        if (document.querySelector('.dialog-overlay')) return;
        if (!$('result-overlay').classList.contains('hidden')) return;
        const map = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 };
        const k = e.key.toLowerCase();
        if (k in map && !run.answered) { select(map[k]); return; }
        if (e.key === 'Enter') {
            const tab = e.target.closest && e.target.closest('.tablet');
            if (tab && !run.answered) {
                e.preventDefault();
                const i = tabletEls.indexOf(tab);
                if (run.selected === i) submit(); else select(i);
                return;
            }
            if (e.target.closest && e.target.closest('button') && e.target !== els.submit && e.target !== els.next) return;
            e.preventDefault();
            if (!run.answered) submit(); else els.next.click();
        }
    });

    // --- 中途離開 ---
    $('exit-btn').addEventListener('click', async () => {
        Game.sfx('click');
        const leave = await Game.dialog({
            icon: '🚪', title: '要離開這一關嗎？',
            body: '已經拿到的肉乾會保留，但這一關的成績不會記錄。',
            actions: [{ label: '繼續作答', value: false, primary: true }, { label: '返回地圖', value: true }]
        });
        if (leave) { Game.stopSpeaking(); Game.go('map_selection.html'); }
    });

    // =========================================================
    // 結算
    // =========================================================
    function finish() {
        Game.stopSpeaking();
        state = Game.load();
        const total = questions.length;
        const stars = Game.starsFor(run.score, total);
        const passed = stars > 0;
        const prev = state.stages[stage.id] || { stars: 0, best: 0, plays: 0, cleared: false };
        const wasCleared = prev.cleared;
        const nextStage = STAGES[Game.stageIndex(stage.id) + 1];
        const nextWasUnlocked = nextStage ? Game.isUnlocked(state, nextStage.id) : true;

        state.stages[stage.id] = {
            stars: Math.max(prev.stars || 0, stars),
            best: Math.max(prev.best || 0, run.score),
            total,
            plays: (prev.plays || 0) + 1,
            cleared: wasCleared || passed
        };
        Game.save(state);

        const newlyUnlocked = nextStage && !nextWasUnlocked && Game.isUnlocked(state, nextStage.id) ? nextStage : null;
        const isNewRecord = stars > (prev.stars || 0) && wasCleared;

        $('quiz-bar').classList.add('hidden');
        $('result-overlay').classList.remove('hidden');
        const card = $('result-card');

        const title = !passed ? '再接再厲！' : stars === 3 ? '完美通關！' : stars === 2 ? '表現優秀！' : '挑戰成功！';
        const sub = !passed
            ? `答對 ${Math.ceil(total * 0.6)} 題以上就能通過，看看下面的解說再試一次吧！`
            : newlyUnlocked ? `🔓 解鎖了新地點：${newlyUnlocked.icon} ${newlyUnlocked.name}！`
            : stage.final && !wasCleared ? '你打開了黑盒子……回到地圖看看發生了什麼事吧！'
            : isNewRecord ? '🎖️ 刷新了這一關的最佳紀錄！' : `${character.name}和你一起又變強了！`;

        card.innerHTML = `
            <div class="result-stars" aria-label="${stars} 顆星">${[0, 1, 2].map(i => `<span class="${i < stars ? 'lit' : ''}" style="animation-delay:${0.3 + i * 0.25}s">★</span>`).join('')}</div>
            <h2>${title}</h2>
            <p class="record-sub" style="margin-top:6px">${sub}</p>
            <div class="result-stats">
                <div><b>${run.score}/${total}</b><small>答對題數</small></div>
                <div><b>+${run.jerkyGained}</b><small>獲得肉乾</small></div>
                <div><b>${run.bestStreak}</b><small>最高連擊</small></div>
            </div>
            <div class="result-actions" id="result-actions"></div>
            <div class="review" id="review"></div>`;

        const actions = card.querySelector('#result-actions');
        const addBtn = (label, cls, fn) => {
            const b = document.createElement('button');
            b.className = `btn ${cls}`;
            b.textContent = label;
            b.addEventListener('click', () => { Game.sfx('click'); fn(); });
            actions.appendChild(b);
            return b;
        };
        const mapUrl = newlyUnlocked ? `map_selection.html?unlocked=${newlyUnlocked.id}` : 'map_selection.html';
        addBtn('🔁 再挑戰一次', passed ? 'btn-ghost' : 'btn-primary', () => Game.go(location.pathname + location.search));
        const toMap = addBtn('🗺️ 返回地圖', 'btn-ghost', () => Game.go(mapUrl));
        let primary = null;
        if (stage.final && passed) {
            primary = addBtn('📦 打開黑盒子', 'btn-primary', () => Game.go('map_selection.html'));
        } else if (passed && nextStage && Game.isUnlocked(state, nextStage.id)) {
            primary = addBtn(`前往${nextStage.name} →`, 'btn-primary', () => Game.go(`quiz.html?map=${nextStage.id}`));
        }
        (primary || (passed ? toMap : actions.firstChild)).focus();

        if (run.wrong.length) {
            const review = card.querySelector('#review');
            review.innerHTML = '<h3>📖 錯題回顧</h3>';
            run.wrong.forEach(w => {
                const item = document.createElement('div');
                item.className = 'review-item';
                item.innerHTML = `
                    <p><b>${Game.mathHTML(w.q)}</b></p>
                    <p class="ans-no">你的答案：${Game.mathHTML(w.yours)}</p>
                    <p class="ans-ok">正確答案：${Game.mathHTML(w.right)}</p>
                    <p class="explain">💡 ${Game.mathHTML(w.explain)}</p>`;
                review.appendChild(item);
            });
        }

        if (passed) {
            Game.sfx(newlyUnlocked || stage.final ? 'unlock' : 'win');
            confetti(stars * 30 + 20);
        } else {
            Game.sfx('wrong');
        }
    }

    function confetti(n) {
        if (reduceMotion) return;
        const wrap = document.createElement('div');
        wrap.className = 'confetti';
        const colors = ['#f6d58c', '#e7b95c', '#62c27b', '#6eb3e6', '#e46a5e', '#fff3d4'];
        for (let i = 0; i < n; i++) {
            const p = document.createElement('i');
            p.style.left = `${Math.random() * 100}%`;
            p.style.background = colors[i % colors.length];
            p.style.animationDuration = `${2 + Math.random() * 2}s`;
            p.style.animationDelay = `${Math.random() * 0.6}s`;
            wrap.appendChild(p);
        }
        document.body.appendChild(wrap);
        setTimeout(() => wrap.remove(), 5000);
    }

    // --- 開場：從走廊走進第一間教室 ---
    layout();
    renderQuestion();
    requestAnimationFrame(frame);
    cam.z = -G.P * 0.7;
    walk(cam.z, 0, 1500, { ease: 'out' }).then(() => {
        run.busy = false;
        if (state.settings.tts !== false) readQuestion();
    });
});
