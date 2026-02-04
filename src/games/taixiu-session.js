const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MediaGalleryBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    MessageFlags,
    AttachmentBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const { isCustomEmoji, getEmojiURL } = require('../utils/emoji');
const { GameSession, Jackpot } = require('../database/models/GameSession');

const activeSessions = new Map();
const SESSION_DURATION = 60;
const BET_AMOUNTS = [100, 1000, 5000, 10000]; // Giảm còn 4 để có chỗ cho nút tùy chỉnh

// Hũ (Jackpot) - lưu theo guild
const jackpotPool = new Map(); // guildId -> amount (cache)
const JACKPOT_RATE = 0.0005; // 0.05% mỗi lần cược đóng góp vào hũ
const JACKPOT_WIN_CONDITION = [1, 1, 1]; // 3 mặt 1 (hoặc có thể đổi)
const JACKPOT_EMOJI = '🏆';

async function getJackpot(guildId) {
    // Kiểm tra cache trước
    if (jackpotPool.has(guildId)) {
        return jackpotPool.get(guildId);
    }
    // Load từ DB
    const doc = await Jackpot.findOne({ guildId, gameType: 'taixiu' });
    const amount = doc ? doc.amount : 0;
    jackpotPool.set(guildId, amount);
    return amount;
}

async function addToJackpot(guildId, amount) {
    const current = await getJackpot(guildId);
    const newAmount = current + amount;
    jackpotPool.set(guildId, newAmount);
    // Lưu vào DB
    await Jackpot.findOneAndUpdate(
        { guildId, gameType: 'taixiu' },
        { amount: newAmount, updatedAt: new Date() },
        { upsert: true }
    );
}

async function resetJackpot(guildId) {
    jackpotPool.set(guildId, 0);
    await Jackpot.findOneAndUpdate(
        { guildId, gameType: 'taixiu' },
        { amount: 0, updatedAt: new Date() },
        { upsert: true }
    );
}

// Lưu session vào DB
async function saveSession(session) {
    await GameSession.findOneAndUpdate(
        { channelId: session.channelId },
        {
            guildId: session.guildId,
            gameType: 'taixiu',
            round: session.round,
            bets: session.bets,
            userSelections: session.userSelections,
            messageId: session.messageId,
            isActive: true,
            updatedAt: new Date()
        },
        { upsert: true }
    );
}

// Xóa session khỏi DB
async function deleteSession(channelId) {
    await GameSession.deleteOne({ channelId });
}

const COLORS = {
    textWhite: '#ffffff',
    textGold: '#ffd700',
    textGreen: '#00ff88',
    textRed: '#ff4757',
    tai: '#e74c3c',
    xiu: '#3498db'
};

// Config emoji cho title (thay bằng ID emoji Discord của bạn)
const DICE_EMOJI = '<:Cutedice:1468116987430305884>';
const CLOCK_EMOJI = '';

// Cache emoji
const emojiCache = new Map();

// Load Discord custom emoji
async function loadCustomEmoji(emoji) {
    if (!emoji || !isCustomEmoji(emoji)) return null;
    
    if (emojiCache.has(emoji)) {
        return emojiCache.get(emoji);
    }
    
    const url = getEmojiURL(emoji);
    if (url) {
        try {
            const img = await loadImage(url);
            emojiCache.set(emoji, img);
            return img;
        } catch (err) {
            console.error('Không thể load emoji:', url);
            return null;
        }
    }
    return null;
}

