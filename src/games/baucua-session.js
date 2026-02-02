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
const { getEmojiURL, isCustomEmoji } = require('../utils/emoji');

const activeSessions = new Map();
const SESSION_DURATION = 60;
const BET_AMOUNTS = [100, 500, 1000, 2000, 5000];

const COLORS = {
    textWhite: '#ffffff',
    textGold: '#ffd700',
    textGreen: '#00ff88',
    textRed: '#ff4757'
};

// Emoji có thể là Unicode hoặc Discord custom (<:name:id>)
// Ví dụ custom: '<:nai:1234567890123456789>'
const SYMBOLS = {
    nai: { name: 'Nai', emoji: '🦌', color: '#b8e994' },
    bau: { name: 'Bầu', emoji: '🫎', color: '#ff9f43' },
    ga: { name: 'Gà', emoji: '🐓', color: '#ffeaa7' },
    tom: { name: 'Tôm', emoji: '🦐', color: '#f368e0' },
    cua: { name: 'Cua', emoji: '🦀', color: '#ee5a24' },
    ca: { name: 'Cá', emoji: '🐟', color: '#54a0ff' }
};
const SYMBOL_LIST = Object.keys(SYMBOLS);

// Cache để lưu ảnh emoji đã load
const emojiImageCache = new Map();

// Hàm load emoji image (hỗ trợ Discord custom emoji)
async function loadEmojiImage(emoji) {
    if (!emoji) return null;
    
    // Kiểm tra cache
    if (emojiImageCache.has(emoji)) {
        return emojiImageCache.get(emoji);
    }
    
    // Nếu là Discord custom emoji
    if (isCustomEmoji(emoji)) {
        const url = getEmojiURL(emoji);
        if (url) {
            try {
                const img = await loadImage(url);
                emojiImageCache.set(emoji, img);
                return img;
            } catch (err) {
                console.error('Không thể load emoji:', url, err);
                return null;
            }
        }
    }
    
    return null; // Unicode emoji không cần load image
}

function rollSymbol() {
    return SYMBOL_LIST[Math.floor(Math.random() * SYMBOL_LIST.length)];
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
    const width = 600;
    const height = 240;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, width - 10, height - 10);

    // Title
    ctx.fillStyle = COLORS.textGold;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`🦀 BẦU CUA #${session.round}`, width / 2, 35);

    // Time + Players
    ctx.font = '16px Arial';
    ctx.fillStyle = timeLeft <= 10 ? COLORS.textRed : COLORS.textWhite;
    ctx.fillText(`⏱️ ${timeLeft}s | 👥 ${Object.keys(session.bets).length} người chơi`, width / 2, 58);

    // Stats cho từng con vật
    const stats = {};
    SYMBOL_LIST.forEach(s => stats[s] = 0);
    Object.values(session.bets).forEach(bet => {
        Object.entries(bet.choices).forEach(([symbol, amount]) => { 
            stats[symbol] += amount; 
        });
    });

    // Vẽ 6 ô thống kê (2 hàng x 3 cột) - căn giữa đều
    const cellWidth = 170;
    const cellHeight = 60;
    const gapX = 15;
    const gapY = 15;
    const totalWidth = 3 * cellWidth + 2 * gapX;
    const startX = (width - totalWidth) / 2;
    const startY = 75;

    // Pre-load tất cả emoji images
    const emojiImages = {};
    for (const symbol of SYMBOL_LIST) {
        emojiImages[symbol] = await loadEmojiImage(SYMBOLS[symbol].emoji);
    }

    for (let i = 0; i < 6; i++) {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = startX + col * (cellWidth + gapX);
        const y = startY + row * (cellHeight + gapY);
        const symbol = SYMBOL_LIST[i];
        const data = SYMBOLS[symbol];
        const total = stats[symbol];
        const emojiImg = emojiImages[symbol];

        // Vẽ ô nền
        roundRect(ctx, x, y, cellWidth, cellHeight, 10);
        ctx.fillStyle = total > 0 ? '#1e5128' : '#0f3460';
        ctx.fill();
        ctx.strokeStyle = data.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Emoji lớn ở giữa ô (làm mờ như watermark)
        ctx.save();
        ctx.globalAlpha = 0.2;
        if (emojiImg) {
            const imgSize = 50;
            ctx.drawImage(emojiImg, x + cellWidth / 2 - imgSize / 2, y + cellHeight / 2 - imgSize / 2, imgSize, imgSize);
        } else {
            ctx.font = '50px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(data.emoji, x + cellWidth / 2, y + cellHeight / 2);
        }
        ctx.restore();

        // Emoji bên trái
        if (emojiImg) {
            const emojiSize = 28;
            ctx.drawImage(emojiImg, x + 12, y + cellHeight / 2 - emojiSize / 2, emojiSize, emojiSize);
        } else {
            ctx.font = '26px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(data.emoji, x + 28, y + cellHeight / 2);
        }

        // Tên con vật - bên phải trên
        ctx.fillStyle = data.color;
        ctx.font = 'bold 15px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(data.name, x + cellWidth - 15, y + 20);

        // Số tiền cược - bên phải dưới
        ctx.fillStyle = total > 0 ? COLORS.textGreen : COLORS.textWhite;
        ctx.font = '14px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${total.toLocaleString()}đ`, x + cellWidth - 15, y + cellHeight - 18);
    }

    return canvas.toBuffer('image/png');
}

