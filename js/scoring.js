const ScoringSystem = {
    config: {
        3: { maxScore: 300, multiplier: 1.0 },
        4: { maxScore: 450, multiplier: 1.3 },
        5: { maxScore: 650, multiplier: 1.7 }
    },

    attemptMultipliers: [1.0, 0.8, 0.6, 0.4, 0.25], // 0-indexed, so attempt 1 is index 0
    lastAttemptMultiplier: 0.1,

    calculateWordScore({
        difficulty,
        attemptsUsed = 0, // 1-based count
        maxAttempts = 6,
        isSolved = false,
        remainingTime = 0,
        totalTime = 0,
        // New params for Partial Alphabet Scoring
        guesses = [], // Array of { word, evaluation }
        targetWord = '' 
    }) {
        const diffConfig = this.config[difficulty];
        if (!diffConfig) {
            console.error(`Invalid difficulty: ${difficulty}`);
            return { wordScore: 0, breakdown: {} };
        }

        // --- 1. FULL WORD SCORE (Existing Logic) ---
        let fullWordScore = 0;
        let attemptScore = 0;
        let speedBonus = 0;

        if (isSolved) {
            // Attempt Multiplier
            let attemptMult = 0;
            if (attemptsUsed >= maxAttempts) {
                attemptMult = this.lastAttemptMultiplier;
            } else {
                const idx = attemptsUsed - 1;
                attemptMult = (idx < this.attemptMultipliers.length) ? this.attemptMultipliers[idx] : 0.1;
            }
            if (attemptsUsed === maxAttempts) attemptMult = this.lastAttemptMultiplier;

            attemptScore = diffConfig.maxScore * diffConfig.multiplier * attemptMult;

            // Speed Bonus
            if (totalTime > 0 && remainingTime > 0) {
                const maxSpeedBonus = diffConfig.maxScore * 0.2;
                let rawBonus = (remainingTime / totalTime) * maxSpeedBonus;
                if (rawBonus > maxSpeedBonus) rawBonus = maxSpeedBonus;
                speedBonus = rawBonus;
            }

            fullWordScore = attemptScore + speedBonus;
        }

        // --- 2. PARTIAL ALPHABET SCORE (New Additive Logic) ---
        let partialAlphabetScore = 0;
        
        if (targetWord && guesses.length > 0) {
            const uniqueChars = [...new Set(targetWord.split(''))];
            let rawPartial = 0;

            uniqueChars.forEach(char => {
                let bestStatus = 'gray';
                let foundAtIndex = -1; // 0-based guess index

                // Find earliest discovery of best state
                guesses.forEach((guessObj, gIdx) => {
                    const word = guessObj.word;
                    const evalArr = guessObj.evaluation;
                    
                    // Check occurrences of char in this guess
                    for (let i = 0; i < word.length; i++) {
                        if (word[i] === char) {
                            const status = evalArr[i]; // 'correct', 'present', 'absent'
                            
                            if (status === 'correct') {
                                if (bestStatus !== 'correct') {
                                    bestStatus = 'correct';
                                    foundAtIndex = gIdx; 
                                }
                                // If already correct, ignore later discoveries (we want earliest)
                            } else if (status === 'present') {
                                if (bestStatus !== 'correct' && bestStatus !== 'present') {
                                    bestStatus = 'present';
                                    foundAtIndex = gIdx;
                                }
                            }
                        }
                    }
                });

                if (foundAtIndex !== -1) {
                    const basePoints = (bestStatus === 'correct') ? 15 : 8;
                    // Weight: (max - attemptIndex + 1) / max. attemptIndex is 1-based (foundAtIndex + 1)
                    const attemptIndex = foundAtIndex + 1;
                    const weight = (maxAttempts - attemptIndex + 1) / maxAttempts;
                    
                    rawPartial += (basePoints * weight);
                }
            });

            // Cap at 40% of maxScore
            const cap = diffConfig.maxScore * 0.40;
            partialAlphabetScore = Math.min(rawPartial, cap);
        }

        // --- 3. FINAL SCORE ---
        const finalScore = fullWordScore + partialAlphabetScore;

        return {
            wordScore: Math.round(finalScore),
            breakdown: {
                attemptScore: Math.round(attemptScore),
                speedBonus: Math.round(speedBonus),
                fullWordScore: Math.round(fullWordScore),
                partialAlphabetScore: Math.round(partialAlphabetScore)
            }
        };
    }
};
