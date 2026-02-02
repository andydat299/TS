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
const { createGameBoard, createResultBoard, createRollingAnimation } = require('./taixiu-canvas');

const gameSessions = new Map();
const BET_AMOUNTS = [100, 500, 1000, 5000, 10000];

function rollDice() {
    return Math.floor(Math.random() * 6) + 1;
}

function generateGameId() {
    return Math.random().toString(36).substring(2, 10);
}

// Tạo UI game với canvas image trong container
async function createGameUI(session, balance) {
    const imageBuffer = await createGameBoard(balance, session.betAmount, session.choice);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'taixiu.png' });

    const container = new ContainerBuilder().setAccentColor(0x9B59B6);

    // Canvas image
    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems({ media: { url: 'attachment://taixiu.png' } })
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Mức cược
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            BET_AMOUNTS.map(amount =>
                new ButtonBuilder()
                    .setCustomId(`taixiu_bet_${amount}_${session.gameId}`)
                    .setLabel(amount >= 1000 ? amount/1000 + 'K' : String(amount))
                    .setStyle(session.betAmount === amount ? ButtonStyle.Success : ButtonStyle.Secondary)
            )
        )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Tài / Xỉu
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`taixiu_choice_tai_${session.gameId}`)
                .setLabel('🔴 TÀI (11-18)')
                .setStyle(session.choice === 'tai' ? ButtonStyle.Danger : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`taixiu_choice_xiu_${session.gameId}`)
                .setLabel('🔵 XỈU (3-10)')
                .setStyle(session.choice === 'xiu' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Actions
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`taixiu_roll_${session.gameId}`)
                .setLabel('🎲 LẮC')
                .setStyle(ButtonStyle.Success)
                .setDisabled(!session.betAmount || !session.choice),
            new ButtonBuilder()
                .setCustomId(`taixiu_cancel_${session.gameId}`)
                .setLabel('❌ Thoát')
                .setStyle(ButtonStyle.Danger)
        )
    );

    return { 
        components: [container], 
        files: [attachment],
        flags: MessageFlags.IsComponentsV2 
    };
}

// Tạo UI kết quả với canvas
async function createResultUI(session, dice, total, won, winAmount, newBalance) {
    const imageBuffer = await createResultBoard(dice, total, won, session.betAmount, newBalance);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'result.png' });

    const container = new ContainerBuilder().setAccentColor(won ? 0x00FF00 : 0xFF0000);

    // Canvas result
    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems({ media: { url: 'attachment://result.png' } })
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Actions
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`taixiu_playagain_${session.gameId}`)
                .setLabel('🔄 Chơi lại')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`taixiu_quit_${session.gameId}`)
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
    const imageBuffer = await createRollingAnimation();
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'rolling.png' });

    const container = new ContainerBuilder().setAccentColor(0xFFFF00);

    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems({ media: { url: 'attachment://rolling.png' } })
    );

    return { 
        components: [container], 
        files: [attachment],
        flags: MessageFlags.IsComponentsV2 
    };
}

