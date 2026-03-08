// patterns.js
// Hand pattern parsing, filling, and evaluation engine.
// Depends on: ACTIVE_CARD (set by card-loader.js)

// ========================================
// PATTERN ANALYZER FUNCTIONS
// ========================================

const SUITS = ['B', 'C', 'D'];
const DRAGON_MAP = { 'B': 'GD', 'C': 'RD', 'D': 'WD' };
const JOKER = 'J';

// Helper: Check if all elements in array are identical
function allIdentical(arr) {
    return arr.every(v => v === arr[0]);
}

// Helper: Clone a Set-based map
function cloneKValueSets(kValueSets) {
    const copy = {};
    for (const k in kValueSets) {
        copy[k] = new Set(kValueSets[k] ? Array.from(kValueSets[k]) : []);
    }
    return copy;
}

// Parse a hand pattern string into groups
function parsePattern(pattern) {
    const tokens = pattern.trim().split(/\s+/).filter(s => s.length > 0);
    return tokens.map((seq, idx) => {
        const m = seq.match(/^(?:\[(\w+)\])?([xvymqr0-9NEWSFDJkK]+)(?:-([0-9]+)?([a-z])?)?(?:\(\+?(-?\d+)\))?$/i);
        if (!m) return null;
        
        const name = m[1] || null;  // Bracket name like "K1"
        const tiles = m[2].toUpperCase().split('');
        const numVar = m[3] || null;
        const suitVar = m[4] ? m[4].toUpperCase() : null;
        const offset = m[5] ? parseInt(m[5], 10) : 0;
        
        // Assign priority based on difficulty
        let priority = 4;
        if (tiles.includes('K')) priority = 1;  // K sequences hardest
        else if (tiles.length === 2) priority = 1;  // Pairs are hard
        else if (!allIdentical(tiles)) priority = 2;  // Non-identical groups (NEWS, 2025)
        else if (tiles.includes('R')) priority = 3;  // R groups
        else if (tiles.length === 1) priority = 3;  // Singles
        else if (allIdentical(tiles) && tiles.includes('Q')) priority = 3;  // Q groups

        // Promote suitVar-less suited groups to P0 so they run before any suitVar groups
        // can lock suits, preventing them from being incorrectly excluded.
        // Applies to any priority level — this year's card only triggers it at P4 but
        // future cards could have no-suitVar groups at P1/P2/P3 as well.
        const SUITED_TILES = ['D','X','V','Y','M','Q','R','K'];
        if (!suitVar && tiles.some(t => SUITED_TILES.includes(t) || /^[1-9]$/.test(t))) {
            priority = 0;
        }
        
        return { 
            raw: seq, 
            tiles, 
            numVar, 
            suitVar, 
            offset, 
            priority, 
            matchedTiles: [], 
            idx, 
            kName: name 
        };
    }).filter(g => g);
}

