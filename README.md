# 🎯 Guess the Word Game

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Status](https://img.shields.io/badge/status-production--ready-brightgreen.svg)

**A polished, gamified word-guessing experience powered by Google Gemini AI**

[Live Demo](#) · [Report Bug](https://github.com/ShreyashPatil123/guess-word/issues) · [Request Feature](https://github.com/ShreyashPatil123/guess-word/issues)

</div>

---

## 📖 Project Overview

Guess the Word is a modern take on the classic word-guessing puzzle, featuring dynamic AI-powered word generation, multiple difficulty levels, and a comprehensive achievement system. Built with vanilla JavaScript for maximum performance and zero dependencies.

The game combines strategic thinking with time pressure, rewarding players who solve words quickly and efficiently through a sophisticated scoring algorithm.

---

## ✨ Features

| Feature                    | Description                                         |
| -------------------------- | --------------------------------------------------- |
| 🤖 **AI-Powered Words**    | Dynamic word selection via Google Gemini API        |
| 🎚️ **3 Difficulty Levels** | Easy, Medium, and Hard modes with unique challenges |
| ⏱️ **Timed Gameplay**      | Countdown timer with visual urgency effects         |
| 🏆 **15+ Achievements**    | Unlock badges for skill milestones                  |
| 📊 **Smart Scoring**       | Points based on speed, efficiency, and difficulty   |
| 🔊 **Sound Effects**       | Immersive audio feedback for actions                |
| 💾 **Auto-Save**           | Progress, stats, and achievements persist locally   |
| 📱 **Fully Responsive**    | Optimized for desktop, tablet, and mobile           |
| 🌗 **Theme Support**       | Clean, modern UI with dark/light mode ready         |

---

## 🎮 Difficulty Levels

| Level         | Letters | Attempts | Time Limit | Challenge             |
| ------------- | ------- | -------- | ---------- | --------------------- |
| 🟢 **Easy**   | 3       | 6        | 3 min      | Perfect for beginners |
| 🟡 **Medium** | 4       | 7        | 4 min      | Balanced challenge    |
| 🔴 **Hard**   | 5       | 8        | 5 min      | For word masters      |

---

## 🛠️ Tech Stack

| Layer              | Technology                      |
| ------------------ | ------------------------------- |
| **Frontend**       | HTML5, CSS3, Vanilla JavaScript |
| **Backend**        | Node.js, Express.js             |
| **Database**       | Supabase (PostgreSQL)           |
| **AI Integration** | Google Gemini API               |
| **Authentication** | MojoAuth (OTP-based)            |
| **Deployment**     | Vercel (Serverless)             |

---

## 📁 Folder Structure

```
guess-the-word/
├── index.html              # Main entry point
├── server.js               # Express backend server
├── vercel.json             # Vercel deployment config
│
├── css/
│   ├── main.css            # Global styles & variables
│   ├── animations.css      # Keyframe animations
│   ├── responsive.css      # Mobile adaptations
│   └── leaderboard.css     # Leaderboard styling
│
├── js/
│   ├── game.js             # Core game loop
│   ├── ui.js               # DOM manipulation
│   ├── auth.js             # Authentication flow
│   ├── leaderboard.js      # Rankings & stats
│   ├── gemini-api.js       # AI integration
│   ├── scoring.js          # Score calculation
│   ├── achievements.js     # Badge system
│   ├── storage.js          # LocalStorage wrapper
│   └── audio.js            # Sound effects
│
├── api/
│   ├── index.js            # Serverless API entry
│   └── cron/
│       └── cleanup.js      # Scheduled cleanup job
│
└── assets/
    ├── sounds/             # Audio files
    └── icons/              # UI icons
```

---

## 🚀 How to Run Locally

1. **Clone the repository**

   ```bash
   git clone https://github.com/ShreyashPatil123/guess-word.git
   cd guess-word
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start the development server**

   ```bash
   npm start
   ```

4. **Open in browser**
   ```
   http://localhost:3000
   ```

---

## 📸 Screenshots

> _Screenshots coming soon_

| Home Screen | Gameplay   | Leaderboard       |
| ----------- | ---------- | ----------------- |
| ![Home](#)  | ![Game](#) | ![Leaderboard](#) |

---

## 🏅 Achievements System

Unlock badges by completing challenges:

- 🎯 **First Win** — Win your first game
- ⚡ **Speed Demon** — Solve in under 30 seconds
- 🔥 **On Fire** — Win 3 games in a row
- 💯 **Perfectionist** — Solve on first attempt
- 🏆 **Word Master** — Reach 10,000 total points
- _...and 10+ more to discover!_

---

## 📜 License

This project is licensed under the MIT License.

---

## 🙏 Credits

<div align="center">

**Designed and Developed by**

### Shreyash Patil & Parag Yewale

_Built with ❤️ using Gemini AI_

</div>

---

<div align="center">

⭐ **Star this repo if you found it helpful!** ⭐

</div>
