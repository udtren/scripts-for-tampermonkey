// ==UserScript==
// @name         Zhihu Answer Muter / 知乎回答屏蔽
// @namespace    https://www.zhihu.com/
// @version      1.0
// @description  Mute (collapse) Zhihu answers (.ContentItem.AnswerItem) by keyword or by author. 按关键词或作者屏蔽知乎回答。
// @author       you
// @match        https://www.zhihu.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    /* ---------------- config / storage ---------------- */
    const KEY_KW = 'zhm_keywords';
    const KEY_AU = 'zhm_authors';

    const load = (k) => {
        try { return JSON.parse(GM_getValue(k, '[]')); } catch (e) { return []; }
    };
    const save = (k, arr) => GM_setValue(k, JSON.stringify(arr));

    let keywords = load(KEY_KW);   // array of strings
    let authors  = load(KEY_AU);   // array of author names

    /* ---------------- styles ---------------- */
    const css = `
    .zhm-muted > *:not(.zhm-bar) { display: none !important; }
    .zhm-muted.zhm-show > * { display: revert !important; }
    .zhm-bar {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 16px; margin: 0;
        font-size: 14px; color: #8590a6;
        background: #f6f6f6; border-bottom: 1px solid #ebebeb;
    }
    .zhm-bar .zhm-reason { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .zhm-bar button {
        border: none; background: transparent; color: #175199;
        cursor: pointer; font-size: 13px; padding: 2px 4px;
    }
    .zhm-bar button:hover { text-decoration: underline; }

    .zhm-block-btn {
        margin-left: 8px; border: 1px solid #d0d0d0; border-radius: 3px;
        background: #fff; color: #8590a6; cursor: pointer;
        font-size: 12px; line-height: 1.4; padding: 1px 6px;
    }
    .zhm-block-btn:hover { color: #f4524d; border-color: #f4524d; }

    /* settings panel */
    #zhm-panel {
        position: fixed; top: 80px; right: 20px; z-index: 100000;
        width: 320px; background: #fff; border: 1px solid #d0d0d0;
        border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,.18);
        font-size: 14px; color: #1a1a1a; display: none;
    }
    #zhm-panel.zhm-open { display: block; }
    #zhm-panel h3 { margin: 0; padding: 12px 16px; border-bottom: 1px solid #eee;
        font-size: 15px; display: flex; justify-content: space-between; align-items: center; }
    #zhm-panel h3 .zhm-x { cursor: pointer; color: #999; }
    #zhm-panel .zhm-sec { padding: 12px 16px; }
    #zhm-panel label { display: block; margin-bottom: 6px; font-weight: 600; }
    #zhm-panel .zhm-hint { font-weight: 400; color: #8590a6; font-size: 12px; }
    #zhm-panel textarea {
        width: 100%; box-sizing: border-box; height: 90px; resize: vertical;
        border: 1px solid #d0d0d0; border-radius: 4px; padding: 6px 8px;
        font-size: 13px; font-family: inherit;
    }
    #zhm-panel .zhm-actions { padding: 0 16px 14px; display: flex; gap: 8px; }
    #zhm-panel .zhm-save {
        flex: 1; background: #175199; color: #fff; border: none; border-radius: 4px;
        padding: 8px; cursor: pointer; font-size: 14px;
    }
    #zhm-panel .zhm-save:hover { background: #1a5fb4; }
    #zhm-panel .zhm-cancel {
        background: #f0f0f0; color: #444; border: none; border-radius: 4px;
        padding: 8px 14px; cursor: pointer; font-size: 14px;
    }`;
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    /* ---------------- core logic ---------------- */

    // Get the author name of an answer item.
    function getAuthor(item) {
        const zop = item.getAttribute('data-zop');
        if (zop) {
            try {
                const o = JSON.parse(zop);
                if (o && o.authorName) return String(o.authorName).trim();
            } catch (e) { /* ignore */ }
        }
        const a = item.querySelector('.AuthorInfo .UserLink-link, .AuthorInfo meta[itemprop="name"]');
        if (a) return (a.textContent || a.getAttribute('content') || '').trim();
        return '';
    }

    // Get the text used for keyword matching (answer body, fallback to whole item).
    function getText(item) {
        const rc = item.querySelector('.RichContent, .RichText');
        return (rc ? rc.textContent : item.textContent) || '';
    }

    // Decide whether and why an item should be muted.
    function muteReason(item) {
        const author = getAuthor(item);
        if (author && authors.some(a => a && a === author)) {
            return '作者：' + author;
        }
        const text = getText(item).toLowerCase();
        const hit = keywords.find(k => k && text.includes(k.toLowerCase()));
        if (hit) return '关键词：' + hit;
        return null;
    }

    function collapse(item, reason) {
        // already collapsed by us? update reason and stop
        if (item.classList.contains('zhm-muted')) {
            const r = item.querySelector(':scope > .zhm-bar .zhm-reason');
            if (r) r.textContent = '已屏蔽（' + reason + '）';
            return;
        }
        const bar = document.createElement('div');
        bar.className = 'zhm-bar';
        const span = document.createElement('span');
        span.className = 'zhm-reason';
        span.textContent = '已屏蔽（' + reason + '）';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '显示';
        btn.addEventListener('click', () => {
            const shown = item.classList.toggle('zhm-show');
            btn.textContent = shown ? '收起' : '显示';
        });
        bar.appendChild(span);
        bar.appendChild(btn);
        item.insertBefore(bar, item.firstChild);
        item.classList.add('zhm-muted');
    }

    function uncollapse(item) {
        if (!item.classList.contains('zhm-muted')) return;
        const bar = item.querySelector(':scope > .zhm-bar');
        if (bar) bar.remove();
        item.classList.remove('zhm-muted', 'zhm-show');
    }

    // Inject a quick "block author" button into an answer's author area.
    function injectBlockBtn(item) {
        if (item.querySelector(':scope .zhm-block-btn')) return;
        const host = item.querySelector('.AuthorInfo');
        if (!host) return;
        const author = getAuthor(item);
        if (!author) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'zhm-block-btn';
        b.textContent = '屏蔽作者';
        b.title = '屏蔽该作者的回答';
        b.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!authors.includes(author)) {
                authors.push(author);
                save(KEY_AU, authors);
            }
            rescanAll();
        });
        host.appendChild(b);
    }

    // Process a single answer item.
    function processItem(item) {
        injectBlockBtn(item);
        const reason = muteReason(item);
        if (reason) collapse(item, reason);
        else uncollapse(item);
    }

    function scan(root) {
        const scope = (root && root.querySelectorAll) ? root : document;
        const items = scope.querySelectorAll('.ContentItem.AnswerItem');
        items.forEach(processItem);
        // if root itself is an answer item
        if (root && root.matches && root.matches('.ContentItem.AnswerItem')) {
            processItem(root);
        }
    }

    // Re-evaluate every answer on the page (used after config changes).
    function rescanAll() {
        document.querySelectorAll('.ContentItem.AnswerItem').forEach(processItem);
    }

    /* ---------------- observe dynamic loading ---------------- */
    let pending = false;
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const n of m.addedNodes) {
                if (n.nodeType === 1) {
                    if (!pending) {
                        pending = true;
                        requestAnimationFrame(() => { pending = false; scan(document); });
                    }
                    return;
                }
            }
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    /* ---------------- settings panel ---------------- */
    function buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'zhm-panel';
        panel.innerHTML = `
            <h3>回答屏蔽设置 <span class="zhm-x" title="关闭">✕</span></h3>
            <div class="zhm-sec">
                <label>屏蔽关键词 <span class="zhm-hint">每行一个，命中即折叠</span></label>
                <textarea id="zhm-kw" placeholder="例如&#10;广告&#10;赞助&#10;XX培训"></textarea>
            </div>
            <div class="zhm-sec">
                <label>屏蔽作者 <span class="zhm-hint">每行一个，填作者昵称</span></label>
                <textarea id="zhm-au" placeholder="例如&#10;某某用户&#10;匿名用户"></textarea>
            </div>
            <div class="zhm-actions">
                <button class="zhm-save">保存</button>
                <button class="zhm-cancel">取消</button>
            </div>`;
        document.body.appendChild(panel);

        const kwTa = panel.querySelector('#zhm-kw');
        const auTa = panel.querySelector('#zhm-au');

        const fill = () => {
            kwTa.value = keywords.join('\n');
            auTa.value = authors.join('\n');
        };
        const close = () => panel.classList.remove('zhm-open');
        const parse = (v) => v.split('\n').map(s => s.trim()).filter(Boolean);

        panel.querySelector('.zhm-x').addEventListener('click', close);
        panel.querySelector('.zhm-cancel').addEventListener('click', close);
        panel.querySelector('.zhm-save').addEventListener('click', () => {
            keywords = [...new Set(parse(kwTa.value))];
            authors  = [...new Set(parse(auTa.value))];
            save(KEY_KW, keywords);
            save(KEY_AU, authors);
            close();
            rescanAll();
        });

        return { open: () => { fill(); panel.classList.add('zhm-open'); } };
    }

    const panel = buildPanel();
    GM_registerMenuCommand('⚙️ 屏蔽设置', panel.open);

    /* ---------------- go ---------------- */
    scan(document);
})();