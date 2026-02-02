const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MediaGalleryBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    MessageFlags,
    AttachmentBuilder
} = require('discord.js');
const { createGameBoard, createResultBoard, createAnimationFrame } = require('./baucua-canvas');
const User = require('../database/models/User');

// Biểu tượng
const SYMBOLS = ['🦌', '🫎', '🐓', '🦐', '🦀', '🐟'];
const SYMBOL_NAMES = ['Nai', 'Bầu', 'Gà', 'Tôm', 'Cua', 'Cá'];
const SYMBOL_IDS = ['nai', 'bau', 'ga', 'tom', 'cua', 'ca'];
const BET_AMOUNTS = [100, 500, 1000, 5000, 10000];

// Lưu trữ game sessions
const gameSessions = new Map();

// Tạo ID game ngẫu nhiên
function generateGameId() {
    return Math.random().toString(36).substring(2, 10);
}

// Lắc xúc xắc (trả về index 0-5)
function rollDice() {
    return [
        Math.floor(Math.random() * 6),
        Math.floor(Math.random() * 6),
        Math.floor(Math.random() * 6)
    ];
}

// Tính kết quả
function calculateResults(bets, diceResults) {
    let totalWin = 0;
    let totalLoss = 0;
    const details = [];

    for (const [symbol, amount] of Object.entries(bets)) {
        const symbolIndex = SYMBOL_IDS.indexOf(symbol);
        const count = diceResults.filter(d => d === symbolIndex).length;
        
        if (count > 0) {
            const win = Math.floor(amount * count * 0.8);
            totalWin += win + amount;
            details.push(`${SYMBOLS[symbolIndex]} ${SYMBOL_NAMES[symbolIndex]}: +${(win + amount).toLocaleString()}đ (x${count})`);
        } else {
            totalLoss += amount;
            details.push(`${SYMBOLS[symbolIndex]} ${SYMBOL_NAMES[symbolIndex]}: -${amount.toLocaleString()}đ`);
        }
    }

    return { totalWin, totalLoss, details, netGain: totalWin - totalLoss };
}

// Tạo UI game với Components V2
async function createGameUI(session) {
    const totalBet = Object.values(session.bets).reduce((a, b) => a + b, 0);
    const imageBuffer = await createGameBoard(session.bets, session.betAmount);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'baucua.png' });

    const container = new ContainerBuilder().setAccentColor(0xE74C3C);

    // Canvas image
    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems({ media: { url: 'attachment://baucua.png' } })
    );

    // Info
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`💰 **${session.balance.toLocaleString()}đ** | 🎯 **${session.betAmount.toLocaleString()}đ** | 📊 **${totalBet.toLocaleString()}đ**`)
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Mức cược
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            BET_AMOUNTS.map(amount =>
                new ButtonBuilder()
                    .setCustomId(`baucua_amount_${amount}_${session.gameId}`)
                    .setLabel(amount >= 1000 ? amount/1000 + 'K' : String(amount))
                    .setStyle(session.betAmount === amount ? ButtonStyle.Success : ButtonStyle.Secondary)
            )
        )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Con vật hàng 1
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`baucua_bet_nai_${session.gameId}`)
                .setLabel(`🦌 Nai${session.bets.nai ? ` (${session.bets.nai.toLocaleString()})` : ''}`)
                .setStyle(session.bets.nai ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`baucua_bet_bau_${session.gameId}`)
                .setLabel(`🫎 Bầu${session.bets.bau ? ` (${session.bets.bau.toLocaleString()})` : ''}`)
                .setStyle(session.bets.bau ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`baucua_bet_ga_${session.gameId}`)
                .setLabel(`🐓 Gà${session.bets.ga ? ` (${session.bets.ga.toLocaleString()})` : ''}`)
                .setStyle(session.bets.ga ? ButtonStyle.Success : ButtonStyle.Secondary)
        )
    );

    // Con vật hàng 2
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`baucua_bet_tom_${session.gameId}`)
                .setLabel(`🦐 Tôm${session.bets.tom ? ` (${session.bets.tom.toLocaleString()})` : ''}`)
                .setStyle(session.bets.tom ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`baucua_bet_cua_${session.gameId}`)
                .setLabel(`🦀 Cua${session.bets.cua ? ` (${session.bets.cua.toLocaleString()})` : ''}`)
                .setStyle(session.bets.cua ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`baucua_bet_ca_${session.gameId}`)
                .setLabel(`🐟 Cá${session.bets.ca ? ` (${session.bets.ca.toLocaleString()})` : ''}`)
                .setStyle(session.bets.ca ? ButtonStyle.Success : ButtonStyle.Secondary)
        )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Controls
    const hasBets = Object.keys(session.bets).length > 0;
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`baucua_roll_${session.gameId}`)
                .setLabel('🎲 LẮC')
                .setStyle(ButtonStyle.Success)
                .setDisabled(!hasBets),
            new ButtonBuilder()
                .setCustomId(`baucua_clear_${session.gameId}`)
                .setLabel('🗑️ Xóa')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(!hasBets),
            new ButtonBuilder()
                .setCustomId(`baucua_cancel_${session.gameId}`)
                .setLabel('❌ Thoát')
                .setStyle(ButtonStyle.Secondary)
        )
    );

    return { 
        components: [container], 
        files: [attachment],
        flags: MessageFlags.IsComponentsV2 
    };
}

