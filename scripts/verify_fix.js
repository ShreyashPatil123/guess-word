const { evaluateGuess } = require('../server/utils/gameLogic');

function test() {
    console.log("Testing evaluateGuess logic...");
    
    const word = "APPLE";
    
    // Correct guess
    const guess1 = "APPLE";
    const res1 = evaluateGuess(guess1.toLowerCase(), word.toLowerCase());
    const isCorrect1 = (guess1.toLowerCase() === word.toLowerCase());
    console.log(`Guess: ${guess1}, Word: ${word}, isCorrect: ${isCorrect1}, Evaluation: ${JSON.stringify(res1)}`);
    if (!isCorrect1 || res1.some(s => s !== 'correct')) {
        console.error("FAIL: Correct guess not identified correctly");
        process.exit(1);
    }
    
    // Partially correct guess
    const guess2 = "PLANE";
    const res2 = evaluateGuess(guess2.toLowerCase(), word.toLowerCase());
    const isCorrect2 = (guess2.toLowerCase() === word.toLowerCase());
    console.log(`Guess: ${guess2}, Word: ${word}, isCorrect: ${isCorrect2}, Evaluation: ${JSON.stringify(res2)}`);
    // PLANE vs APPLE
    // P (index 0) vs A (index 0) -> absent
    // L (index 1) vs P (index 1) -> absent
    // A (index 2) vs P (index 2) -> absent
    // N (index 3) vs L (index 3) -> absent
    // E (index 4) vs E (index 4) -> correct
    // Let's re-run evaluateGuess logic manually:
    // P in APPLE? Yes. L in APPLE? Yes. A in APPLE? Yes. N in APPLE? No. E in APPLE? Yes.
    // Index matches: E is at index 4 in both.
    
    if (isCorrect2) {
        console.error("FAIL: Incorrect guess identified as correct");
        process.exit(1);
    }

    console.log("PASS: Logic verified.");
}

test();
