const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    oderId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    odername: {
        type: String,
        default: 'Unknown'
    },
    balance: {
        type: Number,
        default: 10000
    },
    totalWin: {
        type: Number,
        default: 0
    },
    totalLose: {
        type: Number,
        default: 0
    },
    gamesPlayed: {
        type: Number,
        default: 0
    },
    lastDaily: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Middleware cập nhật updatedAt
userSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Static methods
userSchema.statics.findByUserId = async function(userId) {
    return this.findOne({ oderId: userId });
};

userSchema.statics.getOrCreate = async function(userId, username = 'Unknown') {
    let user = await this.findOne({ oderId: userId });
    if (!user) {
        user = await this.create({ 
            oderId: userId, 
            odername: username,
            balance: 10000 
        });
    }
    return user;
};

userSchema.statics.getBalance = async function(userId) {
    const user = await this.getOrCreate(userId);
    return user.balance;
};

userSchema.statics.setBalance = async function(userId, amount) {
    const user = await this.getOrCreate(userId);
    user.balance = amount;
    await user.save();
    return user;
};

userSchema.statics.addBalance = async function(userId, amount) {
    const user = await this.getOrCreate(userId);
    user.balance += amount;
    if (amount > 0) {
        user.totalWin += amount;
    } else {
        user.totalLose += Math.abs(amount);
    }
    user.gamesPlayed += 1;
    await user.save();
    return user;
};

userSchema.statics.updateDaily = async function(userId) {
    const user = await this.getOrCreate(userId);
    user.lastDaily = new Date();
    await user.save();
    return user;
};

userSchema.statics.getLeaderboard = async function(limit = 10) {
    return this.find({})
        .sort({ balance: -1 })
        .limit(limit)
        .select('oderId odername balance totalWin gamesPlayed');
};

const User = mongoose.model('User', userSchema);

module.exports = User;
