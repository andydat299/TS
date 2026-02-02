const mongoose = require('mongoose');

async function connectDatabase() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Đã kết nối MongoDB thành công!');
    } catch (error) {
        console.error('❌ Lỗi kết nối MongoDB:', error.message);
        process.exit(1);
    }
}

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB đã ngắt kết nối');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ Lỗi MongoDB:', err);
});

module.exports = { connectDatabase };
