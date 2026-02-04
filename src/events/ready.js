const { Events, ActivityType } = require('discord.js');
const taixiuSession = require('../games/taixiu-session');
const baucuaSession = require('../games/baucua-session');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`✅ Bot đã sẵn sàng! Đăng nhập với tên ${client.user.tag}`);
        
        client.user.setActivity('🎲 Tài Xỉu & Bầu Cua', { 
            type: ActivityType.Playing 
        });

        // Khôi phục các phiên game từ DB
        await taixiuSession.restoreSessions(client);
        await baucuaSession.restoreSessions(client);
    }
};