// Get candidate tiles from pool for a specific tile character
function candidatesForTile(tile, pool, localNumMap, localSuitMap, localKLengthMap, localRMap, group) {
    const currentSuitVar = group.suitVar;
    const lockedSuits = Object.entries(localSuitMap)
        .filter(([varName, suit]) => varName !== currentSuitVar && suit)
        .map(([_, suit]) => suit);
    
    // Handle honor tiles
    if ('NEWSF'.includes(tile)) return pool.filter(p => p === tile);
    if (tile === '0') return pool.filter(p => 'WD' === p);
    
    // Handle dragons
    if (tile === 'D') {
        const sv = group.suitVar ? localSuitMap[group.suitVar] : null;
        if (sv) return pool.filter(p => p === DRAGON_MAP[sv]);
        return pool.filter(p => {
            if (!Object.values(DRAGON_MAP).includes(p)) return false;
            const [suitKey] = Object.entries(DRAGON_MAP).find(([k, v]) => v === p);
            return !lockedSuits.includes(suitKey);
        });
    }
    
    // Handle wildcard and special number tiles
    if (['X', 'V', 'Y', 'M', 'Q', 'R'].includes(tile)) {
        let possibleNums = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
        if (tile === 'V') possibleNums = ['2', '4', '6', '8'];
        if (tile === 'Y') possibleNums = ['1', '3', '5', '7', '9'];
        if (tile === 'M') possibleNums = ['3', '6', '9'];
        
        let baseNum = null;
        if (tile === 'Q') {
            // Q references last number of K sequence
            if (group.kName && localNumMap[group.kName] && localKLengthMap[group.kName] !== undefined) {
                const start = parseInt(localNumMap[group.kName], 10);
                const klen = localKLengthMap[group.kName];
                baseNum = start + klen;
                if (group.offset) baseNum += group.offset;
            } else return [];
        } else if (tile === 'R') {
            // R references random number from K sequence
            if (group.kName && localRMap && localRMap[group.kName] !== undefined) {
                baseNum = localRMap[group.kName] + group.offset;
            } else return [];
        } else {
            // Regular wildcard
            baseNum = group.numVar && localNumMap[group.numVar] ? parseInt(localNumMap[group.numVar]) + group.offset : null;
        }
        
        if (baseNum !== null) {
            if (baseNum >= 1 && baseNum <= 9 && possibleNums.includes(String(baseNum))) {
                possibleNums = [String(baseNum)];
            } else return [];
        }
        
        // Match suited tiles
        const sv = group.suitVar ? localSuitMap[group.suitVar] : null;
        if (sv) {
            return pool.filter(p => {
                if (p.length !== 2 || p[1] !== sv) return false;
                return possibleNums.includes(p[0]);
            });
        } else {
            return pool.filter(p => {
                if (p.length !== 2) return false;
                if (lockedSuits.includes(p[1])) return false;
                return possibleNums.includes(p[0]);
            });
        }
    }
    
    // Handle literal number tiles
    if (/^\d$/.test(tile)) {
        const num = tile;
        const sv = group.suitVar ? localSuitMap[group.suitVar] : null;
        if (sv) {
            return pool.filter(p => p === num + sv);
        } else {
            return pool.filter(p => {
                if (p.length !== 2 || p[0] !== num) return false;
                return !lockedSuits.includes(p[1]);
            });
        }
    }
    
    return [];
}

