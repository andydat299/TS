const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const baucuaGame = require('../games/baucua');
const baucuaSession = require('../games/baucua-session');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('baucua')
        .setDescription('🦀 Chơi game Bầu Cua')
        .addSubcommand(sub =>
            sub.setName('choi')
                .setDescription('🦀 Chơi Bầu Cua một mình')
                .addIntegerOption(option =>
                    option.setName('cuoc')
                        .setDescription('Số tiền cược mỗi lần nhấn (mặc định: 1000)')
                        .setMinValue(100)
                        .setMaxValue(100000)))
        .addSubcommand(sub =>
            sub.setName('auto')
                .setDescription('🦀 Bắt đầu phiên Bầu Cua tự động (60s/phiên)'))
        .addSubcommand(sub =>
            sub.setName('stop')
                .setDescription('🛑 Dừng phiên Bầu Cua tự động')),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'choi':
                const betAmount = interaction.options.getInteger('cuoc') || 1000;
                await baucuaGame.startGame(interaction, betAmount);
                break;
            case 'auto':
                await baucuaSession.startSession(interaction);
                break;
            case 'stop':
                const stopped = baucuaSession.stopSession(interaction.channel.id);
                if (stopped) {
                    await interaction.reply({ content: '✅ Đã dừng phiên Bầu Cua!' });
                } else {
                    await interaction.reply({ content: '❌ Không có phiên nào đang chạy!', flags: MessageFlags.Ephemeral });
                }
                break;
        }
    }
};
