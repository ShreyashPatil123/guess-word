// API key configured on server-side via environment variables

// Fallback lists if API fails or quota exceeded
const FALLBACK_WORDS = {
  3: ["CAT", "DOG", "SUN", "RUN", "SKY", "CUP", "BOX", "HAT", "RED", "JOY"],
  4: [
    "BIRD",
    "CODE",
    "GAME",
    "LOVE",
    "BLUE",
    "WIND",
    "SONG",
    "FIRE",
    "SNOW",
    "LION",
  ],
  5: [
    "HAPPY",
    "SMILE",
    "WORLD",
    "TIGER",
    "BEACH",
    "MUSIC",
    "WATER",
    "DANCE",
    "EARTH",
    "PEACE",
  ],
};

const GeminiAPI = {
  async generateWord(length, excludeWords = []) {
    try {
      console.log(`[API] Generating ${length}-letter word, excluding ${excludeWords.length} words`);

      // Call our own backend proxy instead of Google directly
      const response = await fetch("/api/generate-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          length,
          excludeWords: excludeWords  // Send exclusion list to backend
        }),
      });

      if (!response.ok) throw new Error("API Request Failed");

      const data = await response.json();

      // Validate length
      if (data.word && data.word.length !== length) {
        console.warn(
          `Generated word ${data.word} length mismatch. Expected ${length}. Using fallback.`,
        );
        return this.getFallback(length, excludeWords);
      }

      const word = data.word.toUpperCase();

      // Verify word is not in exclusion list
      if (excludeWords.includes(word)) {
        console.warn('[API] Generated word was in exclusion list, using fallback');
        return this.getFallback(length, excludeWords);
      }

      console.log(`[API] Generated: ${word}`);
      return word;

    } catch (error) {
      console.error("Gemini API Error:", error);
      // Fallback with exclusion filtering
      return this.getFallback(length, excludeWords);
    }
  },

  getFallback(length, excludeWords = []) {
    const list = FALLBACK_WORDS[length];

    if (!list || list.length === 0) {
      console.error(`[API] No fallback words for length ${length}`);
      return null;
    }

    // Filter out excluded words
    const availableWords = list.filter(word => 
      !excludeWords.includes(word.toUpperCase())
    );

    console.log(`[API] Fallback pool: ${availableWords.length}/${list.length} available`);

    // Handle case where all words are excluded
    if (availableWords.length === 0) {
      console.warn('[API] All fallback words excluded, resetting for this difficulty');
      // Return random word from full list (reset scenario)
      const randomWord = list[Math.floor(Math.random() * list.length)];
      console.log(`[API] Reset fallback: ${randomWord}`);
      return randomWord;
    }

    // Return random word from available pool
    const randomWord = availableWords[Math.floor(Math.random() * availableWords.length)];
    console.log(`[API] Selected fallback: ${randomWord}`);
    return randomWord;
  },

  // Validate word is suitable (not in history)
  validateWord(word, excludeWords) {
    const upperWord = word.toUpperCase();

    if (excludeWords.includes(upperWord)) {
      console.warn(`[API] Word ${upperWord} is in exclusion list`);
      return false;
    }

    return true;
  }
};
