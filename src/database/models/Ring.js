const mongoose = require('mongoose');

const ringSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    name: { type: String, required: true },
    emoji: { type: String, default: '💍' },
    price: { type: Number, required: true },
    description: { type: String, default: '' },
    createdBy: { type: String },
    createdAt: { type: Date, default: Date.now }
});

ringSchema.index({ guildId: 1 });

ringSchema.statics.getRings = async function(guildId) {
    return await this.find({ guildId }).sort({ price: 1 });
};

ringSchema.statics.addRing = async function(guildId, name, price, emoji, description, createdBy) {
    return await this.create({ guildId, name, price, emoji, description, createdBy });
};

ringSchema.statics.removeRing = async function(guildId, ringId) {
    return await this.findOneAndDelete({ _id: ringId, guildId });
};

ringSchema.statics.getRingById = async function(ringId) {
    return await this.findById(ringId);
};

module.exports = mongoose.model('Ring', ringSchema);