// Canvas kết quả
async function createResultCanvas(session, results, winners, losers) {
    const width = 550;
    const height = 350;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#2d1f1f');
    gradient.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 4;
    ctx.strokeRect(5, 5, width - 10, height - 10);

    // Title
    ctx.fillStyle = COLORS.textGold;
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`🦀 KẾT QUẢ PHIÊN #${session.round}`, width / 2, 32);

    // Pre-load emoji images cho results
    const resultImages = [];
    for (const r of results) {
        resultImages.push(await loadEmojiImage(SYMBOLS[r].emoji));
    }

    // 3 kết quả - vẽ emoji
    const emojiSize = 50;
    const startResultX = width / 2 - (3 * emojiSize + 2 * 20) / 2; // 20 là gap
    for (let i = 0; i < 3; i++) {
        const rX = startResultX + i * (emojiSize + 20);
        const rY = 55;
        const img = resultImages[i];
        
        if (img) {
            // Discord custom emoji
            ctx.drawImage(img, rX, rY, emojiSize, emojiSize);
        } else {
            // Unicode emoji
            ctx.font = '50px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(SYMBOLS[results[i]].emoji, rX, rY + emojiSize - 5);
        }
    }

    // Count results
    const counts = {};
    results.forEach(r => { counts[r] = (counts[r] || 0) + 1; });

    // Hiển thị count (dùng text cho đơn giản)
    ctx.font = '14px Arial';
    ctx.fillStyle = COLORS.textWhite;
    ctx.textAlign = 'center';
    let countText = SYMBOL_LIST.map(s => counts[s] ? `${SYMBOLS[s].emoji}×${counts[s]}` : '').filter(Boolean).join('  ');
    ctx.fillText(countText, width / 2, 120);

    // Separator
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 135);
    ctx.lineTo(width - 30, 135);
    ctx.stroke();

    // Winners
    let y = 160;
    ctx.textAlign = 'left';
    
    if (winners.length > 0) {
        ctx.fillStyle = COLORS.textGreen;
        ctx.font = 'bold 15px Arial';
        ctx.fillText(`🎉 Thắng (${winners.length}):`, 30, y);
        y += 22;
        ctx.font = '13px Arial';
        winners.slice(0, 4).forEach(w => {
            ctx.fillText(`   +${w.win.toLocaleString()}đ`, 30, y);
            y += 18;
        });
        if (winners.length > 4) {
            ctx.fillText(`   ... và ${winners.length - 4} người khác`, 30, y);
        }
    }

    // Losers
    y = 160;
    ctx.textAlign = 'right';
    
    if (losers.length > 0) {
        ctx.fillStyle = COLORS.textRed;
        ctx.font = 'bold 15px Arial';
        ctx.fillText(`😢 Thua (${losers.length}):`, width - 30, y);
        y += 22;
        ctx.font = '13px Arial';
        losers.slice(0, 4).forEach(l => {
            ctx.fillText(`-${l.amount.toLocaleString()}đ`, width - 30, y);
            y += 18;
        });
        if (losers.length > 4) {
            ctx.fillText(`... và ${losers.length - 4} người khác`, width - 30, y);
        }
    }

    // Footer
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.textWhite;
    ctx.font = '12px Arial';
    ctx.fillText('Phiên mới sẽ bắt đầu sau 5 giây...', width / 2, height - 15);

    return canvas.toBuffer('image/png');
}

