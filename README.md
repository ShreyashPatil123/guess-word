# Guess the Word Game

A professional, engaging word-guessing game (similar to Wordle) with multiple difficulty levels, gamification elements, and Gemini API integration for dynamic word selection.

## Features

- **Dynamic Word Generation**: Powered by Google's Gemini API.
- **Three Difficulty Levels**:
  - Easy (3 letters, 6 attempts, 3 min)
  - Medium (4 letters, 7 attempts, 4 min)
  - Hard (5 letters, 8 attempts, 5 min)
- **Engaging Gameplay**:
  - Countdown timer with urgency effects.
  - Scoring system with time and efficiency bonuses.
  - 15+ Unlockable Achievements.
  - Sound effects and animations.
- **Modern UI/UX**:
  - Responsive design for Desktop, Tablet, and Mobile.
  - Dark/Light mode ready (defaulting to light).
- **Persistence**: Saves progress, stats, and achievements locally.

## Setup Instructions

1.  **Get a Gemini API Key**:
    - Visit [Google AI Studio](https://aistudio.google.com/).
    - Create a new API key.
2.  **Configure the Game**:
    - Open `js/gemini-api.js`.
    - Replace the `API_KEY` constant with your actual key.
    - _(Note: In a production environment, never expose your API key in client-side code like this. This is for local demonstration only.)_
3.  **Run Locally**:
    - Simply open `index.html` in a modern web browser (Chrome, Edge, Firefox).
    - No build process required (Vanilla JS/CSS).

## Directory Structure

```
guess-the-word-game/
├── index.html          # Main game entry point
├── css/                # Stylesheets
│   ├── main.css        # Global styles
│   ├── animations.css  # Keyframes
│   └── responsive.css  # Mobile adaptations
├── js/                 # Game Logic
│   ├── game.js         # Core loop
│   ├── ui.js           # UI updates
│   ├── gemini-api.js   # API integration
│   ├── storage.js      # LocalStorage wrapper
│   ├── achievements.js # Achievement system
│   └── audio.js        # Sound effects
└── assets/             # Media resources
```

## Credits

Designed and developed with Gemini and Antigravity.
