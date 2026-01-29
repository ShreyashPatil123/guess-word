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
  async generateWord(length) {
    try {
      // Call our own backend proxy instead of Google directly
      const response = await fetch("/api/generate-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ length }),
      });

      if (!response.ok) throw new Error("API Request Failed");

      const data = await response.json();

      // Validate length
      if (data.word && data.word.length !== length) {
        console.warn(
          `Generated word ${data.word} length mismatch. Expected ${length}. Using fallback.`,
        );
        return this.getFallback(length);
      }

      return data.word;
    } catch (error) {
      console.error("Gemini API Error:", error);
      // Fallback
      return this.getFallback(length);
    }
  },

  getFallback(length) {
    const list = FALLBACK_WORDS[length];
    return list[Math.floor(Math.random() * list.length)];
  },
};
