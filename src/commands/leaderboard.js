const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../database/models/User');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('🏆 Xem bảng xếp hạng người chơi giàu nhất'),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        const topUsers = await User.getLeaderboard(10);
        
        if (topUsers.length === 0) {
            return interaction.editReply('❌ Chưa có dữ liệu người chơi!');
        }

        const medals = ['🥇', '🥈', '🥉'];
        
        let description = '';
        for (let i = 0; i < topUsers.length; i++) {
            const userData = topUsers[i];
            const medal = medals[i] || `**${i + 1}.**`;
            // Dùng mention để Discord tự hiển thị tên
            const userMention = `<@${userData.oderId}>`;
            description += `${medal} ${userMention} - **${userData.balance.toLocaleString()}** 🪙\n`;
        }

        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('🏆 Bảng Xếp Hạng Đại Gia')
            .setDescription(description)
            .setTimestamp()
            .setFooter({ text: 'Top 10 người chơi giàu nhất' });

        await interaction.editReply({ embeds: [embed] });
    }
};
