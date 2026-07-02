// ==UserScript==
// @name         贴吧屏蔽助手 - 按作者/关键词屏蔽帖子
// @namespace    https://greasyfork.org/users/tieba-blocker
// @version      2.0.0
// @description  在百度贴吧列表页按作者或关键词隐藏帖子，每个帖子右上角带"拉黑作者"按钮，一键加入黑名单。同时兼容新版(Vue虚拟列表)与旧版贴吧页面结构。
// @author       You
// @match        https://tieba.baidu.com/f?*
// @icon         https://tieba.baidu.com/favicon.ico
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const KEY_AUTHORS = 'tbb_blacklist_authors';
  const KEY_KEYWORDS = 'tbb_blacklist_keywords';

  let blacklistAuthors = GM_getValue(KEY_AUTHORS, []);
  let blacklistKeywords = GM_getValue(KEY_KEYWORDS, []);

  const saveAuthors = () => GM_setValue(KEY_AUTHORS, blacklistAuthors);
  const saveKeywords = () => GM_setValue(KEY_KEYWORDS, blacklistKeywords);
  const textOf = (el) => (el ? el.textContent.trim() : '');

  // ---------------- styles ----------------
  GM_addStyle(`
    .thread-card-wrapper { position: relative !important; }
    li.j_thread_list { position: relative !important; }

    .tbb-blk-btn {
      position: absolute; top: 8px; right: 8px; z-index: 999;
      background: rgba(255,80,80,.85); color: #fff; border: none;
      border-radius: 4px; padding: 2px 8px; font-size: 12px;
      line-height: 18px; cursor: pointer; opacity: .3;
      transition: opacity .15s, background .15s;
    }
    .thread-card-wrapper:hover .tbb-blk-btn,
    li.j_thread_list:hover .tbb-blk-btn { opacity: 1; }
    .tbb-blk-btn:hover { background: #ff2b2b; }

    #tbb-toggle {
      position: fixed; top: 90px; right: 12px; z-index: 99999;
      background: #3d8bff; color: #fff; border: none; border-radius: 20px;
      padding: 8px 14px; font-size: 13px; cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,.25);
    }
    #tbb-panel {
      position: fixed; top: 135px; right: 12px; width: 300px; max-height: 65vh;
      overflow: auto; background: #fff; border: 1px solid #ddd; border-radius: 10px;
      box-shadow: 0 6px 20px rgba(0,0,0,.2); z-index: 99999; padding: 14px;
      font-size: 13px; display: none;
    }
    #tbb-panel h3 { margin: 0 0 10px; font-size: 15px; color:#222; }
    #tbb-panel .tbb-section { margin-bottom: 14px; }
    #tbb-panel label { display:block; margin-bottom: 4px; color: #555; }
    #tbb-panel textarea {
      width: 100%; box-sizing: border-box; height: 80px; font-size: 12px;
      border: 1px solid #ccc; border-radius: 6px; padding: 6px; resize: vertical;
    }
    #tbb-panel button.tbb-save {
      margin-top: 6px; font-size: 12px; cursor: pointer; border: none;
      background: #3d8bff; color: #fff; padding: 4px 10px; border-radius: 5px;
    }
    #tbb-panel .tbb-hint { color: #999; font-size: 11px; line-height: 1.5; }
  `);

  // ---------------- floating settings panel ----------------
  function buildPanel() {
    const toggle = document.createElement('button');
    toggle.id = 'tbb-toggle';
    toggle.textContent = '🚫 屏蔽设置';
    document.body.appendChild(toggle);

    const panel = document.createElement('div');
    panel.id = 'tbb-panel';
    panel.innerHTML = `
      <h3>贴吧屏蔽助手</h3>
      <div class="tbb-section">
        <label>屏蔽作者（每行一个昵称）</label>
        <textarea id="tbb-authors"></textarea>
        <button class="tbb-save" id="tbb-save-authors">保存</button>
      </div>
      <div class="tbb-section">
        <label>屏蔽关键词（每行一个，命中标题或正文摘要即隐藏）</label>
        <textarea id="tbb-keywords"></textarea>
        <button class="tbb-save" id="tbb-save-keywords">保存</button>
      </div>
      <div class="tbb-hint">提示：也可以直接点击每个帖子右上角的「拉黑作者」按钮快速加入黑名单。置顶帖不显示作者信息，暂不支持按作者屏蔽置顶帖。</div>
    `;
    document.body.appendChild(panel);

    const authorsTa = panel.querySelector('#tbb-authors');
    const keywordsTa = panel.querySelector('#tbb-keywords');
    authorsTa.value = blacklistAuthors.join('\n');
    keywordsTa.value = blacklistKeywords.join('\n');

    toggle.addEventListener('click', () => {
      panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
    });

    panel.querySelector('#tbb-save-authors').addEventListener('click', () => {
      blacklistAuthors = authorsTa.value.split('\n').map(s => s.trim()).filter(Boolean);
      saveAuthors();
      applyFilters();
    });
    panel.querySelector('#tbb-save-keywords').addEventListener('click', () => {
      blacklistKeywords = keywordsTa.value.split('\n').map(s => s.trim()).filter(Boolean);
      saveKeywords();
      applyFilters();
    });

    return { authorsTa, keywordsTa };
  }

  const panelRefs = buildPanel();

  // ---------------- gathering thread cards (new UI + legacy UI) ----------------
  function collectCandidates() {
    const list = [];

    // New (2026) Vue-based UI: virtualized feed list
    document.querySelectorAll('.feed-list-container .thread-card').forEach((el) => {
      list.push({ el, type: 'new-regular' });
    });
    document.querySelectorAll('.top-thread-card').forEach((el) => {
      list.push({ el, type: 'new-pinned' });
    });

    // Legacy PC UI fallback (older markup, kept in case it's still served)
    document.querySelectorAll('#thread_list li.j_thread_list').forEach((el) => {
      list.push({ el, type: 'legacy' });
    });

    return list;
  }

  // The virtual-scroll library sometimes wraps each card in an extra
  // "virtual-list-item" positioning node with an explicit data-key.
  // Hide that outer node (not just the inner card) so no blank gap remains.
  function getHideTarget(el) {
    const parent = el.parentElement;
    if (parent && parent.hasAttribute && parent.hasAttribute('data-key') &&
        parent.classList.contains('virtual-list-item')) {
      return parent;
    }
    return el;
  }

  function extractInfo(item) {
    const { el, type } = item;

    if (type === 'new-regular') {
      const wrapper = el.querySelector(':scope > .thread-card-wrapper') || el;
      const author = textOf(wrapper.querySelector('.head-name'));
      const title = textOf(wrapper.querySelector('.thread-title'));
      const abs = textOf(wrapper.querySelector('.thread-content'));
      return { author, title, abs, buttonAnchor: wrapper, hideTarget: getHideTarget(el) };
    }

    if (type === 'new-pinned') {
      // Pinned/top threads don't expose an author name in this markup.
      const title = textOf(el.querySelector('.thread-title'));
      const abs = textOf(el.querySelector('.thread-content'));
      return { author: '', title, abs, buttonAnchor: null, hideTarget: el };
    }

    // legacy markup
    let author = '';
    let title = '';
    try {
      const raw = el.getAttribute('data-field');
      if (raw) {
        const data = JSON.parse(raw.replace(/&quot;/g, '"'));
        if (data && data.author) author = data.author.user_nickname || data.author.user_name || '';
        if (data && data.title) title = data.title;
      }
    } catch (e) { /* fall through */ }
    if (!author) author = textOf(el.querySelector('.frs-author-name, a.frs-author-name'));
    if (!title) {
      const titleEl = el.querySelector('.threadlist_title a, a.j_th_tit');
      title = titleEl ? (titleEl.getAttribute('title') || titleEl.textContent || '').trim() : '';
    }
    const abs = textOf(el.querySelector('.threadlist_abs'));
    return { author, title, abs, buttonAnchor: el, hideTarget: el };
  }

  function isBlacklisted({ author, title, abs }) {
    if (author && blacklistAuthors.includes(author)) return true;
    const text = (title + ' ' + abs).toLowerCase();
    return blacklistKeywords.some((k) => k && text.includes(k.toLowerCase()));
  }

  function ensureBlockButton(anchor, author) {
    if (!anchor) return;
    let btn = anchor.querySelector(':scope > .tbb-blk-btn');
    if (!author) {
      if (btn) btn.remove();
      return;
    }
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'tbb-blk-btn';
      btn.type = 'button';
      btn.textContent = '拉黑作者';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const a = btn.dataset.tbbAuthor;
        if (a && !blacklistAuthors.includes(a)) {
          blacklistAuthors.push(a);
          saveAuthors();
          panelRefs.authorsTa.value = blacklistAuthors.join('\n');
        }
        applyFilters();
      });
      anchor.appendChild(btn);
    }
    // Refresh the target author every pass — the virtual-scroll list recycles
    // DOM nodes, so a stale closure would blacklist the wrong person.
    btn.dataset.tbbAuthor = author;
    btn.title = `将「${author}」加入屏蔽名单`;
  }

  // ---------------- main filter pass ----------------
  function applyFilters() {
    const candidates = collectCandidates();
    candidates.forEach((item) => {
      const info = extractInfo(item);
      if (!info.title && !info.author) return; // skip ad/unrecognized cards
      ensureBlockButton(info.buttonAnchor, info.author);
      info.hideTarget.style.display = isBlacklisted(info) ? 'none' : '';
    });
  }

  applyFilters();

  // Re-run on any DOM change: covers the SPA's initial async render, the
  // virtual list recycling nodes while scrolling, and legacy ajax updates.
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyFilters, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Safety net in case some updates slip past the observer.
  setInterval(applyFilters, 2000);

  // ---------------- menu commands ----------------
  GM_registerMenuCommand('打开屏蔽设置面板', () => {
    document.getElementById('tbb-panel').style.display = 'block';
  });
  GM_registerMenuCommand('添加屏蔽关键词', () => {
    const kw = prompt('输入要屏蔽的关键词：');
    if (kw && kw.trim()) {
      blacklistKeywords.push(kw.trim());
      saveKeywords();
      panelRefs.keywordsTa.value = blacklistKeywords.join('\n');
      applyFilters();
    }
  });
})();
