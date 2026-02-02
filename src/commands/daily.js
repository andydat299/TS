const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const User = require('../database/models/User');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('🎁 Nhận tiền hàng ngày'),
    
    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.username;
        const now = new Date();
        const cooldownTime = 24 * 60 * 60 * 1000; // 24 giờ
        
        // Lấy user từ database
        const user = await User.getOrCreate(userId, username);
        
        if (user.lastDaily) {
            const lastClaim = new Date(user.lastDaily).getTime();
            const timeLeft = lastClaim + cooldownTime - now.getTime();
            
            if (timeLeft > 0) {
                const hours = Math.floor(timeLeft / (60 * 60 * 1000));
                const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
                
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('⏰ Chưa đến lúc!')
                    .setDescription(`Bạn cần đợi **${hours}h ${minutes}m** nữa để nhận daily!`)
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }
        
        // Random số tiền từ 1000 đến 5000
        const reward = Math.floor(Math.random() * 4001) + 1000;
        
        // Cập nhật database
        user.balance += reward;
        user.lastDaily = now;
        await user.save();
        
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🎁 Nhận Daily Thành Công!')
            .setDescription(`Bạn đã nhận được **${reward.toLocaleString()}** 🪙`)
            .addFields(
                { name: '💰 Số dư mới', value: `**${user.balance.toLocaleString()}** 🪙`, inline: true }
            )
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    }
};
