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
const { createCanvas, loadImage } = require('canvas');
const { drawEmoji, isCustomEmoji } = require('../utils/emoji');

const activeSessions = new Map();
const SESSION_DURATION = 60;
const BET_AMOUNTS = [100, 500, 1000, 5000, 10000];

const COLORS = {
    textWhite: '#ffffff',
    textGold: '#ffd700',
    textGreen: '#00ff88',
    textRed: '#ff4757',
    tai: '#e74c3c',
    xiu: '#3498db'
};

function rollDice() {
    return Math.floor(Math.random() * 6) + 1;
}

// Vẽ mặt xúc xắc bằng chấm tròn
function drawDiceFace(ctx, value, x, y, size) {
    const dotSize = size * 0.12;
    const padding = size * 0.22;
    
    ctx.fillStyle = '#ffffff';
    
    const positions = {
        center: { x: x + size/2, y: y + size/2 },
        topLeft: { x: x + padding, y: y + padding },
        topRight: { x: x + size - padding, y: y + padding },
        bottomLeft: { x: x + padding, y: y + size - padding },
        bottomRight: { x: x + size - padding, y: y + size - padding },
        midLeft: { x: x + padding, y: y + size/2 },
        midRight: { x: x + size - padding, y: y + size/2 }
    };
    
    const drawDot = (pos) => {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, dotSize, 0, Math.PI * 2);
        ctx.fill();
    };
    
    switch(value) {
        case 1: drawDot(positions.center); break;
        case 2: drawDot(positions.topLeft); drawDot(positions.bottomRight); break;
        case 3: drawDot(positions.topLeft); drawDot(positions.center); drawDot(positions.bottomRight); break;
        case 4: drawDot(positions.topLeft); drawDot(positions.topRight); drawDot(positions.bottomLeft); drawDot(positions.bottomRight); break;
        case 5: drawDot(positions.topLeft); drawDot(positions.topRight); drawDot(positions.center); drawDot(positions.bottomLeft); drawDot(positions.bottomRight); break;
        case 6: drawDot(positions.topLeft); drawDot(positions.topRight); drawDot(positions.midLeft); drawDot(positions.midRight); drawDot(positions.bottomLeft); drawDot(positions.bottomRight); break;
    }
}

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

// Canvas cho session
async function createSessionCanvas(session, timeLeft) {
    const width = 500;
    const height = 180;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = '#9b59b6';
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, width - 10, height - 10);

    // Title + Round
    ctx.fillStyle = COLORS.textGold;
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`🎲 TÀI XỈU #${session.round}`, width / 2, 38);

    // Time + Players
    ctx.font = '18px Arial';
    ctx.fillStyle = timeLeft <= 10 ? COLORS.textRed : COLORS.textWhite;
    ctx.fillText(`⏱️ ${timeLeft}s | 👥 ${Object.keys(session.bets).length} người chơi`, width / 2, 68);

    // Stats
    let taiTotal = 0, xiuTotal = 0;
    Object.values(session.bets).forEach(bet => {
        if (bet.choice === 'tai') taiTotal += bet.amount;
        else xiuTotal += bet.amount;
    });

    // TÀI box
    const boxWidth = 180;
    const boxHeight = 70;
    const boxY = 90;

    roundRect(ctx, 40, boxY, boxWidth, boxHeight, 10);
    ctx.fillStyle = '#2d3436';
    ctx.fill();
    ctx.strokeStyle = COLORS.tai;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = COLORS.tai;
    ctx.font = 'bold 20px Arial';
    ctx.fillText('🔴 TÀI', 40 + boxWidth / 2, boxY + 28);
    ctx.fillStyle = COLORS.textGold;
    ctx.font = 'bold 18px Arial';
    ctx.fillText(`${taiTotal.toLocaleString()}đ`, 40 + boxWidth / 2, boxY + 55);

    // XỈU box
    roundRect(ctx, width - 40 - boxWidth, boxY, boxWidth, boxHeight, 10);
    ctx.fillStyle = '#2d3436';
    ctx.fill();
    ctx.strokeStyle = COLORS.xiu;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = COLORS.xiu;
    ctx.font = 'bold 20px Arial';
    ctx.fillText('🔵 XỈU', width - 40 - boxWidth / 2, boxY + 28);
    ctx.fillStyle = COLORS.textGold;
    ctx.font = 'bold 18px Arial';
    ctx.fillText(`${xiuTotal.toLocaleString()}đ`, width - 40 - boxWidth / 2, boxY + 55);

    return canvas.toBuffer('image/png');
}

