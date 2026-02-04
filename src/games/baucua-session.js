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
const { getEmojiURL, isCustomEmoji, buttonEmoji } = require('../utils/emoji');

const activeSessions = new Map();
const SESSION_DURATION = 60;
const BET_AMOUNTS = [100, 500, 1000, 2000, 5000];

const COLORS = {
    textWhite: '#ffffff',
    textGold: '#ffd700',
    textGreen: '#00ff88',
    textRed: '#ff4757'
};

// Emoji có thể là Discord custom (<:name:id>)
// Ví dụ: '<:nai:1234567890123456789>'
// Để trống icon sẽ fallback vẽ bằng hình học
const SYMBOLS = {
    nai: { name: 'Nai', emoji: '<:nai:1408346889908256839>', color: '#b8e994' },
    bau: { name: 'Bầu', emoji: '<:bau:1408346338332114945>', color: '#ff9f43' },
    ga: { name: 'Gà', emoji: '<:ga:1408346501528420384>', color: '#ffeaa7' },
    tom: { name: 'Tôm', emoji: '<:tom:1408347081399341097>', color: '#f368e0' },
    cua: { name: 'Cua', emoji: '<:cua:1408346397794766880>', color: '#ee5a24' },
    ca: { name: 'Cá', emoji: '<:ca:1408346991515144222>', color: '#54a0ff' }
};
const SYMBOL_LIST = Object.keys(SYMBOLS);

// Cache để lưu ảnh emoji đã load
const emojiImageCache = new Map();

// Load Discord custom emoji image
async function loadCustomEmoji(emoji) {
    if (!emoji || !isCustomEmoji(emoji)) return null;
    
    if (emojiImageCache.has(emoji)) {
        return emojiImageCache.get(emoji);
    }
    
    const url = getEmojiURL(emoji);
    if (url) {
        try {
            const img = await loadImage(url);
            emojiImageCache.set(emoji, img);
            return img;
        } catch (err) {
            console.error('Không thể load emoji:', url);
            return null;
        }
    }
    return null;
}