// Fill a single group with tiles from the hand pool
function fillGroup(group, handPool, numVarMap, suitVarMap, kLengthMap, rVarMap, kValueSets) {
    const results = [];

    // Helper to identify suits ALREADY locked by *other* suit variables.
    const currentSuitVar = group.suitVar;
    const lockedSuits = Object.entries(suitVarMap)
        .filter(([varName, suit]) => varName !== currentSuitVar && suit)
        .map(([_, suit]) => suit);

    if (group.tiles.includes('K')) {
        const L = group.tiles.filter(t => t === 'K').length;
        const possibleSuits = group.suitVar && suitVarMap[group.suitVar] ? [suitVarMap[group.suitVar]] : SUITS;

        possibleSuits.forEach(suit => {
            // Critical check: Skip this suit if it's locked by another variable
            if (group.suitVar && !suitVarMap[group.suitVar] && lockedSuits.includes(suit)) {
                return; 
            }

            for (let start = 1; start <= 10 - L; start++) {
                const matched = [];
                const usedIndices = new Set();
                let presentCount = 0;
                for (let off = 0; off < L; off++) {
                    const num = String(start + off);
                    const idx = handPool.findIndex((t, i) => !usedIndices.has(i) && t === num + suit);
                    if (idx >= 0) { matched.push(handPool[idx]); usedIndices.add(idx); presentCount++; }
                    else matched.push('?');
                }

                // Accept this run if we have at least 1 natural tile, OR if there
                // are enough jokers in the pool to cover every missing slot.
                const jokersInPool = handPool.filter(t => t === JOKER).length;
                const missingCount = matched.filter(t => t === '?').length;
                const canFillWithJokers = jokersInPool >= missingCount;
                if (presentCount >= 1 || canFillWithJokers) {
                    const newGroup = { ...group, matchedTiles: matched };
                    const newPool = handPool.filter((_, i) => !usedIndices.has(i));
                    const newNumMap = { ...numVarMap };
                    if (group.kName && !newNumMap[group.kName]) newNumMap[group.kName] = String(start);
                    const newSuitMap = { ...suitVarMap };
                    if (group.suitVar && !newSuitMap[group.suitVar] && matched.some(t => t !== '?')) newSuitMap[group.suitVar] = suit;
                    const newKLenMap = { ...kLengthMap };
                    if (group.kName && newKLenMap[group.kName] === undefined) newKLenMap[group.kName] = L;

                    const newKValueSets = cloneKValueSets(kValueSets);
                    if (group.kName && !newKValueSets[group.kName]) newKValueSets[group.kName] = new Set();
                    matched.forEach(t => {
                        if (t !== '?') newKValueSets[group.kName].add(parseInt(t[0], 10));
                    });

                    results.push({
                        group: newGroup,
                        handPool: newPool,
                        numVarMap: newNumMap,
                        suitVarMap: newSuitMap,
                        kLengthMap: newKLenMap,
                        rVarMap: { ...rVarMap },
                        kValueSets: newKValueSets
                    });
                }
            }
        });

    } else {
        // recursive assignment for non-K groups
        function assignTile(i, matchedSoFar, poolSoFar, localNumMap, localSuitMap, localKLenMap, localRMap, localKValueSets) {
            if (i >= group.tiles.length) {
                results.push({
                    group: { ...group, matchedTiles: [...matchedSoFar] },
                    handPool: poolSoFar,
                    numVarMap: localNumMap,
                    suitVarMap: localSuitMap,
                    kLengthMap: localKLenMap,
                    rVarMap: localRMap,
                    kValueSets: localKValueSets
                });
                return;
            }

            const tile = group.tiles[i];

            // Special handling for R when we need to pick from K values
            if (tile === 'R' && group.kName && (!localRMap || localRMap[group.kName] === undefined)) {
                const kValues = localKValueSets && localKValueSets[group.kName] ? localKValueSets[group.kName] : null;
                if (!kValues || kValues.size === 0) {
                    // No known K values -> can't resolve R now; put '?'
                    assignTile(i + 1, [...matchedSoFar, '?'], poolSoFar, { ...localNumMap }, { ...localSuitMap }, { ...localKLenMap }, { ...localRMap }, cloneKValueSets(localKValueSets));
                    return;
                }

                // iterate each numeric value found in the referenced K set
                Array.from(kValues).forEach(val => {
                    const chosenNum = val;
                    const newRMap = { ...localRMap }; newRMap[group.kName] = chosenNum;
                    const cands = candidatesForTile('R', poolSoFar, localNumMap, localSuitMap, localKLenMap, newRMap, group);

                    if (cands.length === 0) {
                        assignTile(i + 1, [...matchedSoFar, '?'], poolSoFar, { ...localNumMap }, { ...localSuitMap }, { ...localKLenMap }, newRMap, cloneKValueSets(localKValueSets));
                    } else {
                        for (let j = 0; j < poolSoFar.length; j++) {
                            const cand = poolSoFar[j];
                            if (!cands.includes(cand)) continue;
                            const newPool = poolSoFar.slice(); newPool.splice(j, 1);
                            const newNumMap = { ...localNumMap }, newSuitMap = { ...localSuitMap };
                            if (group.suitVar && !newSuitMap[group.suitVar]) newSuitMap[group.suitVar] = cand[1];
                            assignTile(i + 1, [...matchedSoFar, cand], newPool, newNumMap, newSuitMap, localKLenMap, newRMap, cloneKValueSets(localKValueSets));
                        }
                    }
                });

                return;
            }

            // Normal candidate resolution
            const cands = candidatesForTile(tile, poolSoFar, localNumMap, localSuitMap, localKLenMap, localRMap, group);
            if (cands.length === 0) {
                assignTile(i + 1, [...matchedSoFar, '?'], poolSoFar, { ...localNumMap }, { ...localSuitMap }, { ...localKLenMap }, { ...localRMap }, cloneKValueSets(localKValueSets));
                return;
            }

            for (let j = 0; j < poolSoFar.length; j++) {
                const cand = poolSoFar[j];
                if (!cands.includes(cand)) continue;
                const newPool = poolSoFar.slice(); newPool.splice(j, 1);
                const newNumMap = { ...localNumMap }, newSuitMap = { ...localSuitMap }, newRMap = { ...localRMap };
                const newKValueSets2 = cloneKValueSets(localKValueSets);

                // preserve variable assignment behavior exactly as before
                if (['X', 'V', 'Y', 'M'].includes(tile)) {
                    if (group.numVar && !newNumMap[group.numVar]) newNumMap[group.numVar] = String(parseInt(cand[0]) - group.offset);
                    if (group.suitVar && !newSuitMap[group.suitVar]) newSuitMap[group.suitVar] = cand[1];
                } else if (tile === 'R') {
                    if (group.suitVar && !newSuitMap[group.suitVar]) newSuitMap[group.suitVar] = cand[1];
                } else if (tile === 'Q') { // Q must assign suit
                    if (group.suitVar && !newSuitMap[group.suitVar]) newSuitMap[group.suitVar] = cand[1];
                } else if (!isNaN(parseInt(tile))) {
                    if (group.suitVar && !newSuitMap[group.suitVar]) newSuitMap[group.suitVar] = cand[1];
                } else if (tile === 'D') {
                    if (group.suitVar && !newSuitMap[group.suitVar]) newSuitMap[group.suitVar] = Object.entries(DRAGON_MAP).find(([k, v]) => v === cand)[0];
                }

                assignTile(i + 1, [...matchedSoFar, cand], newPool, newNumMap, newSuitMap, localKLenMap, newRMap, newKValueSets2);
            }
        }

        // initial call: clone incoming kValueSets so branch copies are safe
        assignTile(0, [], handPool, { ...numVarMap }, { ...suitVarMap }, { ...kLengthMap }, { ...rVarMap }, cloneKValueSets(kValueSets));
    }

    return results;
}

