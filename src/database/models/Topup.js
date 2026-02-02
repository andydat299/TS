const mongoose = require('mongoose');

const topupSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    channelId: { type: String, required: true },
    amount: { type: Number, required: true },
    code: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ['pending', 'paid', 'expired'], default: 'pending' },
    transactionId: { type: String, default: null },
    description: { type: String, default: '' },
    expiresAt: { type: Date, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
    paidAt: { type: Date, default: null }
});

// Static helpers

topupSchema.statics.createTopup = async function({ guildId, userId, channelId, amount, code, expiresAt }) {
    return this.create({ guildId, userId, channelId, amount, code, expiresAt });
};

topupSchema.statics.findPendingByCode = async function(code) {
    return this.findOne({ code, status: 'pending' });
};

topupSchema.statics.findPendingByUser = async function(guildId, userId) {
    return this.findOne({ guildId, userId, status: 'pending' }).sort({ createdAt: -1 });
};

topupSchema.statics.markPaid = async function(id, { transactionId, description, amount }) {
    return this.findByIdAndUpdate(
        id,
        { status: 'paid', paidAt: new Date(), transactionId, description, amount: amount || 0 },
        { new: true }
    );
};

topupSchema.statics.expireOld = async function() {
    return this.updateMany(
        { status: 'pending', expiresAt: { $lte: new Date() } },
        { status: 'expired' }
    );
};

// Thống kê doanh thu
topupSchema.statics.getRevenueStats = async function(guildId) {
    const result = await this.aggregate([
        { $match: { guildId, status: 'paid' } },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: '$amount' },
                totalTransactions: { $sum: 1 }
            }
        }
    ]);
    return result[0] || { totalRevenue: 0, totalTransactions: 0 };
};

// Reset thống kê (xóa tất cả giao dịch đã thanh toán)
topupSchema.statics.resetRevenue = async function(guildId) {
    return this.deleteMany({ guildId, status: 'paid' });
};

// Lấy danh sách giao dịch gần đây
topupSchema.statics.getRecentTransactions = async function(guildId, limit = 10) {
    return this.find({ guildId, status: 'paid' })
        .sort({ paidAt: -1 })
        .limit(limit);
};

const Topup = mongoose.model('Topup', topupSchema);

module.exports = Topup;
