
const fs = require('fs');
const path = "C:\\Users\\lenovo\\.gemini\\antigravity\\scratch\\guess_the_word_dataset\\master_word_bank.md";

try {
    const content = fs.readFileSync(path, 'utf-8');
    const lines = content.split('\n');
    let currentCategory = "Unknown";
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.match(/^##\s+CATEGORY/i)) {
            currentCategory = line.trim();
        }
        if (line.toUpperCase().includes('| INFRARED |')) {
            console.log(`Found INFRARED at line ${i+1}`);
            console.log(`Category: ${currentCategory}`);
            console.log(`Line: ${line.trim()}`);
            break;
        }
    }
} catch (e) {
    console.error("Error:", e.message);
}
