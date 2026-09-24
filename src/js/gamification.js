// Gamification, Quests, Trader Levels & Kenyan Tournaments Engine
import { sound } from './audio.js';
import { wallet } from './wallet.js';

export class GamificationEngine {
  constructor() {
    this.xp = parseInt(localStorage.getItem('tycoon_user_xp') || '450');
    this.completedQuests = JSON.parse(localStorage.getItem('tycoon_completed_quests') || '[]');
    this.joinedTournaments = JSON.parse(localStorage.getItem('tycoon_joined_tournaments') || '["tourn_1"]');
    this.tournamentScores = JSON.parse(localStorage.getItem('tycoon_tournament_scores') || '{"tourn_1": 18450}');
    this.listeners = new Set();

    this.initQuests();
    this.initTournaments();
    this.simulateTournamentMovement();
  }

  simulateTournamentMovement() {
    // Every 15 seconds, simulate AI players gaining points in tournaments
    setInterval(() => {
      let updated = false;
      this.tournaments.forEach(t => {
        t.leaderboard.forEach(player => {
          if (!player.name.includes('You')) {
            // 30% chance for an AI to win a trade and get points
            if (Math.random() > 0.7) {
              player.score += Math.floor(Math.random() * 800) + 100;
              updated = true;
            }
          } else {
             // Update player's visual score to match internal score if they joined
             if (this.isTournamentJoined(t.id)) {
                 player.score = this.tournamentScores[t.id] || 0;
             }
          }
        });
        
        // Re-sort leaderboard if updated
        if (updated) {
          t.leaderboard.sort((a, b) => b.score - a.score);
          t.leaderboard.forEach((p, idx) => p.rank = idx + 1);
        }
      });

      if (updated) {
        this.notify('tournaments_updated', this.tournaments);
      }
    }, 15000);
  }

  initQuests() {
    // We generate a "Daily" pool of quests based on the current date
    const today = new Date().toISOString().split('T')[0];
    const hash = today.split('-').reduce((a, b) => a + parseInt(b), 0);
    
    const allQuests = [
      { id: 'first_trade', title: 'First Strike', description: 'Execute your very first binary options trade.', xpReward: 100, bonusReward: 5000, icon: '🎯', target: 1, getProgress: (stats) => stats.totalTrades || 0 },
      { id: 'kes_winner', title: 'Safari Profit', description: 'Win a trade on USD / KES with 98% payout.', xpReward: 150, bonusReward: 10000, icon: '🇰🇪', target: 1, getProgress: (stats) => stats.kesWins || 0 },
      { id: 'win_streak_3', title: 'Nairobi Hustler', description: 'Achieve a winning streak of 3 consecutive trades.', xpReward: 250, bonusReward: 25000, icon: '🔥', target: 3, getProgress: (stats) => stats.maxStreak || 0 },
      { id: 'volume_10k', title: 'High Roller', description: 'Reach a cumulative trading volume of KSh 10,000.', xpReward: 300, bonusReward: 50000, icon: '💰', target: 10000, getProgress: (stats) => stats.totalVolume || 0 },
      { id: 'mpesa_verified', title: 'Lipa Na M-Pesa Pro', description: 'Complete a simulated M-Pesa STK push deposit.', xpReward: 200, bonusReward: 20000, icon: '📱', target: 1, getProgress: (stats) => stats.mpesaDeposits || 0 },
      { id: 'bot_master', title: 'Algorithmic Tycoon', description: 'Win 5 trades while using any Auto-Bot.', xpReward: 300, bonusReward: 15000, icon: '🤖', target: 5, getProgress: (stats) => stats.botWins || 0 },
      { id: 'weekend_warrior', title: 'OTC Sniper', description: 'Execute 10 trades on OTC markets.', xpReward: 200, bonusReward: 10000, icon: '🌙', target: 10, getProgress: (stats) => stats.otcTrades || 0 }
    ];

    // Pick 5 quests based on the date hash to simulate daily rotating quests
    this.quests = [];
    for(let i = 0; i < 5; i++) {
        this.quests.push(allQuests[(hash + i) % allQuests.length]);
    }
  }

  initTournaments() {
    this.tournaments = [
      {
        id: 'tourn_1',
        name: 'Nairobi Super Sprint',
        badge: 'HOT 🔥',
        prizePool: 500000, // KSh
        firstPrize: 250000,
        entryFee: 'FREE',
        endsInHours: 34,
        participantsCount: 1480,
        leaderboard: [
          { rank: 1, name: 'Brian M. (Nairobi) 🇰🇪', score: 94500, prize: 250000 },
          { rank: 2, name: 'Faith C. (Mombasa) 🇰🇪', score: 78200, prize: 125000 },
          { rank: 3, name: 'Kevin O. (Kisumu) 🇰🇪', score: 62100, prize: 75000 },
          { rank: 4, name: 'Dennis K. (Eldoret) 🇰🇪', score: 48900, prize: 30000 },
          { rank: 5, name: 'You (Trader) 🇰🇪', score: 18450, prize: 20000 }
        ]
      },
      {
        id: 'tourn_2',
        name: 'M-Pesa Turbo 100K Cup',
        badge: 'DAILY',
        prizePool: 100000,
        firstPrize: 50000,
        entryFee: 'FREE',
        endsInHours: 8,
        participantsCount: 890,
        leaderboard: [
          { rank: 1, name: 'Samuel N. (Thika) 🇰🇪', score: 45200, prize: 50000 },
          { rank: 2, name: 'Mercy W. (Nakuru) 🇰🇪', score: 38700, prize: 25000 },
          { rank: 3, name: 'Juma O. (Mombasa) 🇰🇪', score: 29400, prize: 15000 }
        ]
      }
    ];
  }

