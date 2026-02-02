const { Events, ActivityType } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`✅ Bot đã sẵn sàng! Đăng nhập với tên ${client.user.tag}`);
        
        client.user.setActivity('🎲 Tài Xỉu & Bầu Cua', { 
            type: ActivityType.Playing 
        });
    }
};
