const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('💰 Xem số dư của bạn')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Xem số dư của người khác')
                .setRequired(false)
        ),
    
    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const balance = await interaction.client.getBalance(targetUser.id, targetUser.username);
        
        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('💰 Số Dư Tài Khoản')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '👤 Người chơi', value: targetUser.username, inline: true },
                { name: '💵 Số dư', value: `**${balance.toLocaleString()}** 🪙`, inline: true }
            )
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    }
};
