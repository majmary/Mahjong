// card-loader.js
// Manages available card years and exposes the active card to the game.

(function() {

    // Registry of available cards.
    // To add a new year: add an entry here and drop the matching card-YYYY.js into data/
    const CARD_REGISTRY = {
        '2025': { label: 'NMJL 2025 Card', file: 'data/card-2025.js' },
        '2024': { label: 'NMJL 2024 Card', file: 'data/card-2024.js' },
    };

    const DEFAULT_CARD = '2025';

    // Returns array of { year, label } for the card selector UI
    window.getAvailableCards = function() {
        return Object.entries(CARD_REGISTRY).map(([year, info]) => ({
            year,
            label: info.label
        }));
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

    // Load the default card immediately so it's ready when the page opens
    // card-2025.js is loaded via a <script> tag in index.html, so CARD_LIBRARY['2025']
    // will already be populated — this just activates it as the default.
    window.CARD_LIBRARY = window.CARD_LIBRARY || {};

})();