// Evaluate how well a hand matches a pattern
function evaluatePattern(hand, pattern) {
    const groups = parsePattern(pattern);
    const kLenCheck = {};
    groups.forEach(g => {
        if (g.kName && g.tiles.includes('K')) {
            const L = g.tiles.filter(t => t === 'K').length;
            if (kLenCheck[g.kName] === undefined) kLenCheck[g.kName] = L;
            else if (kLenCheck[g.kName] !== L) throw new Error('Invalid pattern: K groups sharing the same name must have the same length.');
        }
    });

    let states = [{ handPool: [...hand], numVarMap: {}, suitVarMap: {}, kLengthMap: kLenCheck, rVarMap: {}, kValueSets: {}, groups: groups.map(g => ({ ...g })) }];
    const priorities = [0, 1, 2, 3, 4];

    priorities.forEach(priority => {
        const newStates = [];
        states.forEach(state => {
            const pGroups = state.groups.filter(g => g.priority === priority);
            // Sort groups by tile count (descending) to prioritize larger groups
            pGroups.sort((a, b) => b.tiles.length - a.tiles.length);
            if (pGroups.length === 0) { newStates.push(state); return; }

            let partialStates = [{ handPool: state.handPool, numVarMap: { ...state.numVarMap }, suitVarMap: { ...state.suitVarMap }, kLengthMap: { ...state.kLengthMap }, rVarMap: { ...state.rVarMap }, kValueSets: { ...state.kValueSets }, groups: [] }];
            pGroups.forEach(g => {
                const temp = [];
                partialStates.forEach(ps => {
                    const fills = fillGroup(g, ps.handPool, ps.numVarMap, ps.suitVarMap, ps.kLengthMap, ps.rVarMap, ps.kValueSets);
                    fills.forEach(f => {
                        temp.push({ handPool: f.handPool, numVarMap: f.numVarMap, suitVarMap: f.suitVarMap, kLengthMap: f.kLengthMap, rVarMap: f.rVarMap, kValueSets: f.kValueSets, groups: [...ps.groups, f.group] });
                    });
                });
                if (temp.length === 0) {
                    partialStates = partialStates.map(ps => ({ ...ps, groups: [...ps.groups, { ...g, matchedTiles: Array(g.tiles.length).fill('?') }] }));
                    return;
                }
                // For Priority 4 and 0, keep ALL possible fills to explore all combinations
                // For other priorities, keep only the best fills for this group
                if (priority === 4 || priority === 0) {
                    partialStates = temp;
                } else {
                    const maxFilled = Math.max(...temp.map(t => t.groups[t.groups.length - 1].matchedTiles.filter(x => x !== '?').length));
                    partialStates = temp.filter(t => t.groups[t.groups.length - 1].matchedTiles.filter(x => x !== '?').length === maxFilled);
                }
            });
            partialStates.forEach(ps => {
                const otherGroups = state.groups.filter(g => g.priority !== priority);
                newStates.push({ handPool: ps.handPool, numVarMap: ps.numVarMap, suitVarMap: ps.suitVarMap, kLengthMap: ps.kLengthMap, rVarMap: ps.rVarMap, kValueSets: ps.kValueSets, groups: [...ps.groups, ...otherGroups] });
            });
        });
        states = newStates;
    });

    states.forEach(s => {
        s.totalFilled = s.groups.reduce((acc, g) => acc + g.matchedTiles.filter(t => t !== '?').length, 0);
        // Calculate MISSING counts by priority for better comparison
        // Missing = total tiles in that priority level - filled tiles
        s.p0Missing = s.groups.filter(g => g.priority === 0).reduce((acc, g) => acc + g.matchedTiles.filter(t => t === '?').length, 0);
        s.p1Missing = s.groups.filter(g => g.priority === 1).reduce((acc, g) => acc + g.matchedTiles.filter(t => t === '?').length, 0);
        s.p2Missing = s.groups.filter(g => g.priority === 2).reduce((acc, g) => acc + g.matchedTiles.filter(t => t === '?').length, 0);
        s.p3Missing = s.groups.filter(g => g.priority === 3).reduce((acc, g) => acc + g.matchedTiles.filter(t => t === '?').length, 0);
        s.p4Missing = s.groups.filter(g => g.priority === 4).reduce((acc, g) => acc + g.matchedTiles.filter(t => t === '?').length, 0);
        
        // Also keep filled counts for backward compatibility
        s.p0Filled = s.groups.filter(g => g.priority === 0).reduce((acc, g) => acc + g.matchedTiles.filter(t => t !== '?').length, 0);
        s.p1Filled = s.groups.filter(g => g.priority === 1).reduce((acc, g) => acc + g.matchedTiles.filter(t => t !== '?').length, 0);
        s.p2Filled = s.groups.filter(g => g.priority === 2).reduce((acc, g) => acc + g.matchedTiles.filter(t => t !== '?').length, 0);
        s.p3Filled = s.groups.filter(g => g.priority === 3).reduce((acc, g) => acc + g.matchedTiles.filter(t => t !== '?').length, 0);
        s.p4Filled = s.groups.filter(g => g.priority === 4).reduce((acc, g) => acc + g.matchedTiles.filter(t => t !== '?').length, 0);
    });
    // Sort by LEAST missing at each priority level (ascending order)
    // This favors patterns that are closest to complete at each priority
    states.sort((a, b) => {
        if (a.p0Missing !== b.p0Missing) return a.p0Missing - b.p0Missing;
        if (a.p1Missing !== b.p1Missing) return a.p1Missing - b.p1Missing;
        if (a.p2Missing !== b.p2Missing) return a.p2Missing - b.p2Missing;
        if (a.p3Missing !== b.p3Missing) return a.p3Missing - b.p3Missing;
        if (a.p4Missing !== b.p4Missing) return a.p4Missing - b.p4Missing;
        return b.totalFilled - a.totalFilled; // Tiebreaker: most filled overall
    });

    const uniqueHands = [];
    const seen = new Set();
    states.forEach(s => {
        const key = JSON.stringify({ groups: s.groups.map(g => g.matchedTiles), handPool: s.handPool });
        if (!seen.has(key)) { seen.add(key); uniqueHands.push(s); }
    });

    return uniqueHands.map(s => ({
        groups: s.groups,
        handPool: s.handPool,
        numVarMap: s.numVarMap,
        suitVarMap: s.suitVarMap,
        kLengthMap: s.kLengthMap,
        rVarMap: s.rVarMap,
        jokersRemaining: s.handPool.filter(t => t === JOKER).length,
        totalFilled: s.totalFilled,
        p0Filled: s.p0Filled,
        p1Filled: s.p1Filled,
        p2Filled: s.p2Filled,
        p3Filled: s.p3Filled,
        p4Filled: s.p4Filled,
        p0Missing: s.p0Missing,
        p1Missing: s.p1Missing,
        p2Missing: s.p2Missing,
        p3Missing: s.p3Missing,
        p4Missing: s.p4Missing
    }));
}