// Canvas kết quả session
async function createResultCanvas(session, dice, total, winners, losers) {
    const width = 500;
    const height = 320;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const result = total >= 11 ? 'tai' : 'xiu';

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, result === 'tai' ? '#4a1a1a' : '#1a1a4a');
    gradient.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = result === 'tai' ? COLORS.tai : COLORS.xiu;
    ctx.lineWidth = 4;
    ctx.strokeRect(5, 5, width - 10, height - 10);

    // Title
    ctx.fillStyle = COLORS.textGold;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`🎲 KẾT QUẢ PHIÊN #${session.round}`, width / 2, 35);

    // Dice
    const diceSize = 70;
    const diceStartX = (width - (diceSize * 3 + 20)) / 2;
    const diceY = 50;

    for (let i = 0; i < 3; i++) {
        const x = diceStartX + i * (diceSize + 10);
        
        roundRect(ctx, x, diceY, diceSize, diceSize, 10);
        ctx.fillStyle = '#0f3460';
        ctx.fill();
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 2;
        ctx.stroke();

        drawDiceFace(ctx, dice[i], x, diceY, diceSize);
    }

    // Result
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = result === 'tai' ? COLORS.tai : COLORS.xiu;
    ctx.fillText(`${total} → ${result === 'tai' ? '🔴 TÀI' : '🔵 XỈU'}`, width / 2, 155);

    // Winners & Losers
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    
    let y = 185;
    if (winners.length > 0) {
        ctx.fillStyle = COLORS.textGreen;
        ctx.fillText(`🎉 Thắng (${winners.length}):`, 30, y);
        y += 20;
        winners.slice(0, 3).forEach(w => {
            ctx.fillText(`   +${w.win.toLocaleString()}đ`, 30, y);
            y += 18;
        });
        if (winners.length > 3) {
            ctx.fillText(`   ... và ${winners.length - 3} người khác`, 30, y);
        }
    }

    y = 185;
    if (losers.length > 0) {
        ctx.fillStyle = COLORS.textRed;
        ctx.textAlign = 'right';
        ctx.fillText(`😢 Thua (${losers.length}):`, width - 30, y);
        y += 20;
        losers.slice(0, 3).forEach(l => {
            ctx.fillText(`-${l.amount.toLocaleString()}đ`, width - 30, y);
            y += 18;
        });
        if (losers.length > 3) {
            ctx.fillText(`... và ${losers.length - 3} người khác`, width - 30, y);
        }
    }

    // Footer
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.textWhite;
    ctx.font = '13px Arial';
    ctx.fillText('Phiên mới sẽ bắt đầu sau 5 giây...', width / 2, height - 15);

    return canvas.toBuffer('image/png');
}

function createSessionUI(session, timeLeft, imageBuffer) {
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'session.png' });
    const container = new ContainerBuilder().setAccentColor(0x9B59B6);

    // Canvas image
    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems({ media: { url: 'attachment://session.png' } })
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Mức cược
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            BET_AMOUNTS.map(amount =>
                new ButtonBuilder()
                    .setCustomId(`txs_bet_${amount}`)
                    .setLabel(amount >= 1000 ? amount/1000 + 'K' : String(amount))
                    .setStyle(ButtonStyle.Secondary)
            )
        )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Tài / Xỉu
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('txs_choice_tai')
                .setLabel('🔴 TÀI (11-18)')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('txs_choice_xiu')
                .setLabel('🔵 XỈU (3-10)')
                .setStyle(ButtonStyle.Primary)
        )
    );

    return { 
        components: [container], 
        files: [attachment],
        flags: MessageFlags.IsComponentsV2 
    };
}

function createResultUI(session, imageBuffer) {
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'result.png' });
    const container = new ContainerBuilder().setAccentColor(0xE74C3C);

    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems({ media: { url: 'attachment://result.png' } })
    );

    return { 
        components: [container], 
        files: [attachment],
        flags: MessageFlags.IsComponentsV2 
    };
}

async function runSession(client, channelId) {
    const session = activeSessions.get(channelId);
    if (!session) return;

    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    let timeLeft = SESSION_DURATION;
    const imageBuffer = await createSessionCanvas(session, timeLeft);
    const msg = await channel.send(createSessionUI(session, timeLeft, imageBuffer));
    session.messageId = msg.id;

    const interval = setInterval(async () => {
        timeLeft--;
        
        if (timeLeft <= 0 || !activeSessions.has(channelId)) {
            clearInterval(interval);
            if (!activeSessions.has(channelId)) return;

            const dice = [rollDice(), rollDice(), rollDice()];
            const total = dice.reduce((a, b) => a + b, 0);
            const result = total >= 11 ? 'tai' : 'xiu';

            const winners = [];
            const losers = [];

            // Xử lý kết quả
            for (const [oderId, bet] of Object.entries(session.bets)) {
                const won = bet.choice === result;
                if (won) {
                    const balance = await client.getBalance(oderId);
                    const winAmount = Math.floor(bet.amount * 0.8);
                    await client.setBalance(oderId, balance + bet.amount + winAmount);
                    winners.push({ oderId, win: winAmount });
                } else {
                    losers.push({ oderId, amount: bet.amount });
                }
            }

            const resultImage = await createResultCanvas(session, dice, total, winners, losers);
            await msg.edit(createResultUI(session, resultImage));

            setTimeout(() => {
                if (activeSessions.has(channelId)) {
                    session.round++;
                    session.bets = {};
                    session.userSelections = {};
                    runSession(client, channelId);
                }
            }, 5000);
            return;
        }

        if (timeLeft % 10 === 0 || timeLeft <= 10) {
            try {
                const updateImage = await createSessionCanvas(session, timeLeft);
                await msg.edit(createSessionUI(session, timeLeft, updateImage));
            } catch (e) {}
        }
    }, 1000);

    session.interval = interval;
}

