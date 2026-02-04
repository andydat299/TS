const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Guild = require('../database/models/Guild');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setlogchannel')
        .setDescription('Chỉ định kênh nhận log nạp tiền / thắng thua')
        .addStringOption(opt =>
            opt.setName('type')
                .setDescription('Loại log để gán')
                .setRequired(true)
                .addChoices(
                    { name: 'deposit', value: 'deposit' },
                    { name: 'game', value: 'game' }
                )
        )
        .addChannelOption(opt =>
            opt.setName('channel')
                .setDescription('Kênh để gửi log')
                .setRequired(true)
        ),

    async execute(interaction) {
        // Permission: quản trị hoặc Manage Guild
        if (!interaction.memberPermissions.has('ManageGuild') && !interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Bạn cần quyền `Manage Guild` để sử dụng lệnh này.', ephemeral: true });
        }

        const type = interaction.options.getString('type');
        const channel = interaction.options.getChannel('channel');

        if (!channel || channel.type !== 0 && channel.type !== 'GUILD_TEXT') {
            // channel.type numeric differs by API version; accept any channel-like object
        }

        if (type === 'deposit') {
            await Guild.setDepositLogChannel(interaction.guild.id, channel.id);
            return interaction.reply({ content: `✅ Đã đặt kênh log nạp tiền: ${channel}`, ephemeral: true });
        }
        if (type === 'game') {
            await Guild.setGameLogChannel(interaction.guild.id, channel.id);
            return interaction.reply({ content: `✅ Đã đặt kênh log thắng/thua: ${channel}`, ephemeral: true });
        }

        return interaction.reply({ content: '❌ Loại không hợp lệ.', ephemeral: true });
    }
};
