// ══════════════════════════════════════════════════════════════════════════════
// pivot-eval.js  —  Pivot-specific hand evaluator
//
// Uses a three-pass approach to determine which hands match a 10-tile puzzle:
//
//   Pass 1  (pivotPass1)           — cheap tile-identity filter.
//                                    For every natural tile with count ≥ 2,
//                                    at least one slot in the pattern must be
//                                    able to accept that tile type at all.
//                                    No drop loop, no variable binding.
//
//   Pass 2+3 (pivotFits)           — per-drop reverse-priority assignment.
//                                    For each of the 10 possible dropped tiles,
//                                    tries to place all remaining naturals into
//                                    the pattern using P4→K-run→P3→P2→P1 slot
//                                    order, binding suit/number variables as it
//                                    goes, then checks joker capacity.
//
// Processing largest groups first (P4 kongs before P1 pairs) prevents the
// greedy false-negative where a pair grabs two tiles of a type before a kong
// that needs them can be served.
//
// Entry point: pivotComputeValidHands(tiles)
//   Drop-in replacement for computeValidHands() in pivot.html.
//   Requires parsePattern() from patterns.js and ACTIVE_CARD to be loaded.
//
// Known edge case: Consecutive Run #7 uses R-slots (number references into a
//   K-run). R tiles are treated as any-number wildcards here; the run-number
//   constraint is not fully enforced, which may produce occasional false
//   positives for that hand only.
// ══════════════════════════════════════════════════════════════════════════════

