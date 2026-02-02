const mongoose = require('mongoose');

const marriageSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    user1: { type: String, required: true },
    user2: { type: String, required: true },
    ringId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ring' },
    ringName: { type: String },
    ringEmoji: { type: String, default: '💍' },
    marriedAt: { type: Date, default: Date.now },
    lovePoints: { type: Number, default: 100 }
});

marriageSchema.index({ guildId: 1, user1: 1 });
marriageSchema.index({ guildId: 1, user2: 1 });

marriageSchema.statics.getMarriage = async function(guildId, userId) {
    return await this.findOne({
        guildId,
        $or: [{ user1: userId }, { user2: userId }]
    });
};

marriageSchema.statics.createMarriage = async function(guildId, user1, user2, ringId, ringName, ringEmoji) {
    return await this.create({ guildId, user1, user2, ringId, ringName, ringEmoji, lovePoints: 100 });
};

marriageSchema.statics.divorce = async function(guildId, userId) {
    return await this.findOneAndDelete({
        guildId,
        $or: [{ user1: userId }, { user2: userId }]
    });
};

marriageSchema.statics.addLovePoints = async function(guildId, userId, points) {
    const marriage = await this.findOne({
        guildId,
        $or: [{ user1: userId }, { user2: userId }]
    });
    if (!marriage) return null;
    
    marriage.lovePoints = Math.max(0, (marriage.lovePoints || 100) + points);
    await marriage.save();
    return marriage;
};

module.exports = mongoose.model('Marriage', marriageSchema);
