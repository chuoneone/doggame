// js/record.js — 學習紀錄：關卡表現、常錯題目、作答歷程、匯出 CSV

document.addEventListener('DOMContentLoaded', () => {
    const { STAGES, CHARACTERS } = Game;
    let state = Game.load();
    if (!state.character) document.getElementById('back-btn').href = 'index.html';

    const stageName = id => (STAGES.find(s => s.id === id) || {}).name || id || '—';
    const fmtTime = iso => {
        const d = new Date(iso);
        return isNaN(d) ? '—' : d.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
    const cell = (tr, text, cls) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (cls) td.className = cls;
        tr.appendChild(td);
        return td;
    };
    // 題目與答案含分數、次方，用數學排版顯示
    const mathCell = (tr, text) => {
        const td = document.createElement('td');
        td.innerHTML = Game.mathHTML(text);
        tr.appendChild(td);
        return td;
    };

    function render() {
        const h = state.history;
        const correct = h.filter(r => r.correct).length;

        // 總覽
        const summary = [
            [h.length, '作答題數'],
            [h.length ? `${Math.round(correct / h.length * 100)}%` : '—', '整體正確率'],
            [`${Game.totalStars(state)}/${STAGES.length * 3}`, '獲得星星'],
            [state.jerky, '肉乾']
        ];
        document.getElementById('summary').innerHTML = summary
            .map(([v, l]) => `<div class="panel"><b>${v}</b><small>${l}</small></div>`).join('');

        // 各關卡
        const stageRows = document.getElementById('stage-rows');
        stageRows.innerHTML = '';
        STAGES.forEach(s => {
            const rec = state.stages[s.id];
            const rows = h.filter(r => r.stage === s.id);
            const ok = rows.filter(r => r.correct).length;
            const tr = document.createElement('tr');
            cell(tr, `${s.icon} ${s.name}`);
            cell(tr, s.topic);
            cell(tr, rec ? Game.starText(rec.stars || 0) : (Game.isUnlocked(state, s.id) ? '未挑戰' : '🔒 未解鎖'), 'num');
            cell(tr, rec ? rec.plays : 0, 'num');
            const td = cell(tr, '');
            if (rows.length) {
                const pct = Math.round(ok / rows.length * 100);
                td.innerHTML = `<div class="acc-bar"><div class="bar"><i style="width:${pct}%"></i></div><span>${pct}%</span></div>`;
            } else {
                td.textContent = '—';
            }
            stageRows.appendChild(tr);
        });

        // 常錯題目
        const wrongMap = new Map();
        h.filter(r => !r.correct).forEach(r => {
            const item = wrongMap.get(r.question) || { ...r, count: 0 };
            item.count++;
            wrongMap.set(r.question, item);
        });
        const wrongRows = document.getElementById('wrong-rows');
        wrongRows.innerHTML = '';
        const wrongList = [...wrongMap.values()].sort((a, b) => b.count - a.count).slice(0, 15);
        if (!wrongList.length) {
            wrongRows.innerHTML = '<tr><td colspan="4" class="empty">目前沒有答錯的題目，太厲害了！</td></tr>';
        }
        wrongList.forEach(r => {
            const tr = document.createElement('tr');
            mathCell(tr, r.question);
            cell(tr, stageName(r.stage));
            cell(tr, `${r.count} 次`, 'num tag-no');
            mathCell(tr, r.correctAnswer);
            wrongRows.appendChild(tr);
        });

        // 最近作答
        const historyRows = document.getElementById('history-rows');
        historyRows.innerHTML = '';
        if (!h.length) {
            historyRows.innerHTML = '<tr><td colspan="5" class="empty">還沒有作答紀錄，快去冒險吧！</td></tr>';
        }
        h.slice(-60).reverse().forEach(r => {
            const tr = document.createElement('tr');
            cell(tr, fmtTime(r.time), 'num');
            cell(tr, stageName(r.stage));
            mathCell(tr, r.question);
            mathCell(tr, r.userAnswer);
            cell(tr, r.correct ? '✔ 正確' : '✘ 錯誤', r.correct ? 'tag-ok' : 'tag-no');
            historyRows.appendChild(tr);
        });
    }

    // 匯出 CSV（Excel 可直接開啟，含 BOM 避免中文亂碼）
    document.getElementById('export-btn').addEventListener('click', () => {
        if (!state.history.length) { Game.toast('還沒有紀錄可以匯出'); return; }
        const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
        const header = ['時間', '角色', '關卡', '題目', '作答', '正確答案', '結果'];
        const lines = state.history.map(r => [
            new Date(r.time).toLocaleString('zh-TW'),
            (CHARACTERS[r.character] || {}).name || '',
            stageName(r.stage), Game.mathPlain(r.question), Game.mathPlain(r.userAnswer), Game.mathPlain(r.correctAnswer), r.correct ? '正確' : '錯誤'
        ].map(esc).join(','));
        const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `狗子冒險之旅_學習紀錄_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    document.getElementById('clear-btn').addEventListener('click', async () => {
        const ok = await Game.dialog({
            icon: '🗑️', title: '清除作答紀錄？',
            body: '只會清除作答歷程，關卡進度、星星和肉乾都會保留。',
            actions: [{ label: '取消', value: false }, { label: '清除', value: true, danger: true }]
        });
        if (!ok) return;
        state = Game.load();
        state.history = [];
        Game.save(state);
        render();
        Game.toast('作答紀錄已清除');
    });

    render();
});
