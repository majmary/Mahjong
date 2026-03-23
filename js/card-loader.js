// card-loader.js
// Manages available card years and exposes the active card to the game.

(function() {

    // Registry of available cards.
    // To add a new year: add an entry here and drop the matching card-YYYY.js into data/
    const CARD_REGISTRY = {
        '2026': { label: 'NMJL 2026 Card', file: 'data/card-2026.js' },
        '2025': { label: 'NMJL 2025 Card', file: 'data/card-2025.js' },
        '2024': { label: 'NMJL 2024 Card', file: 'data/card-2024.js' },
    };

    const DEFAULT_CARD = '2026';

    // Returns array of { year, label } for the card selector UI, newest first
    window.getAvailableCards = function() {
        return Object.entries(CARD_REGISTRY)
            .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
            .map(([year, info]) => ({ year, label: info.label }));
    };

    // Load a card year by injecting its script tag, then call callback when ready.
    // If the card is already in CARD_LIBRARY (already loaded), skips the fetch.
    window.loadCard = function(year, callback) {
        year = year || DEFAULT_CARD;

        if (!CARD_REGISTRY[year]) {
            console.error('Unknown card year:', year);
            return;
        }

        // Already loaded — just activate it
        if (window.CARD_LIBRARY && window.CARD_LIBRARY[year]) {
            window.ACTIVE_CARD = window.CARD_LIBRARY[year];
            window.ACTIVE_CARD_YEAR = year;
            if (callback) callback();
            return;
        }

        // Inject the script tag to load the card file
        const script = document.createElement('script');
        script.src = CARD_REGISTRY[year].file;
        script.onload = function() {
            if (!window.CARD_LIBRARY || !window.CARD_LIBRARY[year]) {
                console.error('Card file loaded but data not found for year:', year);
                return;
            }
            window.ACTIVE_CARD = window.CARD_LIBRARY[year];
            window.ACTIVE_CARD_YEAR = year;
            if (callback) callback();
        };
        script.onerror = function() {
            console.error('Failed to load card file:', CARD_REGISTRY[year].file);
            alert('Could not load the ' + year + ' card data. Please check your connection.');
        };
        document.head.appendChild(script);
    };

    window.CARD_LIBRARY = window.CARD_LIBRARY || {};

    // Populate a card-year <select> and wire its onchange.
    // Call this from each page's load handler:
    //   populateCardSelect('cardSelect', switchCard);
    // onChangeFn receives the selected year string.
    window.populateCardSelect = function(selId, onChangeFn) {
        const sel = document.getElementById(selId);
        if (!sel) return;
        sel.innerHTML = '';
        const cards = window.getAvailableCards(); // newest first
        cards.forEach(function(card) {
            const opt = document.createElement('option');
            opt.value = card.year;
            opt.textContent = card.label;
            sel.appendChild(opt);
        });
        if (cards.length) sel.value = cards[0].year; // default to newest
        sel.addEventListener('change', function() {
            if (onChangeFn) onChangeFn(this.value);
        });
    };

})();