const PIVOT_DRAGON_MAP  = { B: 'GD', C: 'RD', D: 'WD' };
const PIVOT_DRAGON_SUIT = { GD: 'B', RD: 'C', WD: 'D' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function pivotFreq(tiles) {
    const f = {};
    tiles.forEach(t => f[t] = (f[t] || 0) + 1);
    return f;
}

// A slot is jokerable if it is P4 or P3, all-identical, and size ≥ 3.
// Mirrors the rule in useJokersForScoring in patterns.js.
function pivotIsJokerable(slot) {
    return (slot.priority === 4 || slot.priority === 3)
        && slot.tiles.length >= 3
        && slot.tiles.every(t => t === slot.tiles[0]);
}

// Sort key: process P4 first, then K-runs (so K binds before R is evaluated),
// then P3, P2, P1. This is the reverse of the main engine's priority order and
// prevents large groups being starved by greedily filled pairs.
function pivotSlotKey(slot) {
    if (slot.priority === 4)       return 4;
    if (slot.tiles.includes('K'))  return 3.5;  // K before R-dependent slots
    return slot.priority;                        // 3, 2, 1
}

// ── Pass 1: loose tile-type compatibility check ───────────────────────────────
// Returns true if slot character ch could accept the given tile, ignoring suit
// and number variable constraints (no binding at this stage).
function pivotCharFitsTile(ch, tile) {
    if (tile === 'F')                          return ch === 'F';
    if ('NEWS'.includes(tile) && tile.length === 1) return ch === tile;
    if (['GD','RD','WD'].includes(tile))       return ch === 'D' || ch === '0';
    if (tile.length === 2) {
        const num    = tile[0];
        const isEven = '2468'.includes(num);
        const isOdd  = '13579'.includes(num);
        const is369  = '369'.includes(num);
        return ch === 'X'
            || ch === 'R'                      // R = any number in a run
            || ch === 'K'                      // K = consecutive position
            || (ch === 'V' && isEven)
            || (ch === 'Y' && isOdd)
            || (ch === 'M' && is369)
            || ch === num;                     // literal digit match
    }
    return false;
}

// For every natural tile in tenTiles with count ≥ 2, at least one slot in the
// pattern must be able to accept that tile type. Eliminates clear mismatches
// (e.g. 8D×3 against a Winds & Dragons hand) before the per-drop loop.
function pivotPass1(slots, tenTiles) {
    const freq = pivotFreq(tenTiles.filter(t => t !== 'J'));
    for (const [tile, count] of Object.entries(freq)) {
        const ok = slots.some(slot => slot.tiles.some(ch => pivotCharFitsTile(ch, tile)));
        if (!ok) return false;
    }
    return true;
}

// ── Slot candidates (homogeneous slots only) ──────────────────────────────────
// Returns array of { tileType, maxCount, newNumVarMap, newSuitVarMap } for
// each natural tile type in freq that could fill positions in this slot, given
// the current variable bindings.  maxCount = min(freq[tile], slotSize).
function pivotSlotCandidates(slot, freq, numVarMap, suitVarMap) {
    const results   = [];
    const ch        = slot.tiles[0];
    const slotSize  = slot.tiles.length;
    const boundNum  = slot.numVar  ? (numVarMap[slot.numVar]   || null) : null;
    const boundSuit = slot.suitVar ? (suitVarMap[slot.suitVar] || null) : null;
    const lockedSuits = Object.entries(suitVarMap)
        .filter(([v, s]) => v !== slot.suitVar && s)
        .map(([, s]) => s);

    // ── Flower ────────────────────────────────────────────────────────────────
    if (ch === 'F') {
        if ((freq['F'] || 0) > 0)
            results.push({ tileType: 'F',
                           maxCount: Math.min(freq['F'], slotSize),
                           newNumVarMap: {...numVarMap}, newSuitVarMap: {...suitVarMap} });
        return results;
    }

    // ── Winds (NNNN, EEEE, WWWW, SSSS) ───────────────────────────────────────
    if ('NEWS'.includes(ch) && ch.length === 1) {
        if ((freq[ch] || 0) > 0)
            results.push({ tileType: ch,
                           maxCount: Math.min(freq[ch], slotSize),
                           newNumVarMap: {...numVarMap}, newSuitVarMap: {...suitVarMap} });
        return results;
    }

    // ── Dragon (D = suit-matched dragon; 0 = WD only) ─────────────────────────
    if (ch === 'D' || ch === '0') {
        const suitsToTry = ch === '0' ? ['D']
            : boundSuit ? [boundSuit]
            : Object.keys(PIVOT_DRAGON_MAP).filter(s => !lockedSuits.includes(s));
        for (const suit of suitsToTry) {
            const dragon = PIVOT_DRAGON_MAP[suit];
            if ((freq[dragon] || 0) > 0) {
                const newSV = {...suitVarMap};
                if (slot.suitVar && !newSV[slot.suitVar]) newSV[slot.suitVar] = suit;
                results.push({ tileType: dragon,
                               maxCount: Math.min(freq[dragon], slotSize),
                               newNumVarMap: {...numVarMap}, newSuitVarMap: newSV });
            }
        }
        return results;
    }

    // ── Number wildcards (X/V/Y/M/R) and literal digits ──────────────────────
    if (['X','V','Y','M','R'].includes(ch) || /^\d$/.test(ch)) {
        // R (K-run reference) is treated as any-number wildcard here.
        const allowedVarNums =
              ch === 'V' ? ['2','4','6','8']
            : ch === 'Y' ? ['1','3','5','7','9']
            : ch === 'M' ? ['3','6','9']
            : ['1','2','3','4','5','6','7','8','9'];

        const suitsToTry = boundSuit ? [boundSuit]
            : ['B','C','D'].filter(s => !lockedSuits.includes(s));

        for (const suit of suitsToTry) {
            for (const varNum of allowedVarNums) {
                // For literal digit: the varNum must match the literal character
                if (/^\d$/.test(ch) && varNum !== ch) continue;
                // Tile's actual displayed number = varNum + offset
                const tileNum = String(parseInt(varNum) + slot.offset);
                if (parseInt(tileNum) < 1 || parseInt(tileNum) > 9) continue;
                // If numVar already bound, it must agree
                if (boundNum !== null && boundNum !== varNum) continue;

                const tile = tileNum + suit;
                if ((freq[tile] || 0) > 0) {
                    const newNV = {...numVarMap};
                    const newSV = {...suitVarMap};
                    if (slot.numVar  && !newNV[slot.numVar])  newNV[slot.numVar]  = varNum;
                    if (slot.suitVar && !newSV[slot.suitVar]) newSV[slot.suitVar] = suit;
                    results.push({ tileType: tile,
                                   maxCount: Math.min(freq[tile], slotSize),
                                   newNumVarMap: newNV, newSuitVarMap: newSV });
                }
            }
        }
        return results;
    }

    return results;
}

// ── pivotFits ─────────────────────────────────────────────────────────────────
// Core check: can all naturals in nineTiles be placed into the pattern's slots
// (with consistent variable bindings), and are there enough jokerable positions
// for all jokers?
function pivotFits(nineTiles, slots) {
    const naturals   = nineTiles.filter(t => t !== 'J');
    const jokerCount = nineTiles.length - naturals.length;
    const naturalFreq = pivotFreq(naturals);

    // Sort: P4 → K-runs → P3 → P2 → P1
    const sorted = [...slots].sort((a, b) => pivotSlotKey(b) - pivotSlotKey(a));

    // Total jokerable capacity (max jokers the pattern can absorb)
    const totalJokerCap = sorted.reduce(
        (sum, s) => sum + (pivotIsJokerable(s) ? s.tiles.length : 0), 0);

    // Quick bail: not enough jokerable capacity for all jokers
    if (totalJokerCap < jokerCount) return false;

    // ── Recursive assignment ──────────────────────────────────────────────────
    // freq:         naturals not yet placed
    // jokerCapUsed: jokerable positions consumed by naturals (reducing joker room)
    function assign(idx, freq, numVarMap, suitVarMap, jokerCapUsed) {

        // Base case: all slots processed
        if (idx >= sorted.length) {
            const naturalsLeft  = Object.values(freq).reduce((s, v) => s + v, 0);
            const jokerCapLeft  = totalJokerCap - jokerCapUsed;
            return naturalsLeft === 0 && jokerCapLeft >= jokerCount;
        }

        const slot    = sorted[idx];
        const jokable = pivotIsJokerable(slot);

        // Pruning: if remaining naturals exceed remaining slot capacity, bail early
        const naturalsLeft   = Object.values(freq).reduce((s, v) => s + v, 0);
        const slotCapLeft    = sorted.slice(idx).reduce((s, sl) => s + sl.tiles.length, 0);
        if (naturalsLeft > slotCapLeft) return false;

        // ── K-run slot (P1 re-sorted to 3.5) ─────────────────────────────────
        if (slot.tiles.includes('K')) {
            const L          = slot.tiles.length;
            const boundSuit  = slot.suitVar ? (suitVarMap[slot.suitVar] || null) : null;
            const lockedSuits = Object.entries(suitVarMap)
                .filter(([v, s]) => v !== slot.suitVar && s).map(([, s]) => s);
            const suitsToTry = boundSuit ? [boundSuit]
                : ['B','C','D'].filter(s => !lockedSuits.includes(s));

            for (const suit of suitsToTry) {
                for (let start = 1; start <= 10 - L; start++) {
                    const trialFreq = {...freq};
                    const trialNV   = {...numVarMap};
                    const trialSV   = {...suitVarMap};
                    if (slot.kName   && !trialNV[slot.kName])   trialNV[slot.kName]   = String(start);
                    if (slot.suitVar && !trialSV[slot.suitVar]) trialSV[slot.suitVar] = suit;
                    // Pick off any naturals that land in this run
                    for (let off = 0; off < L; off++) {
                        const tile = String(start + off) + suit;
                        if ((trialFreq[tile] || 0) > 0) {
                            trialFreq[tile]--;
                            if (trialFreq[tile] === 0) delete trialFreq[tile];
                        }
                    }
                    if (assign(idx + 1, trialFreq, trialNV, trialSV, jokerCapUsed)) return true;
                }
            }
            // Skip option: treat entire slot as draws
            return assign(idx + 1, freq, numVarMap, suitVarMap, jokerCapUsed);
        }

        // ── Non-identical slot (P2: NEWS, 2025-a, 369-b, etc.) ───────────────
        if (!slot.tiles.every(t => t === slot.tiles[0])) {
            const boundSuit  = slot.suitVar ? (suitVarMap[slot.suitVar] || null) : null;
            const lockedSuits = Object.entries(suitVarMap)
                .filter(([v, s]) => v !== slot.suitVar && s).map(([, s]) => s);

            // Pure honor group (no suitVar): match each position directly
            if (!slot.suitVar) {
                const trialFreq = {...freq};
                for (const ch of slot.tiles) {
                    const tile = ch === '0' ? 'WD' : ch;
                    if ((trialFreq[tile] || 0) > 0) {
                        trialFreq[tile]--;
                        if (trialFreq[tile] === 0) delete trialFreq[tile];
                    }
                }
                return assign(idx + 1, trialFreq, numVarMap, suitVarMap, jokerCapUsed);
            }

            // Suited non-identical group: try each valid suit assignment
            const suitsToTry = boundSuit ? [boundSuit]
                : ['B','C','D'].filter(s => !lockedSuits.includes(s));
            for (const suit of suitsToTry) {
                const trialFreq = {...freq};
                const trialSV   = {...suitVarMap};
                if (!trialSV[slot.suitVar]) trialSV[slot.suitVar] = suit;
                for (const ch of slot.tiles) {
                    let tile = null;
                    if (ch === '0')                      tile = 'WD';
                    else if ('FNEWS'.includes(ch))       tile = ch;
                    else if (/^\d$/.test(ch))            tile = String(parseInt(ch) + slot.offset) + suit;
                    if (tile && (trialFreq[tile] || 0) > 0) {
                        trialFreq[tile]--;
                        if (trialFreq[tile] === 0) delete trialFreq[tile];
                    }
                }
                if (assign(idx + 1, trialFreq, numVarMap, trialSV, jokerCapUsed)) return true;
            }
            // Skip option
            return assign(idx + 1, freq, numVarMap, suitVarMap, jokerCapUsed);
        }

        // ── Homogeneous slot (P4 kong/pung, P3 single, P1 pair) ──────────────
        // Try each candidate tile type first; fall back to skip (all draws).
        const candidates = pivotSlotCandidates(slot, freq, numVarMap, suitVarMap);
        for (const { tileType, maxCount, newNumVarMap, newSuitVarMap } of candidates) {
            const newFreq = {...freq};
            newFreq[tileType] -= maxCount;
            if (newFreq[tileType] <= 0) delete newFreq[tileType];
            const newJCU = jokerCapUsed + (jokable ? maxCount : 0);
            if (assign(idx + 1, newFreq, newNumVarMap, newSuitVarMap, newJCU)) return true;
        }
        // Skip: no naturals assigned to this slot (filled by draws or jokers)
        return assign(idx + 1, freq, numVarMap, suitVarMap, jokerCapUsed);
    }

    return assign(0, {...naturalFreq}, {}, {}, 0);
}

// ── Orchestrator ──────────────────────────────────────────────────────────────
function pivotHandFitsTiles(tiles, handDef) {
    let slots;
    try { slots = parsePattern(handDef.code); } catch(e) { return false; }
    if (!slots || slots.length === 0) return false;

    // Pass 1: cheap tile-identity filter
    if (!pivotPass1(slots, tiles)) return false;

    // Pass 2+3: all 8 tiles must fit (no drop)
    try { return pivotFits(tiles, slots); } catch(e) { return false; }
}

// ── Entry point ───────────────────────────────────────────────────────────────
// Drop-in replacement for computeValidHands() in pivot.html.
// Collapses suit variants (1a/1b/1c) into a single entry per base hand number.
function pivotComputeValidHands(tiles) {
    if (!ACTIVE_CARD || ACTIVE_CARD.length === 0) return [];
    const seen    = new Set();
    const results = [];
    ACTIVE_CARD.forEach(handDef => {
        if (pivotHandFitsTiles(tiles, handDef)) {
            const base = String(handDef['hand number']).replace(/[a-zA-Z]+$/, '');
            const key  = `${handDef.Section}__${base}`;
            if (!seen.has(key)) {
                seen.add(key);
                results.push({ key, section: handDef.Section, handNum: base, handDef });
            }
        }
    });
    return results;
}
