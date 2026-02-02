const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
    oderId: { type: String, required: true },
    guildId: { type: String, required: true },
    items: [{
        ringId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ring' },
        name: { type: String },
        emoji: { type: String },
        purchasedAt: { type: Date, default: Date.now }
    }]
});

inventorySchema.index({ oderId: 1, guildId: 1 }, { unique: true });

inventorySchema.statics.getInventory = async function(oderId, guildId) {
    let inv = await this.findOne({ oderId, guildId });
    if (!inv) {
        inv = await this.create({ oderId, guildId, items: [] });
    }
    return inv;
};

inventorySchema.statics.addItem = async function(oderId, guildId, ringId, name, emoji) {
    return await this.findOneAndUpdate(
        { oderId, guildId },
        { $push: { items: { ringId, name, emoji } } },
        { upsert: true, new: true }
    );
};

inventorySchema.statics.removeItem = async function(oderId, guildId, ringId) {
    const inv = await this.findOne({ oderId, guildId });
    if (!inv) return null;
    
    const itemIndex = inv.items.findIndex(item => item.ringId.toString() === ringId.toString());
    if (itemIndex === -1) return null;
    
    inv.items.splice(itemIndex, 1);
    await inv.save();
    return inv;
};

inventorySchema.statics.hasRing = async function(oderId, guildId, ringId) {
    const inv = await this.findOne({ oderId, guildId });
    if (!inv) return false;
    return inv.items.some(item => item.ringId.toString() === ringId.toString());
};

module.exports = mongoose.model('Inventory', inventorySchema);
