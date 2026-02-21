/**
 * Shared game logic functions
 */

function evaluateGuess(guess, target) {
    const res = Array(guess.length).fill("absent");
    const targetArr = target.split("");
    const guessArr = guess.split("");

    // 1. Find Greens
    guessArr.forEach((char, i) => {
        if (char === targetArr[i]) {
            res[i] = "correct";
            targetArr[i] = null;
            guessArr[i] = null;
        }
    });

    // 2. Find Yellows
    guessArr.forEach((char, i) => {
        if (char && targetArr.includes(char)) {
            res[i] = "present";
            const idx = targetArr.indexOf(char);
            targetArr[idx] = null;
        }
    });

    return res;
}

module.exports = {
    evaluateGuess
};