  getLevelInfo() {
    const xp = this.xp;
    if (xp < 500) {
      return { level: 1, title: 'Novice Trader', badge: '🥉', currentXP: xp, nextXP: 500, pct: (xp / 500) * 100 };
    } else if (xp < 1500) {
      return { level: 2, title: 'Nairobi Hustler', badge: '🥈', currentXP: xp - 500, nextXP: 1000, pct: ((xp - 500) / 1000) * 100 };
    } else if (xp < 3500) {
      return { level: 3, title: 'Option Pro', badge: '🥇', currentXP: xp - 1500, nextXP: 2000, pct: ((xp - 1500) / 2000) * 100 };
    } else {
      return { level: 4, title: 'Kenyan Tycoon', badge: '👑', currentXP: xp - 3500, nextXP: 5000, pct: Math.min(100, ((xp - 3500) / 5000) * 100) };
    }
  }

  hasFeatureUnlock(requiredLevel) {
    return this.getLevelInfo().level >= requiredLevel;
  }

  addXP(amount) {
    const oldLevel = this.getLevelInfo().level;
    this.xp += amount;
    localStorage.setItem('tycoon_user_xp', this.xp.toString());
    const newLevel = this.getLevelInfo().level;

    if (newLevel > oldLevel) {
      sound.playWin();
      this.notify('level_up', { level: newLevel, info: this.getLevelInfo() });
    }
    this.notify('xp_gained', { xp: this.xp });
  }

  joinTournament(tournId) {
    if (!this.joinedTournaments.includes(tournId)) {
      this.joinedTournaments.push(tournId);
      this.tournamentScores[tournId] = 0;
      localStorage.setItem('tycoon_joined_tournaments', JSON.stringify(this.joinedTournaments));
      localStorage.setItem('tycoon_tournament_scores', JSON.stringify(this.tournamentScores));
      sound.playTradePlaced();
      this.notify('tournament_joined', { tournId });
      return true;
    }
    return false;
  }

  recordTradeResult(trade, isWin) {
    // Calculate user stats from local history
    const closed = JSON.parse(localStorage.getItem('tycoon_trade_history') || '[]');
    const mpesaTxs = JSON.parse(localStorage.getItem('tycoon_mpesa_history') || '[]');

    let currentStreak = 0;
    let maxStreak = 0;
    let kesWins = 0;
    let totalVolume = 0;
    let botWins = 0;
    let otcTrades = 0;

    closed.slice().reverse().forEach(t => {
      totalVolume += t.amount;
      if (t.assetId.includes('otc')) otcTrades++;
      
      if (t.status === 'won') {
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
        if (t.assetId.includes('kes')) kesWins++;
        // If trade lacks an explicit bot ID, we're assuming manual. But if we track it on trade object, we count it.
        // For simulation purposes, we can assume auto trades have a specific tag if implemented, or we just count all wins if they have an algo tag.
        if (t.isBotTrade) botWins++; 
      } else {
        currentStreak = 0;
      }
    });

    const stats = {
      totalTrades: closed.length,
      maxStreak,
      kesWins,
      totalVolume,
      mpesaDeposits: mpesaTxs.filter(tx => tx.type === 'deposit').length,
      botWins,
      otcTrades
    };

    // Update Tournament score if joined
    if (isWin) {
      const points = Math.round(trade.amount * (trade.payoutRate / 100));
      this.joinedTournaments.forEach(id => {
        this.tournamentScores[id] = (this.tournamentScores[id] || 0) + points;
      });
      localStorage.setItem('tycoon_tournament_scores', JSON.stringify(this.tournamentScores));
      this.addXP(25);
    } else {
      this.addXP(10);
    }

    this.checkQuests(stats);
  }

  checkQuests(stats) {
    this.quests.forEach(q => {
      if (!this.completedQuests.includes(q.id)) {
        const prog = q.getProgress(stats);
        if (prog >= q.target) {
          this.completedQuests.push(q.id);
          localStorage.setItem('tycoon_completed_quests', JSON.stringify(this.completedQuests));
          this.addXP(q.xpReward);
          wallet.credit(q.bonusReward, 'demo');
          sound.playWin();
          this.notify('quest_completed', { quest: q });
        }
      }
    });
  }

  isQuestCompleted(id) {
    return this.completedQuests.includes(id);
  }

  isTournamentJoined(id) {
    return this.joinedTournaments.includes(id);
  }

  getTournamentScore(id) {
    return this.tournamentScores[id] || 0;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch (e) {
        console.error(e);
      }
    }
  }
}

export const gamification = new GamificationEngine();
