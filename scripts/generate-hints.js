/**
 * Generate hints JSON from master_word_bank.md for words > 5 letters.
 * Uses category + POS from the markdown as the hint.
 * Run: node scripts/generate-hints.js
 */
const fs = require('fs');
const path = require('path');

const WORD_BANK = "C:\\Users\\lenovo\\.gemini\\antigravity\\scratch\\guess_the_word_dataset\\master_word_bank.md";
const OUTPUT = path.join(__dirname, '..', 'data', 'hints.json');

const content = fs.readFileSync(WORD_BANK, 'utf-8');
const lines = content.split('\n');

let currentCategory = "General";
const hints = {};
let count = 0;

lines.forEach(line => {
    // Track category
    const catMatch = line.match(/^##\s+CATEGORY\s+\d+:\s*(.+)/i);
    if (catMatch) {
        currentCategory = catMatch[1]
            .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
            .trim();
        return;
    }

    const parts = line.split('|').map(p => p.trim());
    if (parts.length >= 6 && parts[2]) {
        const word = parts[2].toUpperCase();
        const pos = parts[4] || "";
        if (word === 'WORD' || word === '---' || word.length <= 5) return;
        if (!/^[A-Z]{6,}$/.test(word)) return;

        // Build hint
        const hintParts = [];
        if (currentCategory && currentCategory !== "General") {
            hintParts.push(`Category: ${currentCategory}`);
        }
        if (pos && pos !== "---") {
            hintParts.push(`It's a ${pos.toLowerCase()}`);
        }
        hintParts.push(`${word.length} letters`);

        hints[word] = hintParts.join(" · ");
        count++;
    }
});

// Ensure data dir exists
const dataDir = path.dirname(OUTPUT);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

fs.writeFileSync(OUTPUT, JSON.stringify(hints, null, 2), 'utf-8');
console.log(`✅ Generated hints for ${count} words (> 5 letters)`);
console.log(`   Output: ${OUTPUT}`);
