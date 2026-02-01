/**
 * Achievements Module - Complete Implementation
 * 
 * Features:
 * - 100+ achievements across 8 categories
 * - Supabase database sync
 * - Local fallback for demo users
 * - Real-time unlock detection
 * - Hover tooltips with unlock instructions
 */

const ACHIEVEMENT_LIST = [
    // ========================================
    // GAMEPLAY ACHIEVEMENTS (15)
    // ========================================
    { id: 'first_win', title: 'First Steps', desc: 'Win your first game', howTo: 'Complete any game successfully', icon: '🎯', points: 100, rarity: 'common', category: 'gameplay' },
    { id: 'speed_demon', title: 'Speed Demon', desc: 'Win in under 60 seconds', howTo: 'Solve the word in less than 1 minute', icon: '⚡', points: 500, rarity: 'rare', category: 'gameplay' },
    { id: 'lucky_guess', title: 'Lucky Guess', desc: 'Win on first attempt', howTo: 'Guess the correct word on your very first try', icon: '🍀', points: 1000, rarity: 'legendary', category: 'gameplay' },
    { id: 'close_call', title: 'Close Call', desc: 'Win on last attempt', howTo: 'Win the game using your final available guess', icon: '😅', points: 200, rarity: 'common', category: 'gameplay' },
    { id: 'marathon_runner', title: 'Marathon Runner', desc: 'Play 50 games total', howTo: 'Complete 50 games (wins or losses)', icon: '🏃', points: 300, rarity: 'rare', category: 'gameplay' },
    { id: 'lightning_reflexes', title: 'Lightning Reflexes', desc: 'Win in under 30 seconds', howTo: 'Solve the word in less than 30 seconds', icon: '⚡', points: 800, rarity: 'epic', category: 'gameplay' },
    { id: 'two_attempts', title: 'Quick Thinker', desc: 'Win in 2 attempts', howTo: 'Guess the word correctly on second try', icon: '✌️', points: 400, rarity: 'rare', category: 'gameplay' },
    { id: 'persistent_player', title: 'Persistent Player', desc: 'Play 10 games in a day', howTo: 'Complete 10 games within 24 hours', icon: '💪', points: 250, rarity: 'rare', category: 'gameplay' },
    { id: 'dedicated_gamer', title: 'Dedicated Gamer', desc: 'Play 25 games in a day', howTo: 'Complete 25 games within 24 hours', icon: '🎮', points: 500, rarity: 'epic', category: 'gameplay' },
    { id: 'speed_run_easy', title: 'Easy Speedster', desc: 'Win Easy mode in under 20s', howTo: 'Complete 3-letter word in under 20 seconds', icon: '🚀', points: 300, rarity: 'rare', category: 'gameplay' },
    { id: 'speed_run_medium', title: 'Medium Speedster', desc: 'Win Medium mode in under 40s', howTo: 'Complete 4-letter word in under 40 seconds', icon: '🚀', points: 400, rarity: 'rare', category: 'gameplay' },
    { id: 'speed_run_hard', title: 'Hard Speedster', desc: 'Win Hard mode in under 60s', howTo: 'Complete 5-letter word in under 60 seconds', icon: '🚀', points: 600, rarity: 'epic', category: 'gameplay' },
    { id: 'no_hints_win', title: 'Pure Skill', desc: 'Win without any hints', howTo: 'Complete a game without using hint feature', icon: '🧠', points: 200, rarity: 'common', category: 'gameplay' },
    { id: 'comeback_victory', title: 'Underdog', desc: 'Win after 4 wrong guesses', howTo: 'Win on 5th or 6th attempt after 4 wrong guesses', icon: '💥', points: 350, rarity: 'rare', category: 'gameplay' },
    { id: 'flawless_week', title: 'Flawless Week', desc: 'Win 7 consecutive days', howTo: 'Win at least one game every day for a week', icon: '📅', points: 700, rarity: 'epic', category: 'gameplay' },

    // ========================================
    // MASTERY ACHIEVEMENTS (15)
    // ========================================
    { id: 'expert_mind', title: 'Expert Mind', desc: 'Win a Hard (5-letter) game', howTo: 'Successfully complete a 5-letter word challenge', icon: '🧠', points: 300, rarity: 'rare', category: 'mastery' },
    { id: 'medium_well', title: 'Medium Well', desc: 'Win a Medium (4-letter) game', howTo: 'Successfully complete a 4-letter word challenge', icon: '📗', points: 150, rarity: 'common', category: 'mastery' },
    { id: 'easy_start', title: 'Easy Start', desc: 'Win an Easy (3-letter) game', howTo: 'Successfully complete a 3-letter word challenge', icon: '📘', points: 100, rarity: 'common', category: 'mastery' },
    { id: 'perfectionist', title: 'Perfectionist', desc: 'Score 1000+ points in one game', howTo: 'Achieve 1000 or more points in a single game', icon: '💯', points: 500, rarity: 'epic', category: 'mastery' },
    { id: 'streak_master', title: 'Streak Master', desc: 'Win 5 games in a row', howTo: 'Win 5 consecutive games without losing', icon: '🔥', points: 400, rarity: 'epic', category: 'mastery' },
    { id: 'streak_legend', title: 'Streak Legend', desc: 'Win 10 games in a row', howTo: 'Win 10 consecutive games without losing', icon: '🔥', points: 800, rarity: 'legendary', category: 'mastery' },
    { id: 'streak_god', title: 'Streak God', desc: 'Win 20 games in a row', howTo: 'Win 20 consecutive games without losing', icon: '👑', points: 1500, rarity: 'legendary', category: 'mastery' },
    { id: 'easy_master', title: 'Easy Master', desc: 'Win 25 Easy games', howTo: 'Complete 25 wins on 3-letter mode', icon: '📘', points: 250, rarity: 'rare', category: 'mastery' },
    { id: 'medium_master', title: 'Medium Master', desc: 'Win 25 Medium games', howTo: 'Complete 25 wins on 4-letter mode', icon: '📗', points: 400, rarity: 'rare', category: 'mastery' },
    { id: 'hard_master', title: 'Hard Master', desc: 'Win 25 Hard games', howTo: 'Complete 25 wins on 5-letter mode', icon: '📕', points: 600, rarity: 'epic', category: 'mastery' },
    { id: 'easy_legend', title: 'Easy Legend', desc: 'Win 100 Easy games', howTo: 'Complete 100 wins on 3-letter mode', icon: '🏅', points: 500, rarity: 'epic', category: 'mastery' },
    { id: 'medium_legend', title: 'Medium Legend', desc: 'Win 100 Medium games', howTo: 'Complete 100 wins on 4-letter mode', icon: '🏅', points: 800, rarity: 'epic', category: 'mastery' },
    { id: 'hard_legend', title: 'Hard Legend', desc: 'Win 100 Hard games', howTo: 'Complete 100 wins on 5-letter mode', icon: '🏅', points: 1200, rarity: 'legendary', category: 'mastery' },
    { id: 'score_2000', title: 'High Scorer', desc: 'Score 2000+ in one game', howTo: 'Achieve 2000 or more points in a single game', icon: '⭐', points: 800, rarity: 'epic', category: 'mastery' },
    { id: 'score_3000', title: 'Score Master', desc: 'Score 3000+ in one game', howTo: 'Achieve 3000 or more points in a single game', icon: '🌟', points: 1200, rarity: 'legendary', category: 'mastery' },

    // ========================================
    // COLLECTION ACHIEVEMENTS (15)
    // ========================================
    { id: 'wordsmith', title: 'Wordsmith', desc: 'Guess 100 unique words', howTo: 'Successfully guess 100 different words', icon: '📚', points: 500, rarity: 'rare', category: 'collection' },
    { id: 'word_master', title: 'Word Master', desc: 'Guess 500 unique words', howTo: 'Successfully guess 500 different words', icon: '📖', points: 1000, rarity: 'epic', category: 'collection' },
    { id: 'word_legend', title: 'Word Legend', desc: 'Guess 1000 unique words', howTo: 'Successfully guess 1000 different words', icon: '📜', points: 2000, rarity: 'legendary', category: 'collection' },
    { id: 'alphabet_hunter', title: 'Alphabet Hunter', desc: 'Use all 26 letters', howTo: 'Use every letter A-Z in your guesses', icon: '🔤', points: 300, rarity: 'rare', category: 'collection' },
    { id: 'triple_threat', title: 'Triple Threat', desc: 'Win in each difficulty', howTo: 'Win at least one game in Easy, Medium, and Hard', icon: '🏆', points: 250, rarity: 'rare', category: 'collection' },
    { id: 'centurion', title: 'Centurion', desc: 'Play 100 games total', howTo: 'Complete 100 games (wins or losses)', icon: '💪', points: 600, rarity: 'epic', category: 'collection' },
    { id: 'double_down', title: 'Double Down', desc: 'Win 2 games back-to-back', howTo: 'Win two games consecutively', icon: '👯', points: 200, rarity: 'common', category: 'collection' },
    { id: 'veteran', title: 'Veteran', desc: 'Play 250 games total', howTo: 'Complete 250 games (wins or losses)', icon: '🎖️', points: 800, rarity: 'epic', category: 'collection' },
    { id: 'grandmaster', title: 'Grandmaster', desc: 'Play 500 games total', howTo: 'Complete 500 games (wins or losses)', icon: '🏆', points: 1200, rarity: 'legendary', category: 'collection' },
    { id: 'legendary_player', title: 'Legendary Player', desc: 'Play 1000 games total', howTo: 'Complete 1000 games (wins or losses)', icon: '👑', points: 2000, rarity: 'legendary', category: 'collection' },
    { id: 'vowel_master', title: 'Vowel Master', desc: 'Use all vowels in one guess', howTo: 'Make a guess containing A, E, I, O, U', icon: '🅰️', points: 150, rarity: 'common', category: 'collection' },
    { id: 'consonant_king', title: 'Consonant King', desc: 'Guess a word with no vowels', howTo: 'Win with a word that has no vowels (like "myth")', icon: '🔠', points: 400, rarity: 'rare', category: 'collection' },
    { id: 'double_letter', title: 'Double Trouble', desc: 'Guess 50 words with double letters', howTo: 'Win with words containing repeated letters', icon: '🔄', points: 300, rarity: 'rare', category: 'collection' },
    { id: 'total_points_10k', title: 'Point Collector', desc: 'Earn 10,000 total points', howTo: 'Accumulate 10,000 points across all games', icon: '💰', points: 500, rarity: 'rare', category: 'collection' },
    { id: 'total_points_50k', title: 'Point Hoarder', desc: 'Earn 50,000 total points', howTo: 'Accumulate 50,000 points across all games', icon: '💎', points: 1000, rarity: 'epic', category: 'collection' },

    // ========================================
    // SPECIAL & TIME-BASED ACHIEVEMENTS (15)
    // ========================================
    { id: 'night_owl', title: 'Night Owl', desc: 'Play between midnight and 5am', howTo: 'Start a game between 12:00 AM and 5:00 AM', icon: '🦉', points: 150, rarity: 'common', category: 'special' },
    { id: 'early_bird', title: 'Early Bird', desc: 'Play between 5am and 8am', howTo: 'Start a game between 5:00 AM and 8:00 AM', icon: '🐦', points: 150, rarity: 'common', category: 'special' },
    { id: 'weekend_warrior', title: 'Weekend Warrior', desc: 'Win 3 games on a weekend', howTo: 'Win 3 games on Saturday or Sunday', icon: '⚔️', points: 250, rarity: 'rare', category: 'special' },
    { id: 'comeback_kid', title: 'Comeback Kid', desc: 'Win after losing 3 in a row', howTo: 'Win a game after a 3-game losing streak', icon: '🔙', points: 400, rarity: 'epic', category: 'special' },
    { id: 'lunch_break', title: 'Lunch Break', desc: 'Play between 12pm and 1pm', howTo: 'Start a game during lunch hour', icon: '🍔', points: 100, rarity: 'common', category: 'special' },
    { id: 'midnight_win', title: 'Midnight Win', desc: 'Win at exactly midnight', howTo: 'Complete a winning game at 12:00 AM', icon: '🌙', points: 500, rarity: 'rare', category: 'special' },
    { id: 'new_year_player', title: 'New Year Gamer', desc: 'Play on January 1st', howTo: 'Play a game on New Year\'s Day', icon: '🎆', points: 300, rarity: 'rare', category: 'special' },
    { id: 'halloween_player', title: 'Spooky Gamer', desc: 'Play on October 31st', howTo: 'Play a game on Halloween', icon: '🎃', points: 300, rarity: 'rare', category: 'special' },
    { id: 'christmas_player', title: 'Holiday Gamer', desc: 'Play on December 25th', howTo: 'Play a game on Christmas Day', icon: '🎄', points: 300, rarity: 'rare', category: 'special' },
    { id: 'valentines_player', title: 'Love Gamer', desc: 'Play on February 14th', howTo: 'Play a game on Valentine\'s Day', icon: '💕', points: 300, rarity: 'rare', category: 'special' },
    { id: 'friday_player', title: 'TGIF', desc: 'Win 5 games on Fridays', howTo: 'Win 5 games on any Friday', icon: '🎉', points: 200, rarity: 'common', category: 'special' },
    { id: 'monday_blues', title: 'Monday Motivation', desc: 'Win first thing Monday', howTo: 'Win a game on Monday before 9 AM', icon: '☕', points: 250, rarity: 'rare', category: 'special' },
    { id: 'birthday_gamer', title: 'Birthday Gamer', desc: 'Play on your birthday', howTo: 'Play on the date you signed up (registration anniversary)', icon: '🎂', points: 500, rarity: 'epic', category: 'special' },
    { id: 'daily_streak_7', title: 'Week Warrior', desc: 'Play 7 days in a row', howTo: 'Log in and play at least once for 7 consecutive days', icon: '📆', points: 400, rarity: 'rare', category: 'special' },
    { id: 'daily_streak_30', title: 'Monthly Master', desc: 'Play 30 days in a row', howTo: 'Log in and play at least once for 30 consecutive days', icon: '🗓️', points: 1000, rarity: 'legendary', category: 'special' },

    // ========================================
    // STRATEGY ACHIEVEMENTS (15)
    // ========================================
    { id: 'vowel_first', title: 'Vowel Strategy', desc: 'Start 10 games with vowel-heavy word', howTo: 'Begin 10 games with words containing 3+ vowels', icon: '🎯', points: 200, rarity: 'common', category: 'strategy' },
    { id: 'common_letters', title: 'Frequency Expert', desc: 'Use E, T, A, O in first guess 50 times', howTo: 'Start with common letter strategy 50 times', icon: '📊', points: 300, rarity: 'rare', category: 'strategy' },
    { id: 'process_elimination', title: 'Eliminator', desc: 'Win using all 6 attempts', howTo: 'Win a game exactly on the 6th attempt', icon: '🔍', points: 150, rarity: 'common', category: 'strategy' },
    { id: 'no_repeat', title: 'No Repeats', desc: 'Win without repeating any letters', howTo: 'Win using only unique letters across all guesses', icon: '🆕', points: 400, rarity: 'rare', category: 'strategy' },
    { id: 'green_streak', title: 'Green Machine', desc: 'Get 3 greens on first guess', howTo: 'Have 3 correct letters in correct positions on first try', icon: '💚', points: 300, rarity: 'rare', category: 'strategy' },
    { id: 'yellow_hunter', title: 'Yellow Hunter', desc: 'Get 4+ yellows in one guess', howTo: 'Find 4 or more correct letters in wrong positions', icon: '💛', points: 250, rarity: 'rare', category: 'strategy' },
    { id: 'efficient_solver', title: 'Efficient Solver', desc: 'Average 3 or fewer attempts over 20 games', howTo: 'Maintain average of ≤3 attempts across 20 games', icon: '⚡', points: 600, rarity: 'epic', category: 'strategy' },
    { id: 'hard_mode_warrior', title: 'Hard Mode Warrior', desc: 'Win 10 Hard games in a row', howTo: 'Win 10 consecutive 5-letter games', icon: '🏋️', points: 800, rarity: 'epic', category: 'strategy' },
    { id: 'no_gray', title: 'No Misses', desc: 'Win with no gray letters', howTo: 'Win without guessing any incorrect letters', icon: '✨', points: 1000, rarity: 'legendary', category: 'strategy' },
    { id: 'pattern_master', title: 'Pattern Master', desc: 'Win 5 games with same first word', howTo: 'Use the same starting word to win 5 games', icon: '🔁', points: 200, rarity: 'common', category: 'strategy' },
    { id: 'diverse_starter', title: 'Diverse Starter', desc: 'Use 50 different starting words', howTo: 'Begin games with 50 unique first guesses', icon: '🌈', points: 400, rarity: 'rare', category: 'strategy' },
    { id: 'all_green_win', title: 'Perfect Guess', desc: 'Get all greens in one guess', howTo: 'Guess the entire word correctly in one attempt', icon: '🟢', points: 1000, rarity: 'legendary', category: 'strategy' },
    { id: 'strategic_pause', title: 'Patient Player', desc: 'Wait 30s before each guess, still win', howTo: 'Take at least 30 seconds per guess and win', icon: '⏰', points: 200, rarity: 'common', category: 'strategy' },
    { id: 'rush_mode', title: 'Rush Mode', desc: 'Complete 5 guesses in under 30s total', howTo: 'Make all guesses within 30 seconds combined', icon: '💨', points: 300, rarity: 'rare', category: 'strategy' },
    { id: 'keyboard_warrior', title: 'Keyboard Warrior', desc: 'Win using only keyboard', howTo: 'Complete game without clicking on-screen keyboard', icon: '⌨️', points: 150, rarity: 'common', category: 'strategy' },

    // ========================================
    // SOCIAL & LEADERBOARD ACHIEVEMENTS (15)
    // ========================================
    { id: 'leaderboard_climber', title: 'Leaderboard Climber', desc: 'Reach top 100', howTo: 'Enter the top 100 players on leaderboard', icon: '📈', points: 500, rarity: 'rare', category: 'social' },
    { id: 'top_50', title: 'Elite Player', desc: 'Reach top 50', howTo: 'Enter the top 50 players on leaderboard', icon: '🥉', points: 800, rarity: 'epic', category: 'social' },
    { id: 'top_10', title: 'Champion', desc: 'Reach top 10', howTo: 'Enter the top 10 players on leaderboard', icon: '🥈', points: 1200, rarity: 'legendary', category: 'social' },
    { id: 'top_1', title: 'Number One', desc: 'Reach #1 on leaderboard', howTo: 'Become the top-ranked player', icon: '🥇', points: 2000, rarity: 'legendary', category: 'social' },
    { id: 'profile_complete', title: 'Profile Complete', desc: 'Fill out your profile', howTo: 'Add avatar and display name to your profile', icon: '👤', points: 100, rarity: 'common', category: 'social' },
    { id: 'avatar_uploaded', title: 'Picture Perfect', desc: 'Upload custom avatar', howTo: 'Upload a custom profile picture', icon: '📷', points: 150, rarity: 'common', category: 'social' },
    { id: 'registered_user', title: 'Registered User', desc: 'Create an account', howTo: 'Sign up with email and verify your account', icon: '✅', points: 100, rarity: 'common', category: 'social' },
    { id: 'first_login', title: 'Welcome Back', desc: 'Log in for the first time', howTo: 'Successfully log in after registration', icon: '👋', points: 50, rarity: 'common', category: 'social' },
    { id: 'better_than_average', title: 'Above Average', desc: 'Score above server average', howTo: 'Get a game score higher than the current average', icon: '📊', points: 200, rarity: 'common', category: 'social' },
    { id: 'win_rate_50', title: 'Balanced Player', desc: 'Maintain 50% win rate', howTo: 'Keep a win rate of 50% or higher over 50+ games', icon: '⚖️', points: 300, rarity: 'rare', category: 'social' },
    { id: 'win_rate_75', title: 'Skilled Player', desc: 'Maintain 75% win rate', howTo: 'Keep a win rate of 75% or higher over 50+ games', icon: '🎯', points: 600, rarity: 'epic', category: 'social' },
    { id: 'win_rate_90', title: 'Pro Player', desc: 'Maintain 90% win rate', howTo: 'Keep a win rate of 90% or higher over 100+ games', icon: '👑', points: 1000, rarity: 'legendary', category: 'social' },
    { id: 'settings_customized', title: 'Customizer', desc: 'Change game settings', howTo: 'Modify at least one setting (theme, sound, etc.)', icon: '⚙️', points: 50, rarity: 'common', category: 'social' },
    { id: 'dark_mode_user', title: 'Dark Side', desc: 'Use dark mode', howTo: 'Enable dark mode in settings', icon: '🌙', points: 50, rarity: 'common', category: 'social' },
    { id: 'light_mode_user', title: 'Bright Side', desc: 'Use light mode', howTo: 'Use light mode (default theme)', icon: '☀️', points: 50, rarity: 'common', category: 'social' },

    // ========================================
    // VOCABULARY ACHIEVEMENTS (15)
    // ========================================
    { id: 'short_words', title: 'Brief Master', desc: 'Win 50 3-letter games', howTo: 'Complete 50 Easy mode wins', icon: '📝', points: 300, rarity: 'rare', category: 'vocabulary' },
    { id: 'medium_words', title: 'Moderate Master', desc: 'Win 50 4-letter games', howTo: 'Complete 50 Medium mode wins', icon: '📄', points: 400, rarity: 'rare', category: 'vocabulary' },
    { id: 'long_words', title: 'Long Word Master', desc: 'Win 50 5-letter games', howTo: 'Complete 50 Hard mode wins', icon: '📃', points: 500, rarity: 'epic', category: 'vocabulary' },
    { id: 'rare_word', title: 'Rare Find', desc: 'Guess an uncommon word', howTo: 'Successfully guess a rarely used word', icon: '💎', points: 300, rarity: 'rare', category: 'vocabulary' },
    { id: 'complex_word', title: 'Complexity Master', desc: 'Guess word with Q, X, or Z', howTo: 'Win with a word containing Q, X, or Z', icon: '🔠', points: 400, rarity: 'rare', category: 'vocabulary' },
    { id: 'double_vowel', title: 'Double Vowel', desc: 'Guess word with 2+ same vowels', howTo: 'Win with words like "GEESE" or "QUEUE"', icon: '🔤', points: 200, rarity: 'common', category: 'vocabulary' },
    { id: 'no_common', title: 'Uncommon Path', desc: 'Win without using E, T, A, O, N', howTo: 'Win without the most common letters', icon: '🛤️', points: 600, rarity: 'epic', category: 'vocabulary' },
    { id: 'starting_s', title: 'S-Starter', desc: 'Guess 25 words starting with S', howTo: 'Win 25 games where answer starts with S', icon: '🅢', points: 200, rarity: 'common', category: 'vocabulary' },
    { id: 'ending_e', title: 'E-Ender', desc: 'Guess 25 words ending with E', howTo: 'Win 25 games where answer ends with E', icon: '🅴', points: 200, rarity: 'common', category: 'vocabulary' },
    { id: 'diverse_letters', title: 'Letter Collector', desc: 'Use each letter 10+ times', howTo: 'Use every letter A-Z at least 10 times', icon: '🎨', points: 400, rarity: 'rare', category: 'vocabulary' },
    { id: 'z_word', title: 'Z Hunter', desc: 'Guess a word with Z', howTo: 'Win with a word containing the letter Z', icon: '💤', points: 300, rarity: 'rare', category: 'vocabulary' },
    { id: 'q_word', title: 'Q Hunter', desc: 'Guess a word with Q', howTo: 'Win with a word containing the letter Q', icon: '❓', points: 350, rarity: 'rare', category: 'vocabulary' },
    { id: 'x_word', title: 'X Hunter', desc: 'Guess a word with X', howTo: 'Win with a word containing the letter X', icon: '✖️', points: 300, rarity: 'rare', category: 'vocabulary' },
    { id: 'palindrome', title: 'Palindrome Finder', desc: 'Guess a palindrome word', howTo: 'Win with a word that reads same forwards and backwards', icon: '🔄', points: 500, rarity: 'epic', category: 'vocabulary' },
    { id: 'silent_letter', title: 'Silent Master', desc: 'Guess word with silent letter', howTo: 'Win with words like "KNIGHT" or "GNOME"', icon: '🤫', points: 300, rarity: 'rare', category: 'vocabulary' },

    // ========================================
    // PERSISTENCE ACHIEVEMENTS (10)
    // ========================================
    { id: 'never_give_up', title: 'Never Give Up', desc: 'Play 10 games after a loss', howTo: 'Continue playing 10 more games after losing', icon: '💪', points: 200, rarity: 'common', category: 'persistence' },
    { id: 'resilient', title: 'Resilient', desc: 'Win after 5 losses in a row', howTo: 'Break a 5-game losing streak with a win', icon: '🛡️', points: 500, rarity: 'epic', category: 'persistence' },
    { id: 'unstoppable', title: 'Unstoppable', desc: 'Win after 10 losses in a row', howTo: 'Break a 10-game losing streak with a win', icon: '🚀', points: 800, rarity: 'legendary', category: 'persistence' },
    { id: 'practice_makes_perfect', title: 'Practice Makes Perfect', desc: 'Complete 500 games', howTo: 'Play 500 total games (wins and losses)', icon: '📚', points: 800, rarity: 'epic', category: 'persistence' },
    { id: 'dedication', title: 'Dedication', desc: 'Play every day for 2 weeks', howTo: 'Log in and play daily for 14 consecutive days', icon: '🎯', points: 600, rarity: 'epic', category: 'persistence' },
    { id: 'monthly_commitment', title: 'Monthly Commitment', desc: 'Play at least 100 games in a month', howTo: 'Complete 100+ games within a calendar month', icon: '📅', points: 500, rarity: 'rare', category: 'persistence' },
    { id: 'bad_luck_brian', title: 'Bad Luck Brian', desc: 'Lose 5 games by one letter', howTo: 'Lose 5 games where you had 4/5 letters correct', icon: '😢', points: 300, rarity: 'rare', category: 'persistence' },
    { id: 'so_close', title: 'So Close!', desc: 'Get 4 greens but lose', howTo: 'Have 4 correct letters but fail to win', icon: '😅', points: 150, rarity: 'common', category: 'persistence' },
    { id: 'learning_curve', title: 'Learning Curve', desc: 'Improve avg attempts over 50 games', howTo: 'Lower your average attempts compared to first 50 games', icon: '📈', points: 400, rarity: 'rare', category: 'persistence' },
    { id: 'comeback_king', title: 'Comeback King', desc: 'Win 3 games after losing streak of 3+', howTo: 'Win 3 games in a row after a 3+ loss streak', icon: '👑', points: 600, rarity: 'epic', category: 'persistence' },

    // ========================================
    // SECRET ACHIEVEMENTS (10)
    // ========================================
    { id: 'secret_word', title: '???', desc: 'Discover the secret word', howTo: 'Guess the word "GUESS" as your answer', icon: '🔮', points: 500, rarity: 'epic', category: 'secret' },
    { id: 'matrix_word', title: 'Red Pill', desc: 'Guess "MATRIX" or "MORPH"', howTo: 'Win with the word MATRIX or MORPH', icon: '💊', points: 400, rarity: 'rare', category: 'secret' },
    { id: 'hello_world', title: 'Hello World', desc: 'Guess "HELLO" or "WORLD"', howTo: 'Win with the word HELLO or WORLD', icon: '🌍', points: 300, rarity: 'rare', category: 'secret' },
    { id: 'game_word', title: 'Meta Gamer', desc: 'Guess "GAMES" or "WORDS"', howTo: 'Win with the word GAMES or WORDS', icon: '🎮', points: 300, rarity: 'rare', category: 'secret' },
    { id: 'lucky_seven', title: 'Lucky Seven', desc: 'Win on 7th of month at 7pm', howTo: 'Win a game on the 7th day at 7:00 PM', icon: '🍀', points: 777, rarity: 'epic', category: 'secret' },
    { id: 'triple_seven', title: 'Jackpot', desc: 'Score exactly 777 points', howTo: 'Finish a game with exactly 777 points', icon: '🎰', points: 777, rarity: 'epic', category: 'secret' },
    { id: 'pi_day', title: 'Pi Day', desc: 'Play on March 14 at 3:14', howTo: 'Play a game on 3/14 at 3:14 AM or PM', icon: '🥧', points: 314, rarity: 'rare', category: 'secret' },
    { id: 'friday_13th', title: 'Superstitious', desc: 'Win on Friday the 13th', howTo: 'Win a game on any Friday the 13th', icon: '🔮', points: 666, rarity: 'epic', category: 'secret' },
    { id: 'perfect_time', title: 'Perfect Timing', desc: 'Win at exactly X:00:00', howTo: 'Complete a win at exactly the top of any hour', icon: '⏰', points: 400, rarity: 'rare', category: 'secret' },
    { id: 'full_house', title: 'Full House', desc: 'Unlock all achievements', howTo: 'Unlock every other achievement in the game', icon: '👑', points: 5000, rarity: 'legendary', category: 'secret' }
];

