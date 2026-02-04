const mongoose = require('mongoose');

const gameSessionSchema = new mongoose.Schema({
    channelId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    gameType: { type: String, enum: ['taixiu', 'baucua'], required: true },
    round: { type: Number, default: 1 },
    bets: { type: mongoose.Schema.Types.Mixed, default: {} },
    userSelections: { type: mongoose.Schema.Types.Mixed, default: {} },
    history: { type: Array, default: [] },
    messageId: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const jackpotSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    gameType: { type: String, enum: ['taixiu', 'baucua'], default: 'taixiu' },
    amount: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now }
});

gameSessionSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const GameSession = mongoose.model('GameSession', gameSessionSchema);
const Jackpot = mongoose.model('Jackpot', jackpotSchema);

module.exports = { GameSession, Jackpot };
