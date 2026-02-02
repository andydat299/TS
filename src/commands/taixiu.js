const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const taixiuGame = require('../games/taixiu');
const taixiuSession = require('../games/taixiu-session');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('taixiu')
        .setDescription('🎲 Chơi game Tài Xỉu')
        .addSubcommand(sub =>
            sub.setName('choi')
                .setDescription('🎲 Chơi Tài Xỉu một mình'))
        .addSubcommand(sub =>
            sub.setName('auto')
                .setDescription('🎲 Bắt đầu phiên Tài Xỉu tự động (60s/phiên)'))
        .addSubcommand(sub =>
            sub.setName('stop')
                .setDescription('🛑 Dừng phiên Tài Xỉu tự động')),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'choi':
                await taixiuGame.startGame(interaction);
                break;
            case 'auto':
                await taixiuSession.startSession(interaction);
                break;
            case 'stop':
                const stopped = taixiuSession.stopSession(interaction.channel.id);
                if (stopped) {
                    await interaction.reply({ content: '✅ Đã dừng phiên Tài Xỉu!' });
                } else {
                    await interaction.reply({ content: '❌ Không có phiên nào đang chạy!', flags: MessageFlags.Ephemeral });
                }
                break;
        }
    }
};