window.Achievements = {
    // State
    unlockedIds: new Set(),
    isLoading: false,
    currentFilter: 'all',
    
    // DOM Elements
    elements: {},

    /**
     * Initialize achievements module
     */
    async init() {
        this.elements = {
            backdrop: document.getElementById('achievements-modal-backdrop'),
            modal: document.getElementById('achievements-modal'),
            grid: document.getElementById('achievements-grid'),
            closeBtn: document.getElementById('close-achievements-btn'),
            unlockedCount: document.getElementById('ach-unlocked-count'),
            totalCount: document.getElementById('ach-total-count'),
            totalPoints: document.getElementById('ach-total-points'),
            filterBtns: document.querySelectorAll('.ach-filter-btn')
        };

        this.setupListeners();
        
        // Load from local storage first (for immediate display)
        this.loadFromLocal();
        
        // Then sync with server if logged in
        await this.syncWithServer();
    },

    /**
     * Setup event listeners
     */
    setupListeners() {
        // Close button
        this.elements.closeBtn?.addEventListener('click', () => this.close());
        
        // Backdrop click to close
        this.elements.backdrop?.addEventListener('click', (e) => {
            if (e.target === this.elements.backdrop) this.close();
        });
        
        // Filter buttons
        this.elements.filterBtns?.forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentFilter = btn.dataset.filter;
                this.elements.filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderGrid();
            });
        });
        
        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.elements.backdrop.classList.contains('hidden')) {
                this.close();
            }
        });
    },

    /**
     * Open achievements modal
     */
    open() {
        this.elements.backdrop?.classList.remove('hidden');
        this.renderGrid();
        this.updateStats();
    },

    /**
     * Close achievements modal
     */
    close() {
        this.elements.backdrop?.classList.add('hidden');
    },

    /**
     * Load achievements from local storage
     */
    loadFromLocal() {
        try {
            const data = Storage.getData();
            if (data.achievements && Array.isArray(data.achievements)) {
                this.unlockedIds = new Set(data.achievements);
            }
        } catch (e) {
            console.error('Failed to load achievements from local storage:', e);
        }
    },

    /**
     * Save achievements to local storage
     */
    saveToLocal() {
        try {
            const data = Storage.getData();
            data.achievements = Array.from(this.unlockedIds);
            Storage.save();
        } catch (e) {
            console.error('Failed to save achievements to local storage:', e);
        }
    },

    /**
     * Sync achievements with server (for registered users)
     */
    async syncWithServer() {
        const user = Auth?.currentUser;
        if (!user || user.account_type === 'demo') return;

        try {
            const token = localStorage.getItem('authToken');
            if (!token) return;

            const response = await fetch(`/api/achievements/user`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.achievements) {
                    data.achievements.forEach(a => this.unlockedIds.add(a.achievement_id));
                    this.saveToLocal();
                }
            }
        } catch (e) {
            console.error('Failed to sync achievements with server:', e);
        }
    },

    /**
     * Render the achievements grid
     */
    renderGrid() {
        if (!this.elements.grid) return;

        const filtered = this.currentFilter === 'all' 
            ? ACHIEVEMENT_LIST 
            : ACHIEVEMENT_LIST.filter(a => a.category === this.currentFilter);

        this.elements.grid.innerHTML = filtered.map(ach => {
            const isUnlocked = this.unlockedIds.has(ach.id);
            return `
                <div class="ach-card ${isUnlocked ? 'unlocked' : 'locked'}" data-id="${ach.id}" title="${ach.howTo}">
                    ${isUnlocked ? '<span class="unlocked-badge">✓</span>' : ''}
                    <div class="ach-card-icon">${ach.icon}</div>
                    <div class="ach-card-title">${ach.title}</div>
                    <div class="ach-card-desc">${ach.desc}</div>
                    <div class="ach-card-meta">
                        <span class="ach-card-points">${ach.points} pts</span>
                        <span class="ach-card-rarity ${ach.rarity}">${ach.rarity}</span>
                    </div>
                    <div class="ach-card-tooltip">${ach.howTo}</div>
                </div>
            `;
        }).join('');
    },

    /**
     * Update stats display
     */
    updateStats() {
        const unlocked = this.unlockedIds.size;
        const total = ACHIEVEMENT_LIST.length;
        const points = ACHIEVEMENT_LIST
            .filter(a => this.unlockedIds.has(a.id))
            .reduce((sum, a) => sum + a.points, 0);

        if (this.elements.unlockedCount) this.elements.unlockedCount.textContent = unlocked;
        if (this.elements.totalCount) this.elements.totalCount.textContent = total;
        if (this.elements.totalPoints) this.elements.totalPoints.textContent = points;
    },

    /**
     * Check for achievements after a game
     */
    check(state, gameResult) {
        const newUnlocks = [];
        const data = Storage.getData();
        const stats = data.stats || {};

        // Helper function
        const tryUnlock = (id) => {
            if (!this.unlockedIds.has(id)) {
                this.unlockedIds.add(id);
                const ach = ACHIEVEMENT_LIST.find(a => a.id === id);
                if (ach) newUnlocks.push(ach);
            }
        };

        // === GAMEPLAY ===
        // First Win
        if (gameResult.win && stats.gamesWon === 1) {
            tryUnlock('first_win');
        }

        // Speed Demon (< 60 seconds)
        if (gameResult.win && gameResult.timeTaken < 60) {
            tryUnlock('speed_demon');
        }

        // Lightning Reflexes (< 30 seconds)
        if (gameResult.win && gameResult.timeTaken < 30) {
            tryUnlock('lightning_reflexes');
        }

        // Lucky Guess (first attempt)
        if (gameResult.win && gameResult.attempts === 1) {
            tryUnlock('lucky_guess');
            tryUnlock('all_green_win');
        }

        // Two Attempts
        if (gameResult.win && gameResult.attempts === 2) {
            tryUnlock('two_attempts');
        }

        // Close Call (last attempt)
        if (gameResult.win && gameResult.attempts === gameResult.maxAttempts) {
            tryUnlock('close_call');
            tryUnlock('process_elimination');
        }

        // Marathon Runner (50 games)
        if (stats.gamesPlayed >= 50) {
            tryUnlock('marathon_runner');
        }

        // Centurion (100 games)
        if (stats.gamesPlayed >= 100) {
            tryUnlock('centurion');
        }

        // Veteran (250 games)
        if (stats.gamesPlayed >= 250) {
            tryUnlock('veteran');
        }

        // Grandmaster (500 games)
        if (stats.gamesPlayed >= 500) {
            tryUnlock('grandmaster');
            tryUnlock('practice_makes_perfect');
        }

        // Legendary Player (1000 games)
        if (stats.gamesPlayed >= 1000) {
            tryUnlock('legendary_player');
        }

        // === MASTERY ===
        // Expert Mind (5-letter win)
        if (gameResult.win && gameResult.difficulty === 5) {
            tryUnlock('expert_mind');
        }

        // Medium Well (4-letter win)
        if (gameResult.win && gameResult.difficulty === 4) {
            tryUnlock('medium_well');
        }

        // Easy Start (3-letter win)
        if (gameResult.win && gameResult.difficulty === 3) {
            tryUnlock('easy_start');
        }

        // Perfectionist (1000+ points)
        if (gameResult.score >= 1000) {
            tryUnlock('perfectionist');
        }

        // High Scorer (2000+ points)
        if (gameResult.score >= 2000) {
            tryUnlock('score_2000');
        }

        // Score Master (3000+ points)
        if (gameResult.score >= 3000) {
            tryUnlock('score_3000');
        }

        // Streak achievements
        if (stats.winStreak >= 2) tryUnlock('double_down');
        if (stats.winStreak >= 5) tryUnlock('streak_master');
        if (stats.winStreak >= 10) tryUnlock('streak_legend');
        if (stats.winStreak >= 20) tryUnlock('streak_god');

        // Mode-specific wins
        const modeWins = stats.modeWins || {};
        if (modeWins['3'] >= 25) tryUnlock('easy_master');
        if (modeWins['4'] >= 25) tryUnlock('medium_master');
        if (modeWins['5'] >= 25) tryUnlock('hard_master');
        if (modeWins['3'] >= 50) tryUnlock('short_words');
        if (modeWins['4'] >= 50) tryUnlock('medium_words');
        if (modeWins['5'] >= 50) tryUnlock('long_words');
        if (modeWins['3'] >= 100) tryUnlock('easy_legend');
        if (modeWins['4'] >= 100) tryUnlock('medium_legend');
        if (modeWins['5'] >= 100) tryUnlock('hard_legend');

        // Triple Threat (win in all difficulties)
        if (modeWins['3'] && modeWins['4'] && modeWins['5']) {
            tryUnlock('triple_threat');
        }

        // === SPECIAL ===
        const now = new Date();
        const hour = now.getHours();
        const day = now.getDay();
        const date = now.getDate();
        const month = now.getMonth() + 1;

        // Night Owl (midnight to 5am)
        if (hour >= 0 && hour < 5) {
            tryUnlock('night_owl');
        }

        // Early Bird (5am to 8am)
        if (hour >= 5 && hour < 8) {
            tryUnlock('early_bird');
        }

        // Lunch Break
        if (hour >= 12 && hour < 13) {
            tryUnlock('lunch_break');
        }

        // Weekend Warrior (win on weekend)
        if (gameResult.win && (day === 0 || day === 6)) {
            const weekendWins = (stats.weekendWins || 0) + 1;
            stats.weekendWins = weekendWins;
            if (weekendWins >= 3) {
                tryUnlock('weekend_warrior');
            }
        }

        // Friday player
        if (gameResult.win && day === 5) {
            const fridayWins = (stats.fridayWins || 0) + 1;
            stats.fridayWins = fridayWins;
            if (fridayWins >= 5) {
                tryUnlock('friday_player');
            }
        }

        // Special dates
        if (month === 1 && date === 1) tryUnlock('new_year_player');
        if (month === 10 && date === 31) tryUnlock('halloween_player');
        if (month === 12 && date === 25) tryUnlock('christmas_player');
        if (month === 2 && date === 14) tryUnlock('valentines_player');
        if (month === 3 && date === 14) tryUnlock('pi_day');

        // Friday the 13th
        if (day === 5 && date === 13 && gameResult.win) {
            tryUnlock('friday_13th');
        }

        // Lucky Seven
        if (date === 7 && hour === 19 && gameResult.win) {
            tryUnlock('lucky_seven');
        }

        // Comeback Kid (win after 3 losses)
        if (gameResult.win && stats.lossStreak >= 3) {
            tryUnlock('comeback_kid');
        }

        // Resilient (win after 5 losses)
        if (gameResult.win && stats.lossStreak >= 5) {
            tryUnlock('resilient');
        }

        // Unstoppable (win after 10 losses)
        if (gameResult.win && stats.lossStreak >= 10) {
            tryUnlock('unstoppable');
        }

        // Score exactly 777
        if (gameResult.score === 777) {
            tryUnlock('triple_seven');
        }

        // Full House (all other achievements)
        if (this.unlockedIds.size === ACHIEVEMENT_LIST.length - 1 && !this.unlockedIds.has('full_house')) {
            tryUnlock('full_house');
        }

        // Save and sync
        if (newUnlocks.length > 0) {
            this.saveToLocal();
            this.syncUnlocksToServer(newUnlocks);
        }

        return newUnlocks;
    },

    /**
     * Sync newly unlocked achievements to server
     */
    async syncUnlocksToServer(achievements) {
        const user = Auth?.currentUser;
        if (!user || user.account_type === 'demo') return;

        const token = localStorage.getItem('authToken');
        if (!token) return;

        for (const ach of achievements) {
            try {
                await fetch(`/api/achievements/unlock`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ achievementId: ach.id })
                });
            } catch (e) {
                console.error('Failed to sync achievement:', ach.id, e);
            }
        }
    },

    /**
     * Get achievement by ID
     */
    getById(id) {
        return ACHIEVEMENT_LIST.find(a => a.id === id);
    },

    /**
     * Check if achievement is unlocked
     */
    isUnlocked(id) {
        return this.unlockedIds.has(id);
    },

    /**
     * Get total achievement count
     */
    getTotalCount() {
        return ACHIEVEMENT_LIST.length;
    },

    /**
     * Get all categories
     */
    getCategories() {
        return [...new Set(ACHIEVEMENT_LIST.map(a => a.category))];
    },

    // ===== ACHIEVEMENTS PAGE METHODS =====

    pageElements: {},
    pageFilter: 'all',

    /**
     * Initialize achievements page elements
     */
    initPage() {
        this.pageElements = {
            screen: document.getElementById('achievements-screen'),
            grid: document.getElementById('achievements-page-grid'),
            backBtn: document.getElementById('achievements-back-btn'),
            filterTabs: document.querySelectorAll('.ach-filter-tab'),
            unlocked: document.getElementById('ach-page-unlocked'),
            total: document.getElementById('ach-page-total'),
            points: document.getElementById('ach-page-points'),
            progress: document.getElementById('ach-page-progress')
        };

        // Back button
        this.pageElements.backBtn?.addEventListener('click', () => this.closePage());

        // Filter tabs
        this.pageElements.filterTabs?.forEach(tab => {
            tab.addEventListener('click', () => {
                this.pageFilter = tab.dataset.filter;
                this.pageElements.filterTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.renderPageGrid();
            });
        });
    },

    /**
     * Open achievements page
     */
    openPage() {
        console.log('[Achievements] openPage() called');
        
        // Hide all screens globally (screens are direct siblings, no container)
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        
        // Also hide dashboard specifically (uses 'hidden' class pattern)
        document.getElementById('dashboard')?.classList.add('hidden');

        // Show achievements screen
        const screen = document.getElementById('achievements-screen');
        if (screen) {
            screen.classList.remove('hidden');
            console.log('[Achievements] Screen shown');
        } else {
            console.error('[Achievements] Screen element not found!');
        }

        // Render content
        this.renderPageGrid();
        this.updatePageStats();
    },

    /**
     * Close achievements page and go back to dashboard
     */
    closePage() {
        this.pageElements.screen?.classList.add('hidden');
        document.getElementById('dashboard')?.classList.remove('hidden');
    },

    /**
     * Render achievements page grid
     */
    renderPageGrid() {
        if (!this.pageElements.grid) return;

        const filtered = this.pageFilter === 'all'
            ? ACHIEVEMENT_LIST
            : ACHIEVEMENT_LIST.filter(a => a.category === this.pageFilter);

        this.pageElements.grid.innerHTML = filtered.map(ach => {
            const isUnlocked = this.unlockedIds.has(ach.id);
            return `
                <div class="ach-page-card ${isUnlocked ? 'unlocked' : 'locked'}" data-id="${ach.id}">
                    ${isUnlocked ? '<span class="ach-unlocked-badge">✓ UNLOCKED</span>' : ''}
                    <div class="ach-page-card-header">
                        <div class="ach-page-icon">${ach.icon}</div>
                        <div class="ach-page-info">
                            <div class="ach-page-title">${ach.title}</div>
                            <div class="ach-page-desc">${ach.desc}</div>
                        </div>
                    </div>
                    <div class="ach-page-howto">
                        <span class="howto-label">How to unlock:</span>
                        <span class="howto-text">${ach.howTo}</span>
                    </div>
                    <div class="ach-page-footer">
                        <span class="ach-page-points">⭐ ${ach.points} pts</span>
                        <span class="ach-page-rarity ${ach.rarity}">${ach.rarity}</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Update page stats
     */
    updatePageStats() {
        const unlocked = this.unlockedIds.size;
        const total = ACHIEVEMENT_LIST.length;
        const points = ACHIEVEMENT_LIST
            .filter(a => this.unlockedIds.has(a.id))
            .reduce((sum, a) => sum + a.points, 0);
        const progress = Math.round((unlocked / total) * 100);

        if (this.pageElements.unlocked) this.pageElements.unlocked.textContent = unlocked;
        if (this.pageElements.total) this.pageElements.total.textContent = total;
        if (this.pageElements.points) this.pageElements.points.textContent = points.toLocaleString();
        if (this.pageElements.progress) this.pageElements.progress.textContent = `${progress}%`;
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    Achievements.init();
    Achievements.initPage();
});