// Use jokers intelligently to fill missing tiles (Priority 4 first, then 3, 2, 1)
function useJokersForScoring(result, jokersAvailable) {
    if (!jokersAvailable || jokersAvailable === 0) return result;
    
    let jokersUsed = 0;
    const enhancedGroups = result.groups.map(g => ({ ...g, matchedTiles: [...g.matchedTiles] }));
    
    // Priority order: fill Priority 4 (easiest) first
    for (let priority = 4; priority >= 1 && jokersUsed < jokersAvailable; priority--) {
        for (const group of enhancedGroups) {
            if (group.priority !== priority) continue;
            
            // Can only use jokers for groups of 3+ identical tiles
            const canUseJokers = (priority === 4 || priority === 3) && allIdentical(group.tiles) && group.tiles.length >= 3;
            
            if (canUseJokers) {
                for (let i = 0; i < group.matchedTiles.length && jokersUsed < jokersAvailable; i++) {
                    if (group.matchedTiles[i] === '?') {
                        group.matchedTiles[i] = 'J';
                        jokersUsed++;
                    }
                }
            }
        }
    }
    
    // Recalculate statistics
    const totalFilled = enhancedGroups.reduce((sum, g) => sum + g.matchedTiles.filter(t => t !== '?').length, 0);
    const p1Missing = enhancedGroups.filter(g => g.priority === 1).reduce((sum, g) => sum + g.matchedTiles.filter(t => t === '?').length, 0);
    const p2Missing = enhancedGroups.filter(g => g.priority === 2).reduce((sum, g) => sum + g.matchedTiles.filter(t => t === '?').length, 0);
    const p3Missing = enhancedGroups.filter(g => g.priority === 3).reduce((sum, g) => sum + g.matchedTiles.filter(t => t === '?').length, 0);
    const p4Missing = enhancedGroups.filter(g => g.priority === 4).reduce((sum, g) => sum + g.matchedTiles.filter(t => t === '?').length, 0);
    
    return {
        groups: enhancedGroups,
        handPool: result.handPool.filter(t => t !== JOKER).concat(Array(jokersAvailable - jokersUsed).fill(JOKER)),
        jokersRemaining: jokersAvailable - jokersUsed,
        jokersUsed: jokersUsed,
        totalFilled: totalFilled,
        p1Missing: p1Missing,
        p2Missing: p2Missing,
        p3Missing: p3Missing,
        p4Missing: p4Missing
    };
}