function createSessionUI(session, timeLeft, imageBuffer) {
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'session.png' });
    const container = new ContainerBuilder().setAccentColor(0xE74C3C);

    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems({ media: { url: 'attachment://session.png' } })
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Mức cược
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            BET_AMOUNTS.map(amount =>
                new ButtonBuilder()
                    .setCustomId(`bcs_bet_${amount}`)
                    .setLabel(amount >= 1000 ? amount/1000 + 'K' : String(amount))
                    .setStyle(ButtonStyle.Secondary)
            )
        )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Con vật hàng 1
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            SYMBOL_LIST.slice(0, 3).map(symbol =>
                new ButtonBuilder()
                    .setCustomId(`bcs_symbol_${symbol}`)
                    .setLabel(SYMBOLS[symbol].emoji)
                    .setStyle(ButtonStyle.Secondary)
            )
        )
    );

    // Con vật hàng 2
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            SYMBOL_LIST.slice(3, 6).map(symbol =>
                new ButtonBuilder()
                    .setCustomId(`bcs_symbol_${symbol}`)
                    .setLabel(SYMBOLS[symbol].emoji)
                    .setStyle(ButtonStyle.Secondary)
            )
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

            const results = [rollSymbol(), rollSymbol(), rollSymbol()];
            const counts = {};
            results.forEach(r => { counts[r] = (counts[r] || 0) + 1; });

            const winners = [];
            const losers = [];

            // Xử lý kết quả
            for (const [oderId, bet] of Object.entries(session.bets)) {
                let totalWin = 0;
                let totalLoss = 0;
                
                Object.entries(bet.choices).forEach(([symbol, amount]) => {
                    const count = counts[symbol] || 0;
                    if (count > 0) {
                        totalWin += amount + Math.floor(amount * count * 0.8);
                    } else {
                        totalLoss += amount;
                    }
                });
                
                if (totalWin > 0) {
                    const balance = await client.getBalance(oderId);
                    await client.setBalance(oderId, balance + totalWin);
                    winners.push({ oderId, win: totalWin - totalLoss });
                } else if (totalLoss > 0) {
                    losers.push({ oderId, amount: totalLoss });
                }
            }

            const resultImage = await createResultCanvas(session, results, winners, losers);
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

        await interaction.reply({ content: '🦀 **Phiên Bầu Cua tự động bắt đầu!** (60s/phiên)', flags: MessageFlags.Ephemeral });
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
            session.userSelections[userId] = { amount: null };
        }

        switch (action) {
            case 'bet': {
                const amount = parseInt(params[0]);
                const balance = await interaction.client.getBalance(userId);
                
                if (amount > balance) {
                    return interaction.reply({ content: '❌ Không đủ tiền!', flags: MessageFlags.Ephemeral });
                }
                
                session.userSelections[userId].amount = amount;
                return interaction.reply({ 
                    content: `✅ Đã chọn mức cược **${amount.toLocaleString()}đ**. Giờ hãy chọn con vật!`, 
                    flags: MessageFlags.Ephemeral 
                });
            }

            case 'symbol': {
                const symbol = params[0];
                
                // Nếu chưa chọn số tiền, dùng mặc định 1000
                if (!session.userSelections[userId].amount) {
                    session.userSelections[userId].amount = 1000;
                }
                
                const amount = session.userSelections[userId].amount;
                const balance = await interaction.client.getBalance(userId);
                
                if (amount > balance) {
                    return interaction.reply({ content: '❌ Không đủ tiền!', flags: MessageFlags.Ephemeral });
                }
                
                // Trừ tiền
                await interaction.client.setBalance(userId, balance - amount);
                
                // Lưu bet
                if (!session.bets[userId]) {
                    session.bets[userId] = { choices: {} };
                }
                session.bets[userId].choices[symbol] = (session.bets[userId].choices[symbol] || 0) + amount;
                
                const totalOnSymbol = session.bets[userId].choices[symbol];
                return interaction.reply({ 
                    content: `✅ Đã cược **${amount.toLocaleString()}đ** vào **${SYMBOLS[symbol].emoji} ${SYMBOLS[symbol].name}** (tổng: ${totalOnSymbol.toLocaleString()}đ)`, 
                    flags: MessageFlags.Ephemeral 
                });
            }
        }
    },

    async handleSelect() {}
};
