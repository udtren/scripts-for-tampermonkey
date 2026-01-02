// ==UserScript==
// @name         TechPowerUp - Hide Sponsored Articles
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Hide articles containing sponsored/deal flags on TechPowerUp
// @author       Michito
// @match        https://www.techpowerup.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=techpowerup.com
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Function to hide sponsored articles
    function hideSponsoredArticles() {
        // Find all sponsored flags
        const sponsoredFlags = document.querySelectorAll('span.flag.sponsored');
        
        sponsoredFlags.forEach(flag => {
            // Find the parent article element
            const article = flag.closest('article.newspost');
            
            if (article) {
                // Hide the article
                article.style.display = 'none';
                console.log('Hid sponsored article:', article.dataset.id);
            }
        });
    }

    // Run on initial page load
    hideSponsoredArticles();

    // Also watch for dynamically loaded content (in case of infinite scroll)
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length) {
                hideSponsoredArticles();
            }
        });
    });

    // Start observing the document for changes
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log('TechPowerUp Sponsored Article Hider: Active');
})();