// Vẽ text kèm Discord emoji
async function drawTextWithEmoji(ctx, text, emoji, x, y, emojiSize = 20, emojiFirst = true) {
    const emojiImg = await loadCustomEmoji(emoji);
    
    ctx.save();
    const textWidth = ctx.measureText(text).width;
    
    if (emojiImg) {
        const totalWidth = emojiSize + 8 + textWidth;
        const startX = x - totalWidth / 2;
        
        if (emojiFirst) {
            ctx.drawImage(emojiImg, startX, y - emojiSize + 5, emojiSize, emojiSize);
            ctx.textAlign = 'left';
            ctx.fillText(text, startX + emojiSize + 8, y);
        } else {
            ctx.textAlign = 'left';
            ctx.fillText(text, startX, y);
            ctx.drawImage(emojiImg, startX + textWidth + 8, y - emojiSize + 5, emojiSize, emojiSize);
        }
    } else {
        ctx.textAlign = 'center';
        ctx.fillText(text, x, y);
    }
    ctx.restore();
}

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
    const height = 210;
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

    // Title + Round với emoji
    ctx.fillStyle = COLORS.textGold;
    ctx.font = 'bold 26px Arial';
    await drawTextWithEmoji(ctx, `TÀI XỈU #${session.round}`, DICE_EMOJI, width / 2, 38, 28, true);

    // Jackpot display
    const jackpotAmount = await getJackpot(session.guildId);
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#ff6b6b';
    ctx.textAlign = 'center';
    ctx.fillText(`${JACKPOT_EMOJI} HŨ: ${jackpotAmount.toLocaleString()}đ`, width / 2, 58);

    // Time + Players
    ctx.font = '18px Arial';
    ctx.fillStyle = timeLeft <= 10 ? COLORS.textRed : COLORS.textWhite;
    ctx.textAlign = 'center';
    ctx.fillText(`${timeLeft}s | ${Object.keys(session.bets).length} người chơi`, width / 2, 80);

    // Stats
    let taiTotal = 0, xiuTotal = 0, taiCount = 0, xiuCount = 0;
    Object.values(session.bets).forEach(bet => {
        if (bet.choice === 'tai') {
            taiTotal += bet.amount;
            taiCount++;
        } else {
            xiuTotal += bet.amount;
            xiuCount++;
        }
    });

    // TÀI box
    const boxWidth = 180;
    const boxHeight = 70;
    const boxY = 120;

    roundRect(ctx, 40, boxY, boxWidth, boxHeight, 10);
    ctx.fillStyle = '#2d3436';
    ctx.fill();
    ctx.strokeStyle = COLORS.tai;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = COLORS.tai;
    ctx.font = 'bold 18px Arial';
    ctx.fillText(`TÀI (${taiCount})`, 40 + boxWidth / 2, boxY + 25);
    ctx.fillStyle = COLORS.textGold;
    ctx.font = 'bold 18px Arial';
    ctx.fillText(`${taiTotal.toLocaleString()}đ`, 40 + boxWidth / 2, boxY + 52);

    // XỈU box
    roundRect(ctx, width - 40 - boxWidth, boxY, boxWidth, boxHeight, 10);
    ctx.fillStyle = '#2d3436';
    ctx.fill();
    ctx.strokeStyle = COLORS.xiu;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = COLORS.xiu;
    ctx.font = 'bold 18px Arial';
    ctx.fillText(`XỈU (${xiuCount})`, width - 40 - boxWidth / 2, boxY + 25);
    ctx.fillStyle = COLORS.textGold;
    ctx.font = 'bold 18px Arial';
    ctx.fillText(`${xiuTotal.toLocaleString()}đ`, width - 40 - boxWidth / 2, boxY + 52);

    return canvas.toBuffer('image/png');
}

