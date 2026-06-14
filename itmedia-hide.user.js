// ==UserScript==
// @name         ITmedia - Hide マンガ / サダタロー Articles
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Hides articles on ITmedia top page that contain "マンガ" or "サダタロー"
// @author       Claude
// @match        https://www.itmedia.co.jp/
// @match        https://www.itmedia.co.jp/index.html
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  const KEYWORDS = ['マンガ', 'サダタロー'];

  GM_addStyle(`
    .itm-hidden-article {
      display: none !important;
    }
  `);

  /**
   * Check if an element's text content contains any of the target keywords.
   */
  function containsKeyword(el) {
    const text = el.textContent || '';
    return KEYWORDS.some(kw => text.includes(kw));
  }

  /**
   * Walk up from a matching text node to find the article container to hide.
   * ITmedia top page wraps each story in <li> or <div> blocks inside
   * the list sections — we hide the closest <li> or meaningful <div>.
   */
  function findArticleContainer(el) {
    let node = el;
    while (node && node !== document.body) {
      const tag = node.tagName?.toLowerCase();
      if (tag === 'li') return node;
      // Section-level divs with an anchor+heading child are article cards
      if (tag === 'div' && node.querySelector('h2, h3, h4, a')) return node;
      node = node.parentElement;
    }
    return null;
  }

  /**
   * Scan and hide matching articles.
   */
  function hideMatchingArticles() {
    // Target article-link elements: headings and anchor tags that carry titles
    const candidates = document.querySelectorAll('li, .colBoxIndex, .article-list-item');

    candidates.forEach(el => {
      if (el.classList.contains('itm-hidden-article')) return; // already hidden
      if (containsKeyword(el)) {
        const container = findArticleContainer(el) || el;
        container.classList.add('itm-hidden-article');
        console.log('[ITmedia Filter] Hidden:', container.textContent.trim().slice(0, 60));
      }
    });

    // Also check standalone anchors / headings not wrapped in <li>
    const headings = document.querySelectorAll('h2 a, h3 a, h4 a, dt a, .colBoxTitle a');
    headings.forEach(a => {
      if (containsKeyword(a)) {
        const container = findArticleContainer(a);
        if (container && !container.classList.contains('itm-hidden-article')) {
          container.classList.add('itm-hidden-article');
          console.log('[ITmedia Filter] Hidden (heading):', a.textContent.trim().slice(0, 60));
        }
      }
    });
  }

  // Run on initial load
  hideMatchingArticles();

  // Re-run if the page updates content dynamically
  const observer = new MutationObserver(() => {
    hideMatchingArticles();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();