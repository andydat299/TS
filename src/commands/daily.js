const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const User = require('../database/models/User');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('🎁 Nhận tiền hàng ngày'),
    
    async execute(interaction) {
        // Command disabled by admin
        const embed = new EmbedBuilder()
            .setColor(0xFF4757)
            .setTitle('🚫 Lệnh đã tắt')
            .setDescription('Lệnh `/daily` hiện đang bị tắt bởi quản trị viên.')
            .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
};