module.exports = {
    async startGame(interaction) {
        const userId = interaction.user.id;
        
        if (gameSessions.has(userId)) {
            return interaction.reply({ content: '❌ Bạn đang có game chưa kết thúc!', flags: MessageFlags.Ephemeral });
        }

        const balance = await interaction.client.getBalance(userId);
        
        if (balance < 100) {
            return interaction.reply({ content: '❌ Không đủ tiền! Dùng `/daily`', flags: MessageFlags.Ephemeral });
        }

        const gameId = generateGameId();
        const session = { 
            oderId: userId, 
            gameId,
            betAmount: null, 
            choice: null 
        };
        
        gameSessions.set(userId, session);
        
        const ui = await createGameUI(session, balance);
        await interaction.reply(ui);
    },

    async handleButton(interaction, action, params) {
        const userId = interaction.user.id;
        let session = gameSessions.get(userId);

        // Lấy gameId từ customId
        const customIdParts = interaction.customId.split('_');
        const gameId = customIdParts[customIdParts.length - 1];

        if (session && session.gameId !== gameId) {
            return interaction.reply({ content: '❌ Game này đã hết hạn!', flags: MessageFlags.Ephemeral });
        }

        switch (action) {
            case 'bet': {
                if (!session) {
                    return interaction.reply({ content: '❌ Hết hạn! Dùng /taixiu để chơi mới.', flags: MessageFlags.Ephemeral });
                }
                
                const amount = parseInt(params[0]);
                const balance = await interaction.client.getBalance(userId);
                
                if (amount > balance) {
                    return interaction.reply({ content: '❌ Không đủ tiền!', flags: MessageFlags.Ephemeral });
                }
                
                session.betAmount = amount;
                const ui = await createGameUI(session, balance);
                await interaction.update(ui);
                break;
            }

            case 'choice': {
                if (!session) {
                    return interaction.reply({ content: '❌ Hết hạn!', flags: MessageFlags.Ephemeral });
                }
                if (!session.betAmount) {
                    return interaction.reply({ content: '❌ Chọn mức cược trước!', flags: MessageFlags.Ephemeral });
                }
                if (session.choice) {
                    return interaction.reply({ content: '❌ Đã chọn rồi! Bấm LẮC để chơi.', flags: MessageFlags.Ephemeral });
                }
                
                const balance = await interaction.client.getBalance(userId);
                if (session.betAmount > balance) {
                    return interaction.reply({ content: '❌ Không đủ tiền!', flags: MessageFlags.Ephemeral });
                }
                
                // Trừ tiền ngay khi chọn
                session.choice = params[0];
                const newBalance = balance - session.betAmount;
                await interaction.client.setBalance(userId, newBalance);
                
                const ui = await createGameUI(session, newBalance);
                await interaction.update(ui);
                break;
            }

            case 'roll': {
                if (!session?.betAmount || !session?.choice) {
                    return interaction.reply({ content: '❌ Chọn đủ mức cược và Tài/Xỉu!', flags: MessageFlags.Ephemeral });
                }

                await interaction.deferUpdate();
                
                // Animation
                const rollingUI = await createRollingUI();
                await interaction.editReply(rollingUI);
                await new Promise(r => setTimeout(r, 2000));
                
                // Roll
                const dice = [rollDice(), rollDice(), rollDice()];
                const total = dice.reduce((a, b) => a + b, 0);
                const won = (total >= 11 ? 'tai' : 'xiu') === session.choice;
                
                // Cập nhật tiền
                const balance = await interaction.client.getBalance(userId);
                const winAmount = Math.floor(session.betAmount * 0.8);
                const newBalance = won ? balance + session.betAmount + winAmount : balance;
                if (won) await interaction.client.setBalance(userId, newBalance);
                
                const resultUI = await createResultUI(session, dice, total, won, winAmount, newBalance);
                await interaction.editReply(resultUI);
                break;
            }

            case 'playagain': {
                const balance = await interaction.client.getBalance(userId);
                if (balance < 100) {
                    gameSessions.delete(userId);
                    return interaction.reply({ content: '❌ Không đủ tiền!', flags: MessageFlags.Ephemeral });
                }
                
                const newGameId = generateGameId();
                session = { oderId: userId, gameId: newGameId, betAmount: null, choice: null };
                gameSessions.set(userId, session);
                
                const ui = await createGameUI(session, balance);
                await interaction.update(ui);
                break;
            }

            case 'cancel':
            case 'quit': {
                gameSessions.delete(userId);
                
                const container = new ContainerBuilder().setAccentColor(0x808080);
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('# 🎲 Đã thoát game\nCảm ơn bạn đã chơi!')
                );
                
                await interaction.update({ components: [container], files: [], flags: MessageFlags.IsComponentsV2 });
                break;
            }
        }
    },

    async handleSelect() {}
};