module.exports = {
    async startSession(interaction) {
        const channelId = interaction.channel.id;
        
        if (activeSessions.has(channelId)) {
            return interaction.reply({ content: '❌ Đã có phiên game trong kênh này!', flags: MessageFlags.Ephemeral });
        }

        activeSessions.set(channelId, {
            channelId, round: 1, bets: {}, userSelections: {}, messageId: null, interval: null
        });

        await interaction.reply({ content: '🎲 **Phiên Tài Xỉu tự động bắt đầu!** (60s/phiên)', flags: MessageFlags.Ephemeral });
        runSession(interaction.client, channelId);
    },

    stopSession(channelId) {
        const session = activeSessions.get(channelId);
        if (session) {
            if (session.interval) clearInterval(session.interval);
            activeSessions.delete(channelId);
            return true;
        }
        return false;
    },

    async handleButton(interaction, action, params) {
        const channelId = interaction.channel.id;
        const session = activeSessions.get(channelId);
        
        if (!session) {
            return interaction.reply({ content: '❌ Không có phiên game!', flags: MessageFlags.Ephemeral });
        }

        const userId = interaction.user.id;
        if (!session.userSelections[userId]) {
            session.userSelections[userId] = { amount: null, choice: null };
        }

        switch (action) {
            case 'bet': {
                const amount = parseInt(params[0]);
                const balance = await interaction.client.getBalance(userId);
                
                if (amount > balance) {
                    return interaction.reply({ content: '❌ Không đủ tiền!', flags: MessageFlags.Ephemeral });
                }
                
                // Hoàn tiền cược cũ nếu có
                if (session.bets[userId]) {
                    const oldAmount = session.bets[userId].amount;
                    await interaction.client.setBalance(userId, balance + oldAmount);
                }
                
                session.userSelections[userId].amount = amount;
                
                if (session.userSelections[userId].choice) {
                    // Đã chọn Tài/Xỉu, trừ tiền và lưu bet
                    const newBalance = await interaction.client.getBalance(userId);
                    if (amount > newBalance) {
                        return interaction.reply({ content: '❌ Không đủ tiền!', flags: MessageFlags.Ephemeral });
                    }
                    await interaction.client.setBalance(userId, newBalance - amount);
                    session.bets[userId] = {
                        amount,
                        choice: session.userSelections[userId].choice
                    };
                    return interaction.reply({ 
                        content: `✅ Đã cược **${amount.toLocaleString()}đ** vào **${session.userSelections[userId].choice === 'tai' ? '🔴 TÀI' : '🔵 XỈU'}**!`, 
                        flags: MessageFlags.Ephemeral 
                    });
                }
                
                return interaction.reply({ 
                    content: `✅ Đã chọn mức cược **${amount.toLocaleString()}đ**. Giờ hãy chọn TÀI hoặc XỈU!`, 
                    flags: MessageFlags.Ephemeral 
                });
            }

            case 'choice': {
                const choice = params[0];
                
                // Nếu chưa chọn số tiền, dùng mặc định 1000
                if (!session.userSelections[userId].amount) {
                    session.userSelections[userId].amount = 1000;
                }
                
                const balance = await interaction.client.getBalance(userId);
                const amount = session.userSelections[userId].amount;
                
                // Hoàn tiền cược cũ nếu có
                if (session.bets[userId]) {
                    const oldAmount = session.bets[userId].amount;
                    await interaction.client.setBalance(userId, balance + oldAmount);
                }
                
                const newBalance = await interaction.client.getBalance(userId);
                if (amount > newBalance) {
                    return interaction.reply({ content: '❌ Không đủ tiền!', flags: MessageFlags.Ephemeral });
                }
                
                // Trừ tiền và lưu bet
                await interaction.client.setBalance(userId, newBalance - amount);
                session.userSelections[userId].choice = choice;
                session.bets[userId] = { amount, choice };
                
                return interaction.reply({ 
                    content: `✅ Đã cược **${amount.toLocaleString()}đ** vào **${choice === 'tai' ? '🔴 TÀI' : '🔵 XỈU'}**!`, 
                    flags: MessageFlags.Ephemeral 
                });
            }
        }
    },

    async handleSelect() {}
};