// Vẽ icon con vật - hỗ trợ Discord custom emoji hoặc fallback vẽ hình học
async function drawAnimalIcon(ctx, symbol, x, y, size) {
    const data = SYMBOLS[symbol];
    if (!data) return;
    
    // Thử load Discord custom emoji
    const emojiImg = await loadCustomEmoji(data.emoji);
    
    if (emojiImg) {
        // Có custom emoji - vẽ ảnh
        ctx.drawImage(emojiImg, x - size/2, y - size/2, size, size);
    } else {
        // Fallback - vẽ bằng hình học
        ctx.save();
        
        // Vẽ vòng tròn nền
        ctx.beginPath();
        ctx.arc(x, y, size/2, 0, Math.PI * 2);
        ctx.fillStyle = data.color;
        ctx.globalAlpha = 0.3;
        ctx.fill();
        ctx.globalAlpha = 1;
        
        // Vẽ viền
        ctx.strokeStyle = data.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Vẽ chữ viết tắt ở giữa
        ctx.fillStyle = data.color;
        ctx.font = `bold ${size * 0.5}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(data.name.charAt(0), x, y);
        
        ctx.restore();
    }
}

function rollSymbol() {
    return SYMBOL_LIST[Math.floor(Math.random() * SYMBOL_LIST.length)];
}

// Config emoji cho title (có thể thay đổi)
const TITLE_EMOJI = '<a:loa:1358084710856921230>';
const CLOCK_EMOJI = '<:MochaClock:1468114318015860817>';
const PLAYER_EMOJI = '<:b_people_hugging:1468116538677661748>'; // Thay bằng ID thật hoặc để trống

// Hàm vẽ text kèm Discord emoji
async function drawTextWithEmoji(ctx, text, emoji, x, y, emojiSize = 20, emojiFirst = true) {
    const emojiImg = await loadCustomEmoji(emoji);
    
    ctx.save();
    const textWidth = ctx.measureText(text).width;
    
    if (emojiImg) {
        const totalWidth = emojiSize + 5 + textWidth;
        const startX = x - totalWidth / 2;
        
        if (emojiFirst) {
            ctx.drawImage(emojiImg, startX, y - emojiSize + 5, emojiSize, emojiSize);
            ctx.textAlign = 'left';
            ctx.fillText(text, startX + emojiSize + 5, y);
        } else {
            ctx.textAlign = 'left';
            ctx.fillText(text, startX, y);
            ctx.drawImage(emojiImg, startX + textWidth + 5, y - emojiSize + 5, emojiSize, emojiSize);
        }
    } else {
        // Fallback không có emoji
        ctx.textAlign = 'center';
        ctx.fillText(text, x, y);
    }
    ctx.restore();
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

    // Title với emoji
    ctx.fillStyle = COLORS.textGold;
    ctx.font = 'bold 24px Arial';
    await drawTextWithEmoji(ctx, `BẦU CUA #${session.round}`, TITLE_EMOJI, width / 2, 35, 28, true);

    // Time + Players với emoji
    ctx.font = '16px Arial';
    ctx.fillStyle = timeLeft <= 10 ? COLORS.textRed : COLORS.textWhite;
    await drawTextWithEmoji(ctx, `${timeLeft}s | ${Object.keys(session.bets).length} người chơi`, CLOCK_EMOJI, width / 2, 58, 18, true);

    // Stats cho từng con vật
    const stats = {};
    const counts = {}; // Đếm số người cược mỗi con
    SYMBOL_LIST.forEach(s => { stats[s] = 0; counts[s] = 0; });
    Object.values(session.bets).forEach(bet => {
        Object.entries(bet.choices).forEach(([symbol, amount]) => { 
            stats[symbol] += amount;
            counts[symbol]++;
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

    for (let i = 0; i < 6; i++) {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = startX + col * (cellWidth + gapX);
        const y = startY + row * (cellHeight + gapY);
        const symbol = SYMBOL_LIST[i];
        const data = SYMBOLS[symbol];
        const total = stats[symbol];
        const count = counts[symbol];

        // Vẽ ô nền
        roundRect(ctx, x, y, cellWidth, cellHeight, 10);
        ctx.fillStyle = total > 0 ? '#1e5128' : '#0f3460';
        ctx.fill();
        ctx.strokeStyle = data.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Icon bên trái - vẽ bằng hình học
        await drawAnimalIcon(ctx, symbol, x + 32, y + cellHeight / 2, 35);

        // Tên con vật + số người cược - bên phải trên
        ctx.fillStyle = data.color;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${data.name} (${count})`, x + cellWidth - 15, y + 20);

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
    ctx.fillText(`KẾT QUẢ PHIÊN #${session.round}`, width / 2, 32);

    // 3 kết quả - vẽ emoji (căn giữa chính xác)
    const iconSize = 55;
    const iconGap = 25;
    const totalIconWidth = 3 * iconSize + 2 * iconGap;
    const startIconX = (width - totalIconWidth) / 2 + iconSize / 2;
    const iconY = 75;
    
    for (let i = 0; i < 3; i++) {
        const rX = startIconX + i * (iconSize + iconGap);
        await drawAnimalIcon(ctx, results[i], rX, iconY, iconSize);
    }

    // Count results
    const counts = {};
    results.forEach(r => { counts[r] = (counts[r] || 0) + 1; });

    // Hiển thị count (dùng text) - đặt bên dưới icons
    ctx.font = '14px Arial';
    ctx.fillStyle = COLORS.textWhite;
    ctx.textAlign = 'center';
    let countText = SYMBOL_LIST.map(s => counts[s] ? `${SYMBOLS[s].name}x${counts[s]}` : '').filter(Boolean).join('  ');
    ctx.fillText(countText, width / 2, iconY + iconSize / 2 + 25);

    // Separator
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 150);
    ctx.lineTo(width - 30, 150);
    ctx.stroke();

    // Winners - bên trái
    let yLeft = 175;
    ctx.textAlign = 'left';
    
    if (winners.length > 0) {
        ctx.fillStyle = COLORS.textGreen;
        ctx.font = 'bold 15px Arial';
        ctx.fillText(`Thắng (${winners.length}):`, 30, yLeft);
        yLeft += 22;
        ctx.font = '13px Arial';
        winners.slice(0, 4).forEach(w => {
            // Cắt ngắn username nếu quá dài
            const name = w.username.length > 12 ? w.username.slice(0, 12) + '...' : w.username;
            ctx.fillText(`${name}: +${w.win.toLocaleString()}đ`, 30, yLeft);
            yLeft += 18;
        });
        if (winners.length > 4) {
            ctx.fillText(`... và ${winners.length - 4} người khác`, 30, yLeft);
        }
    }

    // Losers - bên phải
    let yRight = 175;
    ctx.textAlign = 'right';
    
    if (losers.length > 0) {
        ctx.fillStyle = COLORS.textRed;
        ctx.font = 'bold 15px Arial';
        ctx.fillText(`Thua (${losers.length}):`, width - 30, yRight);
        yRight += 22;
        ctx.font = '13px Arial';
        losers.slice(0, 4).forEach(l => {
            // Cắt ngắn username nếu quá dài
            const name = l.username.length > 12 ? l.username.slice(0, 12) + '...' : l.username;
            ctx.fillText(`${name}: -${l.amount.toLocaleString()}đ`, width - 30, yRight);
            yRight += 18;
        });
        if (losers.length > 4) {
            ctx.fillText(`... và ${losers.length - 4} người khác`, width - 30, yRight);
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
            ...BET_AMOUNTS.map(amount =>
                new ButtonBuilder()
                    .setCustomId(`bcs_bet_${amount}`)
                    .setLabel(amount >= 1000 ? amount/1000 + 'K' : String(amount))
                    .setStyle(ButtonStyle.Secondary)
            ),
            new ButtonBuilder()
                .setCustomId('bcs_custom_bet')
                .setLabel('✏️')
                .setStyle(ButtonStyle.Primary)
        )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Con vật hàng 1
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            SYMBOL_LIST.slice(0, 3).map(symbol => {
                const btn = new ButtonBuilder()
                    .setCustomId(`bcs_symbol_${symbol}`)
                    .setStyle(ButtonStyle.Secondary);
                const emoji = buttonEmoji(SYMBOLS[symbol].emoji);
                if (emoji) btn.setEmoji(emoji);
                else btn.setLabel(SYMBOLS[symbol].name);
                return btn;
            })
        )
    );

    // Con vật hàng 2
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            SYMBOL_LIST.slice(3, 6).map(symbol => {
                const btn = new ButtonBuilder()
                    .setCustomId(`bcs_symbol_${symbol}`)
                    .setStyle(ButtonStyle.Secondary);
                const emoji = buttonEmoji(SYMBOLS[symbol].emoji);
                if (emoji) btn.setEmoji(emoji);
                else btn.setLabel(SYMBOLS[symbol].name);
                return btn;
            })
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
                
                // Lấy username
                let username = 'Unknown';
                try {
                    const user = await client.users.fetch(oderId);
                    username = user.displayName || user.username || 'Unknown';
                } catch (e) {}
                
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
                    winners.push({ oderId, username, win: totalWin - totalLoss });
                } else if (totalLoss > 0) {
                    losers.push({ oderId, username, amount: totalLoss });
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

            case 'custom_bet': {
                const modal = new ModalBuilder()
                    .setCustomId('bcs_custom_bet_modal')
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
        if (interaction.customId !== 'bcs_custom_bet_modal') return;

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
            session.userSelections[userId] = { amount: null };
        }

        session.userSelections[userId].amount = amount;

        return interaction.reply({ 
            content: `✅ Đã chọn mức cược **${amount.toLocaleString()}đ**. Giờ hãy chọn con vật!`, 
            flags: MessageFlags.Ephemeral 
        });
    },

    async handleSelect() {}
};