// Canvas kết quả session
async function createResultCanvas(session, dice, total, winners, losers, isJackpot = false, jackpotAmount = 0) {
    const width = 500;
    const height = isJackpot && jackpotAmount > 0 ? 360 : 320;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const result = total >= 11 ? 'tai' : 'xiu';

    // Background - đổi màu nếu trúng jackpot
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    if (isJackpot && jackpotAmount > 0) {
        gradient.addColorStop(0, '#4a3a00');
        gradient.addColorStop(1, '#1a1a0e');
    } else {
        gradient.addColorStop(0, result === 'tai' ? '#4a1a1a' : '#1a1a4a');
        gradient.addColorStop(1, '#1a1a2e');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Border - vàng nếu jackpot
    ctx.strokeStyle = isJackpot && jackpotAmount > 0 ? '#ffd700' : (result === 'tai' ? COLORS.tai : COLORS.xiu);
    ctx.lineWidth = 4;
    ctx.strokeRect(5, 5, width - 10, height - 10);

    // Title
    ctx.fillStyle = COLORS.textGold;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`KẾT QUẢ PHIÊN #${session.round}`, width / 2, 35);

    // Hiển thị thông báo jackpot nếu trúng
    let offsetY = 0;
    if (isJackpot && jackpotAmount > 0) {
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(`${JACKPOT_EMOJI} NỔ HŨ: ${jackpotAmount.toLocaleString()}đ! ${JACKPOT_EMOJI}`, width / 2, 55);
        offsetY = 20;
    }

    // Dice
    const diceSize = 70;
    const diceStartX = (width - (diceSize * 3 + 20)) / 2;
    const diceY = 50 + offsetY;

    for (let i = 0; i < 3; i++) {
        const x = diceStartX + i * (diceSize + 10);
        
        roundRect(ctx, x, diceY, diceSize, diceSize, 10);
        ctx.fillStyle = '#0f3460';
        ctx.fill();
        ctx.strokeStyle = isJackpot && jackpotAmount > 0 ? '#ffd700' : '#e94560';
        ctx.lineWidth = 2;
        ctx.stroke();

        drawDiceFace(ctx, dice[i], x, diceY, diceSize);
    }

    // Result
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = result === 'tai' ? COLORS.tai : COLORS.xiu;
    ctx.fillText(`${total} -> ${result === 'tai' ? 'TÀI' : 'XỈU'}`, width / 2, 155 + offsetY);

    // Winners & Losers
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    
    let y = 185 + offsetY;
    if (winners.length > 0) {
        ctx.fillStyle = COLORS.textGreen;
        ctx.font = 'bold 14px Arial';
        ctx.fillText(`Thắng (${winners.length}):`, 30, y);
        y += 20;
        ctx.font = '13px Arial';
        winners.slice(0, 3).forEach(w => {
            // Cắt ngắn username nếu quá dài
            const name = w.username.length > 12 ? w.username.slice(0, 12) + '...' : w.username;
            let displayText = `${name}: +${w.win.toLocaleString()}đ`;
            if (w.jackpot) {
                displayText += ` (+${JACKPOT_EMOJI}${w.jackpot.toLocaleString()})`;
            }
            ctx.fillText(displayText, 30, y);
            y += 18;
        });
        if (winners.length > 3) {
            ctx.fillText(`... và ${winners.length - 3} người khác`, 30, y);
        }
    }

    y = 185 + offsetY;
    if (losers.length > 0) {
        ctx.fillStyle = COLORS.textRed;
        ctx.textAlign = 'right';
        ctx.font = 'bold 14px Arial';
        ctx.fillText(`Thua (${losers.length}):`, width - 30, y);
        y += 20;
        ctx.font = '13px Arial';
        losers.slice(0, 3).forEach(l => {
            // Cắt ngắn username nếu quá dài
            const name = l.username.length > 12 ? l.username.slice(0, 12) + '...' : l.username;
            ctx.fillText(`${name}: -${l.amount.toLocaleString()}đ`, width - 30, y);
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
            ...BET_AMOUNTS.map(amount =>
                new ButtonBuilder()
                    .setCustomId(`txs_bet_${amount}`)
                    .setLabel(amount >= 1000 ? amount/1000 + 'K' : String(amount))
                    .setStyle(ButtonStyle.Secondary)
            ),
            new ButtonBuilder()
                .setCustomId('txs_custombet')
                .setLabel('✏️')
                .setStyle(ButtonStyle.Primary)
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

function createResultUI(session, imageBuffer, isJackpot = false, jackpotAmount = 0, jackpotWinnerCount = 0) {
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'result.png' });
    const container = new ContainerBuilder().setAccentColor(isJackpot && jackpotAmount > 0 ? 0xFFD700 : 0xE74C3C);

    // Thông báo nổ hũ
    if (isJackpot && jackpotAmount > 0 && jackpotWinnerCount > 0) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# ${JACKPOT_EMOJI} NỔ HŨ! ${JACKPOT_EMOJI}\n**${jackpotWinnerCount}** người thắng chia nhau **${jackpotAmount.toLocaleString()}đ** từ hũ!`)
        );
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    }

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

            // Kiểm tra jackpot - 3 mặt giống nhau
            const isJackpot = dice[0] === dice[1] && dice[1] === dice[2];
            const jackpotAmount = await getJackpot(session.guildId);
            let jackpotWinners = [];

            const winners = [];
            const losers = [];

            // Xử lý kết quả
            for (const [oderId, bet] of Object.entries(session.bets)) {
                const won = bet.choice === result;
                // Lấy username
                let username = 'Unknown';
                try {
                    const user = await client.users.fetch(oderId);
                    username = user.displayName || user.username || 'Unknown';
                } catch (e) {}
                
                if (won) {
                    const balance = await client.getBalance(oderId);
                    let winAmount = Math.floor(bet.amount * 0.8);
                    
                    // Nếu trúng jackpot - chia đều cho những người thắng
                    let jackpotShare = 0;
                    if (isJackpot && jackpotAmount > 0) {
                        jackpotWinners.push({ oderId, username });
                    }
                    
                    await client.setBalance(oderId, balance + bet.amount + winAmount);
                    winners.push({ oderId, username, win: winAmount, total: bet.amount + winAmount });
                } else {
                    losers.push({ oderId, username, amount: bet.amount });
                }
            }

            // Chia jackpot cho người thắng
            if (isJackpot && jackpotAmount > 0 && jackpotWinners.length > 0) {
                const sharePerWinner = Math.floor(jackpotAmount / jackpotWinners.length);
                for (const winner of jackpotWinners) {
                    const balance = await client.getBalance(winner.oderId);
                    await client.setBalance(winner.oderId, balance + sharePerWinner);
                    // Cập nhật số tiền thắng trong winners
                    const winnerEntry = winners.find(w => w.oderId === winner.oderId);
                    if (winnerEntry) {
                        winnerEntry.jackpot = sharePerWinner;
                        winnerEntry.total += sharePerWinner;
                    }
                }
                await resetJackpot(session.guildId);
            }

            const resultImage = await createResultCanvas(session, dice, total, winners, losers, isJackpot, jackpotAmount);
            await msg.edit(createResultUI(session, resultImage, isJackpot, jackpotAmount, jackpotWinners.length));

            setTimeout(async () => {
                if (activeSessions.has(channelId)) {
                    session.round++;
                    session.bets = {};
                    session.userSelections = {};
                    await saveSession(session); // Lưu session mới
                    runSession(client, channelId);
                }
            }, 5000);
            return;
        }

        // Lưu session định kỳ mỗi 10 giây
        if (timeLeft % 10 === 0) {
            await saveSession(session);
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
    // Khôi phục sessions từ DB khi bot khởi động
    async restoreSessions(client) {
        try {
            const sessions = await GameSession.find({ gameType: 'taixiu', isActive: true });
            console.log(`🎲 Đang khôi phục ${sessions.length} phiên Tài Xỉu...`);
            
            for (const doc of sessions) {
                try {
                    const channel = await client.channels.fetch(doc.channelId);
                    if (!channel) {
                        await deleteSession(doc.channelId);
                        continue;
                    }

                    // Tạo session mới từ dữ liệu DB
                    const session = {
                        channelId: doc.channelId,
                        guildId: doc.guildId,
                        round: doc.round,
                        bets: doc.bets || {},
                        userSelections: doc.userSelections || {},
                        messageId: null,
                        interval: null
                    };

                    activeSessions.set(doc.channelId, session);
                    
                    // Bắt đầu phiên mới (reset bets vì phiên cũ đã hết hạn)
                    session.bets = {};
                    session.userSelections = {};
                    
                    await channel.send({ content: `🔄 **Bot đã khởi động lại! Tiếp tục phiên Tài Xỉu #${session.round}**` });
                    runSession(client, doc.channelId);
                    
                    console.log(`  ✅ Khôi phục kênh ${doc.channelId} - Phiên #${doc.round}`);
                } catch (err) {
                    console.log(`  ❌ Không thể khôi phục kênh ${doc.channelId}:`, err.message);
                    await deleteSession(doc.channelId);
                }
            }
            
            console.log(`🎲 Hoàn tất khôi phục phiên Tài Xỉu!`);
        } catch (err) {
            console.error('Lỗi khôi phục sessions:', err);
        }
    },

    async startSession(interaction) {
        const channelId = interaction.channel.id;
        const guildId = interaction.guild.id;
        
        if (activeSessions.has(channelId)) {
            return interaction.reply({ content: '❌ Đã có phiên game trong kênh này!', flags: MessageFlags.Ephemeral });
        }

        const session = {
            channelId, guildId, round: 1, bets: {}, userSelections: {}, messageId: null, interval: null
        };
        
        activeSessions.set(channelId, session);
        await saveSession(session); // Lưu vào DB

        await interaction.reply({ content: '🎲 **Phiên Tài Xỉu tự động bắt đầu!** (60s/phiên)', flags: MessageFlags.Ephemeral });
        runSession(interaction.client, channelId);
    },

    async stopSession(channelId) {
        const session = activeSessions.get(channelId);
        if (session) {
            if (session.interval) clearInterval(session.interval);
            activeSessions.delete(channelId);
            await deleteSession(channelId); // Xóa khỏi DB
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
                
                session.userSelections[userId].amount = amount;
                
                if (session.userSelections[userId].choice) {
                    // Đã chọn Tài/Xỉu trước đó, cược thêm vào choice đó
                    const newBalance = await interaction.client.getBalance(userId);
                    if (amount > newBalance) {
                        return interaction.reply({ content: '❌ Không đủ tiền!', flags: MessageFlags.Ephemeral });
                    }
                    await interaction.client.setBalance(userId, newBalance - amount);
                    
                    // Đóng góp vào hũ (0.05%)
                    const jackpotContrib = Math.floor(amount * JACKPOT_RATE);
                    if (jackpotContrib > 0) {
                        addToJackpot(session.guildId, jackpotContrib);
                    }
                    
                    // Cộng dồn tiền cược
                    if (!session.bets[userId]) {
                        session.bets[userId] = { amount: 0, choice: session.userSelections[userId].choice };
                    }
                    session.bets[userId].amount += amount;
                    
                    const totalBet = session.bets[userId].amount;
                    return interaction.reply({ 
                        content: `✅ Đã cược thêm **${amount.toLocaleString()}đ** vào **${session.userSelections[userId].choice === 'tai' ? '🔴 TÀI' : '🔵 XỈU'}** (tổng: ${totalBet.toLocaleString()}đ)!`, 
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
                
                // Kiểm tra đã cược bên kia chưa
                if (session.bets[userId] && session.bets[userId].choice && session.bets[userId].choice !== choice) {
                    return interaction.reply({ 
                        content: `❌ Bạn đã cược **${session.bets[userId].amount.toLocaleString()}đ** vào **${session.bets[userId].choice === 'tai' ? '🔴 TÀI' : '🔵 XỈU'}** rồi! Không thể đổi phe.`, 
                        flags: MessageFlags.Ephemeral 
                    });
                }
                
                if (amount > balance) {
                    return interaction.reply({ content: '❌ Không đủ tiền!', flags: MessageFlags.Ephemeral });
                }
                
                // Trừ tiền và cộng dồn bet
                await interaction.client.setBalance(userId, balance - amount);
                
                // Đóng góp vào hũ (0.05%)
                const jackpotContrib = Math.floor(amount * JACKPOT_RATE);
                if (jackpotContrib > 0) {
                    addToJackpot(session.guildId, jackpotContrib);
                }
                
                session.userSelections[userId].choice = choice;
                
                if (!session.bets[userId]) {
                    session.bets[userId] = { amount: 0, choice };
                }
                session.bets[userId].amount += amount;
                session.bets[userId].choice = choice;
                
                const totalBet = session.bets[userId].amount;
                return interaction.reply({ 
                    content: `✅ Đã cược **${amount.toLocaleString()}đ** vào **${choice === 'tai' ? '🔴 TÀI' : '🔵 XỈU'}** (tổng: ${totalBet.toLocaleString()}đ)!`, 
                    flags: MessageFlags.Ephemeral 
                });
            }

            case 'custombet': {
                const modal = new ModalBuilder()
                    .setCustomId('txs_custombet_modal')
                    .setTitle('Nhập mức cược tùy chỉnh');

                const amountInput = new TextInputBuilder()
                    .setCustomId('bet_amount')
                    .setLabel('Số tiền cược')
                    .setPlaceholder('Nhập số tiền (VD: 5000, 10k, 1m)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
                return interaction.showModal(modal);
            }
        }
    },

    async handleModal(interaction) {
        if (interaction.customId !== 'txs_custombet_modal') return;

        const channelId = interaction.channel.id;
        const session = activeSessions.get(channelId);
        
        if (!session) {
            return interaction.reply({ content: '❌ Phiên game đã kết thúc!', flags: MessageFlags.Ephemeral });
        }

        const userId = interaction.user.id;
        const amountStr = interaction.fields.getTextInputValue('bet_amount');
        
        // Parse amount (hỗ trợ k, m)
        let amount = 0;
        const lower = amountStr.toLowerCase().trim();
        if (lower.endsWith('m')) {
            amount = parseFloat(lower) * 1000000;
        } else if (lower.endsWith('k')) {
            amount = parseFloat(lower) * 1000;
        } else {
            amount = parseFloat(amountStr.replace(/,/g, ''));
        }

        if (isNaN(amount) || amount <= 0) {
            return interaction.reply({ content: '❌ Số tiền không hợp lệ!', flags: MessageFlags.Ephemeral });
        }

        amount = Math.floor(amount);
        const balance = await interaction.client.getBalance(userId);

        if (amount > balance) {
            return interaction.reply({ content: `❌ Không đủ tiền! Bạn có **${balance.toLocaleString()}đ**`, flags: MessageFlags.Ephemeral });
        }

        if (!session.userSelections[userId]) {
            session.userSelections[userId] = { amount: null, choice: null };
        }

        session.userSelections[userId].amount = amount;

        if (session.userSelections[userId].choice) {
            // Đã chọn Tài/Xỉu trước đó, cược thêm vào choice đó
            const newBalance = await interaction.client.getBalance(userId);
            if (amount > newBalance) {
                return interaction.reply({ content: '❌ Không đủ tiền!', flags: MessageFlags.Ephemeral });
            }
            await interaction.client.setBalance(userId, newBalance - amount);
            
            if (!session.bets[userId]) {
                session.bets[userId] = { amount: 0, choice: session.userSelections[userId].choice };
            }
            session.bets[userId].amount += amount;
            
            const totalBet = session.bets[userId].amount;
            return interaction.reply({ 
                content: `✅ Đã cược thêm **${amount.toLocaleString()}đ** vào **${session.userSelections[userId].choice === 'tai' ? '🔴 TÀI' : '🔵 XỈU'}** (tổng: ${totalBet.toLocaleString()}đ)!`, 
                flags: MessageFlags.Ephemeral 
            });
        }

        return interaction.reply({ 
            content: `✅ Đã chọn mức cược **${amount.toLocaleString()}đ**. Giờ hãy chọn TÀI hoặc XỈU!`, 
            flags: MessageFlags.Ephemeral 
        });
    },

    async handleSelect() {}
};