// Tạo UI kết quả
async function createResultUI(session, diceResults, results) {
    const imageBuffer = await createResultBoard(diceResults, session.bets, results);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'result.png' });

    const container = new ContainerBuilder()
        .setAccentColor(results.netGain >= 0 ? 0x00FF00 : 0xFF0000);

    // Canvas result
    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems({ media: { url: 'attachment://result.png' } })
    );

    // Balance info
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`💰 Số dư: **${session.balance.toLocaleString()}đ**`)
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Actions
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`baucua_continue_${session.gameId}`)
                .setLabel('🔄 Chơi tiếp')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`baucua_quit_${session.gameId}`)
                .setLabel('🚪 Thoát')
                .setStyle(ButtonStyle.Secondary)
        )
    );

    return { 
        components: [container], 
        files: [attachment],
        flags: MessageFlags.IsComponentsV2 
    };
}

// Rolling animation
async function createRollingUI() {
    const imageBuffer = await createAnimationFrame();
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'rolling.png' });

    const container = new ContainerBuilder().setAccentColor(0xFFFF00);

    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems({ media: { url: 'attachment://rolling.png' } })
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('## 🎲 Đang lắc xúc xắc...')
    );

    return { 
        components: [container], 
        files: [attachment],
        flags: MessageFlags.IsComponentsV2 
    };
}

// Bắt đầu game
async function startGame(interaction, betAmount = 1000) {
    const userId = interaction.user.id;
    
    if (gameSessions.has(userId)) {
        return interaction.reply({
            content: '❌ Bạn đang có game Bầu Cua chưa kết thúc!',
            flags: MessageFlags.Ephemeral
        });
    }

    let user = await User.findOne({ oderId: interaction.user.id });
    if (!user) {
        user = new User({ oderId: interaction.user.id, balance: 10000 });
        await user.save();
    }

    if (user.balance < betAmount) {
        return interaction.reply({
            content: `❌ Bạn không đủ tiền! Số dư: ${user.balance.toLocaleString()}đ`,
            flags: MessageFlags.Ephemeral
        });
    }

    const gameId = generateGameId();
    const session = {
        oderId: interaction.user.id,
        userId,
        gameId,
        balance: user.balance,
        betAmount,
        bets: {},
        messageId: null
    };

    gameSessions.set(userId, session);

    try {
        const ui = await createGameUI(session);
        const reply = await interaction.reply({ ...ui, fetchReply: true });
        session.messageId = reply.id;

        // Auto timeout sau 5 phút
        setTimeout(async () => {
            if (gameSessions.has(userId) && gameSessions.get(userId).gameId === gameId) {
                gameSessions.delete(userId);
                try {
                    const container = new ContainerBuilder().setAccentColor(0x808080);
                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent('# ⏰ Game đã hết thời gian!')
                    );
                    await reply.edit({ components: [container], files: [], flags: MessageFlags.IsComponentsV2 });
                } catch (e) {}
            }
        }, 300000);
    } catch (error) {
        console.error('Lỗi khởi tạo game Bầu Cua:', error);
        gameSessions.delete(userId);
        return interaction.reply({
            content: '❌ Có lỗi xảy ra khi khởi tạo game!',
            flags: MessageFlags.Ephemeral
        });
    }
}

