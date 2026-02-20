const fs = require('fs');
const path = "C:\\Users\\lenovo\\.gemini\\antigravity\\scratch\\guess_the_word_dataset\\master_word_bank.md";

try {
    const content = fs.readFileSync(path, 'utf-8');
    const lines = content.split('\n');
    const categories = new Set();
    
    lines.forEach(line => {
        const match = line.match(/^##\s+CATEGORY\s+\d+:\s*(.+)/i);
        if (match) {
            // Strip emoji and trim
            const cat = match[1].replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
            categories.add(cat);
        }
    });
    
    fs.writeFileSync('categories.json', JSON.stringify(Array.from(categories), null, 2));
    console.log("Categories written to categories.json");
} catch (e) {
    console.error("Error:", e.message);
}