// Evaluate all hands and find best matches
function evaluateBestMatch(hand, topN = 5, lockedGroups = []) {
    const allMatches = [];
    const jokersInHand = hand.filter(t => t === 'J').length;
    
    ACTIVE_CARD.forEach(handDef => {
        try {
            // Skip "quints" section if no jokers (quints require 5 of a kind)
            if (handDef.Section.toLowerCase() === 'quints' && jokersInHand === 0) {
                return;
            }
            
            const rawResults = evaluatePattern(hand, handDef.code);
            const results = filterFillsForLockedGroups(rawResults, lockedGroups);
            if (!results || results.length === 0) return; // no fill compatible with locked groups

            let result = results[0];
            
            // Use jokers to enhance the result
            if (jokersInHand > 0) {
                result = useJokersForScoring(result, jokersInHand);
            }
            
            // Calculate score using priority-based formula
            const score = (result.totalFilled * 10) - 
                         (result.p1Missing * 5 + 
                          result.p2Missing * 5 + 
                          result.p3Missing * 1 + 
                          result.p4Missing * 1 +
                          (result.singleMissing || 0) * 4); // singles: -1 from p3 + -4 extra = -5 total
            
            // Apply closed hand PENALTY (harder to complete, can't call tiles)
            // Closed hands can only call for mahjong, making them very inflexible
            const finalScore = handDef.status === 'closed' ? score * 0.7 : score;
            
            const tilesNeeded = 14 - result.totalFilled;
            
            allMatches.push({
                score: finalScore,
                pattern: handDef,
                result: result,
                tilesNeeded: tilesNeeded,
                tilesFilled: result.totalFilled,
                jokersUsed: result.jokersUsed || 0
            });
        } catch (err) {
            // Skip problematic patterns
            console.error(`Error evaluating pattern ${handDef.code}:`, err);
        }
    });
    
    // Sort by score descending and return top N
    allMatches.sort((a, b) => b.score - a.score);
    const topMatches = allMatches.slice(0, topN);
    
    // Calculate flexibility score (sum of top 3)
    const flexibilityScore = topMatches.slice(0, 3).reduce((sum, match) => sum + match.score, 0);
    
    return {
        topMatches: topMatches,
        flexibilityScore: flexibilityScore,
        bestMatch: topMatches[0] || null
    };
}
