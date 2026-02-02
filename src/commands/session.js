const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const taixiuSession = require('../games/taixiu-session');
const baucuaSession = require('../games/baucua-session');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('session')
        .setDescription('🎰 Quản lý phiên game liên tục')
        .addSubcommand(sub =>
            sub.setName('taixiu')
                .setDescription('🎲 Bắt đầu phiên Tài Xỉu liên tục')
        )
        .addSubcommand(sub =>
            sub.setName('baucua')
                .setDescription('🦀 Bắt đầu phiên Bầu Cua liên tục')
        )
        .addSubcommand(sub =>
            sub.setName('stop')
                .setDescription('⏹️ Dừng phiên game đang chạy')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const channelId = interaction.channel.id;

        switch (subcommand) {
            case 'taixiu':
                await taixiuSession.startSession(interaction);
                break;
            case 'baucua':
                await baucuaSession.startSession(interaction);
                break;
            case 'stop':
                const stopped1 = taixiuSession.stopSession(channelId);
                const stopped2 = baucuaSession.stopSession(channelId);
                if (stopped1 || stopped2) {
                    await interaction.reply({ content: '⏹️ Đã dừng phiên game!', flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ content: '❌ Không có phiên game nào đang chạy!', flags: MessageFlags.Ephemeral });
                }
                break;
        }
    }
};
