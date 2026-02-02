const mongoose = require('mongoose');

const guildSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    prefix: { type: String, default: '!' },
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

module.exports = mongoose.model('Guild', guildSchema);
