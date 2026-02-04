const mongoose = require('mongoose');

const guildSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    prefix: { type: String, default: '!' },
    depositLogChannel: { type: String, default: null },
    gameLogChannel: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

guildSchema.statics.getPrefix = async function(guildId) {
    let guild = await this.findOne({ guildId });
    if (!guild) {
        guild = await this.create({ guildId });
    }
    return guild.prefix;
};

guildSchema.statics.setPrefix = async function(guildId, prefix) {
    return await this.findOneAndUpdate(
        { guildId },
        { prefix, updatedAt: Date.now() },
        { upsert: true, new: true }
    );
};

guildSchema.statics.setDepositLogChannel = async function(guildId, channelId) {
    return await this.findOneAndUpdate(
        { guildId },
        { depositLogChannel: channelId, updatedAt: Date.now() },
        { upsert: true, new: true }
    );
};

guildSchema.statics.setGameLogChannel = async function(guildId, channelId) {
    return await this.findOneAndUpdate(
        { guildId },
        { gameLogChannel: channelId, updatedAt: Date.now() },
        { upsert: true, new: true }
    );
};

guildSchema.statics.getLogChannels = async function(guildId) {
    let guild = await this.findOne({ guildId });
    if (!guild) guild = await this.create({ guildId });
    return { depositLogChannel: guild.depositLogChannel, gameLogChannel: guild.gameLogChannel };
};

module.exports = mongoose.model('Guild', guildSchema);