// Xử lý button
async function handleButton(interaction) {
    const customId = interaction.customId;
    const userId = interaction.user.id;

    if (!customId.startsWith('baucua_')) return;

    const session = gameSessions.get(userId);
    
    if (!session) {
        return interaction.reply({
            content: '❌ Không tìm thấy game! Hãy bắt đầu game mới bằng `/baucua`',
            flags: MessageFlags.Ephemeral
        });
    }

    const parts = customId.split('_');
    const action = parts[1];
    const gameId = parts[parts.length - 1];

    if (session.gameId !== gameId) {
        return interaction.reply({
            content: '❌ Game này đã kết thúc!',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        if (action === 'amount') {
            // Đổi mức cược
            const amount = parseInt(parts[2]);
            session.betAmount = amount;
            
            const ui = await createGameUI(session);
            await interaction.update(ui);

        } else if (action === 'bet') {
            // Đặt cược
            const symbol = parts[2];
            const totalBet = Object.values(session.bets).reduce((a, b) => a + b, 0);
            
            if (totalBet + session.betAmount > session.balance) {
                return interaction.reply({
                    content: '❌ Không đủ tiền để đặt cược thêm!',
                    flags: MessageFlags.Ephemeral
                });
            }

            session.bets[symbol] = (session.bets[symbol] || 0) + session.betAmount;
            
            const ui = await createGameUI(session);
            await interaction.update(ui);

        } else if (action === 'roll') {
            const totalBet = Object.values(session.bets).reduce((a, b) => a + b, 0);
            
            if (totalBet === 0) {
                return interaction.reply({
                    content: '❌ Bạn chưa đặt cược!',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferUpdate();

            // Animation
            const rollingUI = await createRollingUI();
            await interaction.editReply(rollingUI);
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Roll
            const diceResults = rollDice();
            const results = calculateResults(session.bets, diceResults);

            // Cập nhật số dư
            session.balance += results.netGain;
            
            await User.findOneAndUpdate(
                { oderId: userId },
                { balance: session.balance }
            );

            // Reset bets
            session.bets = {};

            const resultUI = await createResultUI(session, diceResults, results);
            await interaction.editReply(resultUI);

        } else if (action === 'continue') {
            if (session.balance < session.betAmount) {
                gameSessions.delete(userId);
                const container = new ContainerBuilder().setAccentColor(0xFF0000);
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# 💸 Hết tiền!\nSố dư: **${session.balance.toLocaleString()}đ**`)
                );
                return interaction.update({ components: [container], files: [], flags: MessageFlags.IsComponentsV2 });
            }

            const ui = await createGameUI(session);
            await interaction.update(ui);

        } else if (action === 'clear') {
            session.bets = {};
            const ui = await createGameUI(session);
            await interaction.update(ui);

        } else if (action === 'cancel' || action === 'quit') {
            gameSessions.delete(userId);
            const container = new ContainerBuilder().setAccentColor(0x808080);
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# 👋 Đã thoát game\n💰 Số dư: **${session.balance.toLocaleString()}đ**`)
            );
            await interaction.update({ components: [container], files: [], flags: MessageFlags.IsComponentsV2 });
        }
    } catch (error) {
        console.error('Lỗi xử lý Bầu Cua:', error);
        try {
            await interaction.reply({
                content: '❌ Có lỗi xảy ra!',
                flags: MessageFlags.Ephemeral
            });
        } catch (e) {}
    }
}

module.exports = { startGame, handleButton };
