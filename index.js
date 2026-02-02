require('dotenv').config();
const { Client, GatewayIntentBits, Collection, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, EmbedBuilder, AttachmentBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { connectDatabase } = require('./src/database/connect');
const User = require('./src/database/models/User');
const Guild = require('./src/database/models/Guild');
const Ring = require('./src/database/models/Ring');
const Marriage = require('./src/database/models/Marriage');
const Inventory = require('./src/database/models/Inventory');
const Topup = require('./src/database/models/Topup');
const { buttonEmoji, displayEmoji } = require('./src/utils/emoji');
const { createMarriageCard, createNotMarriedCard } = require('./src/utils/marriage-canvas');

const DEFAULT_PREFIX = '!';
const ID_DEV = process.env.ID_DEV || ''; // ID Developer từ .env
const PAYMENT_PORT = process.env.PAYMENT_PORT || process.env.PORT || 3000;
const VIETQR_BANK = process.env.VIETQR_BANK || '';
const VIETQR_ACCOUNT = process.env.VIETQR_ACCOUNT || '';
const VIETQR_NAME = process.env.VIETQR_NAME || '';
const CASSO_BANK_ID = process.env.CASSO_BANK_ID || '';

// Cache prefix cho mỗi server
const prefixCache = new Map();
// Cache proposals (cầu hôn đang chờ)
const pendingProposals = new Map();
// Cooldown love points (30 phút)
const loveCooldowns = new Map();
const LOVE_COOLDOWN = 30 * 60 * 1000; // 30 phút

function generateTopupCode() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const letter1 = letters[Math.floor(Math.random() * 26)];
    const letter2 = letters[Math.floor(Math.random() * 26)];
    const letter3 = letters[Math.floor(Math.random() * 26)];
    const numbers = Math.floor(1000 + Math.random() * 9000);
    return `${letter1}${letter2}${letter3}${numbers}`;
}

// Kiểm tra giao dịch trên Casso (không cần số tiền cố định)
async function checkCassoTransaction(code) {
    const apiKey = process.env.CASSO_API_KEY;
    if (!apiKey) return null;

    try {
        const response = await fetch('https://oauth.casso.vn/v2/transactions?pageSize=20&sort=DESC', {
            method: 'GET',
            headers: {
                'Authorization': `Apikey ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) return null;

        const data = await response.json();
        const records = data?.data?.records || [];

        for (const tx of records) {
            const description = tx.description || '';
            const txAmount = Number(tx.amount || 0);

            if (description.toUpperCase().includes(code.toUpperCase()) && txAmount > 0) {
                return {
                    transactionId: String(tx.id || tx.tid || ''),
                    description: description,
                    amount: txAmount
                };
            }
        }

        return null;
    } catch (err) {
        console.error('Casso API error:', err);
        return null;
    }
}

function getVietQrUrl(code) {
    const bankId = VIETQR_BANK;
    const accountNo = VIETQR_ACCOUNT;
    const accountName = VIETQR_NAME;
    const addInfo = encodeURIComponent(code);
    const nameParam = encodeURIComponent(accountName);
    return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?addInfo=${addInfo}&accountName=${nameParam}`;
}

function startPaymentServer(client) {
    const app = express();
    app.use(express.json({ limit: '2mb' }));

    app.get('/webhook/casso', (req, res) => res.send('OK'));

    app.post('/webhook/casso', async (req, res) => {
        try {
            const apiKey = process.env.CASSO_API_KEY || '';
            const authHeader = req.headers.authorization || '';
            if (apiKey && authHeader && authHeader !== `Apikey ${apiKey}` && authHeader !== apiKey) {
                return res.status(401).send('Unauthorized');
            }

            const txList = req.body?.data || req.body?.transactions || [];
            if (!Array.isArray(txList)) {
                return res.json({ ok: true });
            }

            for (const tx of txList) {
                const description = tx.description || tx.transactionContent || tx.memo || '';
                const amount = Number(tx.amount || tx.amountIn || tx.totalAmount || tx.amountInVnd || 0);
                const transactionId = String(tx.id || tx.tid || tx.transactionId || tx.reference || '');

                const codeMatch = description.match(/[A-Z]{3}\d{4}/i);
                if (!codeMatch) continue;

                const code = codeMatch[0].toUpperCase();
                const topup = await Topup.findPendingByCode(code);
                if (!topup) continue;

                if (topup.expiresAt <= new Date()) {
                    await Topup.updateOne({ _id: topup._id }, { status: 'expired' });
                    continue;
                }

                // Sử dụng số tiền thực tế chuyển khoản
                const actualAmount = amount;
                const updated = await Topup.markPaid(topup._id, { transactionId, description, amount: actualAmount });

                const currentBalance = await client.getBalance(updated.userId);
                const newBalance = currentBalance + actualAmount;
                await client.setBalance(updated.userId, newBalance);

                const embed = new EmbedBuilder()
                    .setColor(0x00D166)
                    .setTitle('✅ Nạp tiền thành công')
                    .addFields(
                        { name: 'Số tiền', value: `${updated.amount.toLocaleString()}đ`, inline: true },
                        { name: 'Mã nạp', value: updated.code, inline: true },
                        { name: 'Số dư mới', value: `${newBalance.toLocaleString()}đ`, inline: true }
                    )
                    .setFooter({ text: 'Casso + VietQR' })
                    .setTimestamp();

                const channel = await client.channels.fetch(updated.channelId).catch(() => null);
                if (channel) {
                    await channel.send({ content: `<@${updated.userId}>`, embeds: [embed] }).catch(() => {});
                }

                const user = await client.users.fetch(updated.userId).catch(() => null);
                if (user) {
                    await user.send({ embeds: [embed] }).catch(() => {});
                }
            }

            return res.json({ ok: true });
        } catch (err) {
            console.error('Webhook error:', err);
            return res.status(500).json({ ok: false });
        }
    });

    app.listen(PAYMENT_PORT, () => {
        console.log(`Payment webhook listening on port ${PAYMENT_PORT}`);
    });
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Collections
client.commands = new Collection();
client.cooldowns = new Collection();
client.activeGames = new Map();
client.pendingProposals = pendingProposals; // Chia sẻ với interactionCreate

// Database functions sử dụng MongoDB
client.getBalance = async (userId, username) => {
    return await User.getBalance(userId, username);
};

client.setBalance = async (userId, amount) => {
    return await User.setBalance(userId, amount);
};

client.getUser = async (userId, username) => {
    return await User.getOrCreate(userId, username);
};

client.updateUserStats = async (userId, winAmount) => {
    return await User.addBalance(userId, winAmount);
};

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

// Kết nối MongoDB trước khi login
connectDatabase().then(() => {
    client.login(process.env.DISCORD_TOKEN);
    startPaymentServer(client);
    setInterval(() => Topup.expireOld().catch(() => {}), 60 * 1000);
});

// Prefix commands
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Lấy prefix của server (từ cache hoặc database)
    let prefix = prefixCache.get(message.guild.id);
    if (!prefix) {
        prefix = await Guild.getPrefix(message.guild.id);
        prefixCache.set(message.guild.id, prefix);
    }

    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // !setprefix <prefix mới> - Đổi prefix (Admin hoặc Dev)
    if (command === 'setprefix' || command === 'prefix') {
        const isDev = message.author.id === ID_DEV;
        const isAdmin = message.member.permissions.has('Administrator');
        
        if (!isDev && !isAdmin) {
            return message.reply('❌ Bạn cần quyền **Administrator** để đổi prefix!');
        }

        const newPrefix = args[0];
        if (!newPrefix) {
            return message.reply(`📌 Prefix hiện tại: \`${prefix}\`\n💡 Dùng \`${prefix}setprefix <prefix mới>\` để đổi`);
        }
        if (newPrefix.length > 5) {
            return message.reply('❌ Prefix tối đa 5 ký tự!');
        }

        await Guild.setPrefix(message.guild.id, newPrefix);
        prefixCache.set(message.guild.id, newPrefix);
        await message.reply(`✅ Đã đổi prefix thành \`${newPrefix}\`\n💡 Ví dụ: \`${newPrefix}cash\``);
        return;
    }

    // !transfer @user <số tiền> - Chuyển tiền
    if (command === 'transfer' || command === 'chuyen' || command === 'pay') {
        const targetUser = message.mentions.users.first();
        const amount = parseInt(args[1]);

        if (!targetUser) {
            return message.reply('❌ Vui lòng tag người nhận! Ví dụ: `!transfer @user 1000`');
        }
        if (targetUser.id === message.author.id) {
            return message.reply('❌ Không thể chuyển tiền cho chính mình!');
        }
        if (targetUser.bot) {
            return message.reply('❌ Không thể chuyển tiền cho bot!');
        }
        if (!amount || amount <= 0 || isNaN(amount)) {
            return message.reply('❌ Số tiền không hợp lệ! Ví dụ: `!transfer @user 1000`');
        }
        if (amount < 100) {
            return message.reply('❌ Số tiền tối thiểu là 100!');
        }

        const senderBalance = await client.getBalance(message.author.id);
        if (senderBalance < amount) {
            return message.reply(`❌ Không đủ tiền! Bạn có **${senderBalance.toLocaleString()}** 🪙`);
        }

        // Trừ tiền người gửi, cộng tiền người nhận
        await client.setBalance(message.author.id, senderBalance - amount);
        const receiverBalance = await client.getBalance(targetUser.id);
        await client.setBalance(targetUser.id, receiverBalance + amount);

        await message.reply(`✅ Đã chuyển **${amount.toLocaleString()}** 🪙 cho ${targetUser}\n💰 Số dư còn lại: **${(senderBalance - amount).toLocaleString()}** 🪙`);
    }

    // !naptien - Nạp tiền tự động (VietQR + Casso)
    if (command === 'naptien' || command === 'nap' || command === 'topup') {
        if (!VIETQR_BANK || !VIETQR_ACCOUNT || !VIETQR_NAME) {
            return message.reply('❌ Chưa cấu hình VietQR! Vui lòng kiểm tra .env');
        }

        const now = new Date();
        const existing = await Topup.findPendingByUser(message.guild.id, message.author.id);
        if (existing && existing.expiresAt > now) {
            const minutesLeft = Math.ceil((existing.expiresAt - now) / 60000);
            const qrUrl = getVietQrUrl(existing.code);

            const container = new ContainerBuilder().setAccentColor(0x00B894);

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# 💳 NẠP TIỀN TỰ ĐỘNG\n\n> Bạn đang có một lệnh nạp chưa hoàn tất.\n> Quét mã QR và chuyển số tiền bạn muốn nạp.`)
            );

            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`📝 **Mã nạp:** \`${existing.code}\`\n🏦 **Ngân hàng:** ${VIETQR_BANK}\n💳 **STK:** ${VIETQR_ACCOUNT}\n⏰ **Hết hạn:** ${minutesLeft} phút`)
            );

            container.addMediaGalleryComponents(
                new (require('discord.js').MediaGalleryBuilder)().addItems({ media: { url: qrUrl } })
            );

            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# ⚠️ Nội dung chuyển khoản phải đúng mã: **${existing.code}**`)
            );

            container.addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`naptien_confirm_${existing.code}`)
                        .setLabel('Đã chuyển khoản')
                        .setEmoji('✅')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`naptien_cancel_${existing.code}`)
                        .setLabel('Hủy lệnh')
                        .setEmoji('❌')
                        .setStyle(ButtonStyle.Danger)
                )
            );

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        const code = generateTopupCode();

        await Topup.createTopup({
            guildId: message.guild.id,
            userId: message.author.id,
            channelId: message.channel.id,
            amount: 0,
            code,
            expiresAt
        });

        const qrUrl = getVietQrUrl(code);

        const container = new ContainerBuilder().setAccentColor(0x00B894);

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# 💳 NẠP TIỀN TỰ ĐỘNG\n\n> Quét mã QR bên dưới và chuyển số tiền bạn muốn nạp.\n> Sau khi chuyển khoản, bấm nút **Đã chuyển khoản** để xác nhận.`)
        );

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`📝 **Mã nạp:** \`${code}\`\n🏦 **Ngân hàng:** ${VIETQR_BANK}\n💳 **STK:** ${VIETQR_ACCOUNT}\n👤 **Chủ TK:** ${VIETQR_NAME}\n⏰ **Hết hạn:** 15 phút`)
        );

        container.addMediaGalleryComponents(
            new (require('discord.js').MediaGalleryBuilder)().addItems({ media: { url: qrUrl } })
        );

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# ⚠️ Nội dung chuyển khoản phải đúng mã: **${code}**`)
        );

        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`naptien_confirm_${code}`)
                    .setLabel('Đã chuyển khoản')
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`naptien_cancel_${code}`)
                    .setLabel('Hủy lệnh')
                    .setEmoji('❌')
                    .setStyle(ButtonStyle.Danger)
            )
        );

        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // !addmoney @user <số tiền> - Add tiền (Admin/Dev only)
    if (command === 'addmoney' || command === 'add' || command === 'give') {
        // Kiểm tra quyền admin hoặc dev
        const isDev = message.author.id === ID_DEV;
        const isAdmin = message.member.permissions.has('Administrator');
        if (!isDev && !isAdmin) {
            return message.reply('❌ Bạn không có quyền sử dụng lệnh này!');
        }

        const targetUser = message.mentions.users.first();
        const amount = parseInt(args[1]);

        if (!targetUser) {
            return message.reply('❌ Vui lòng tag người nhận! Ví dụ: `!addmoney @user 1000`');
        }
        if (!amount || isNaN(amount)) {
            return message.reply('❌ Số tiền không hợp lệ! Ví dụ: `!addmoney @user 1000`');
        }

        const currentBalance = await client.getBalance(targetUser.id);
        const newBalance = currentBalance + amount;
        await client.setBalance(targetUser.id, newBalance);

        if (amount > 0) {
            await message.reply(`✅ Đã thêm **${amount.toLocaleString()}** 🪙 cho ${targetUser}\n💰 Số dư mới: **${newBalance.toLocaleString()}** 🪙`);
        } else {
            await message.reply(`✅ Đã trừ **${Math.abs(amount).toLocaleString()}** 🪙 từ ${targetUser}\n💰 Số dư mới: **${newBalance.toLocaleString()}** 🪙`);
        }
    }

    // !setmoney @user <số tiền> - Set tiền (Admin/Dev only)
    if (command === 'setmoney' || command === 'set') {
        const isDev = message.author.id === ID_DEV;
        const isAdmin = message.member.permissions.has('Administrator');
        if (!isDev && !isAdmin) {
            return message.reply('❌ Bạn không có quyền sử dụng lệnh này!');
        }

        const targetUser = message.mentions.users.first();
        const amount = parseInt(args[1]);

        if (!targetUser) {
            return message.reply('❌ Vui lòng tag người nhận! Ví dụ: `!setmoney @user 1000`');
        }
        if (amount === undefined || isNaN(amount) || amount < 0) {
            return message.reply('❌ Số tiền không hợp lệ! Ví dụ: `!setmoney @user 1000`');
        }

        await client.setBalance(targetUser.id, amount);
        await message.reply(`✅ Đã đặt số dư của ${targetUser} thành **${amount.toLocaleString()}** 🪙`);
    }

    // !reset @user - Reset tiền 1 user về mặc định (Admin/Dev only)
    if (command === 'reset') {
        const isDev = message.author.id === ID_DEV;
        const isAdmin = message.member.permissions.has('Administrator');
        if (!isDev && !isAdmin) {
            return message.reply('❌ Bạn không có quyền sử dụng lệnh này!');
        }

        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply('❌ Vui lòng tag user cần reset! Ví dụ: `!reset @user`');
        }

        const defaultBalance = 10000;
        await client.setBalance(targetUser.id, defaultBalance);
        await message.reply(`✅ Đã reset số dư của ${targetUser} về **${defaultBalance.toLocaleString()}** 🪙`);
    }

    // !resetall - Reset tiền tất cả users (Dev only)
    if (command === 'resetall') {
        const isDev = message.author.id === ID_DEV;
        if (!isDev) {
            return message.reply('❌ Chỉ Dev mới có thể sử dụng lệnh này!');
        }

        try {
            const defaultBalance = 10000;
            await User.updateMany({}, { balance: defaultBalance });
            
            const userCount = await User.countDocuments();
            await message.reply(`✅ Đã reset tiền của **${userCount}** users về **${defaultBalance.toLocaleString()}** 🪙`);
        } catch (error) {
            console.error('Error resetting all balances:', error);
            await message.reply('❌ Lỗi khi reset tiền! Vui lòng kiểm tra console.');
        }
    }

    // !doanhthu - Xem tổng doanh thu từ nạp tiền (Admin/Dev)
    if (command === 'doanhthu' || command === 'revenue') {
        const isDev = message.author.id === ID_DEV;
        const isAdmin = message.member.permissions.has('Administrator');
        if (!isDev && !isAdmin) {
            return message.reply('❌ Bạn không có quyền sử dụng lệnh này!');
        }

        try {
            const stats = await Topup.getRevenueStats(message.guild.id);
            const recentTx = await Topup.getRecentTransactions(message.guild.id, 5);

            // Tính tổng tiền đã phát cho users
            const totalUserBalance = await User.aggregate([
                { $group: { _id: null, total: { $sum: '$balance' } } }
            ]);
            const totalBalance = totalUserBalance[0]?.total || 0;

            // Lợi nhuận = Doanh thu - Tổng tiền users có
            const profit = stats.totalRevenue - totalBalance;

            const container = new ContainerBuilder().setAccentColor(profit >= 0 ? 0x00D166 : 0xFF4757);

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# 📊 THỐNG KÊ DOANH THU\n\n💰 **Tổng nạp:** ${stats.totalRevenue.toLocaleString()}đ\n📝 **Số giao dịch:** ${stats.totalTransactions}\n\n💳 **Tổng tiền users:** ${totalBalance.toLocaleString()}đ\n${profit >= 0 ? '📈' : '📉'} **Lợi nhuận:** ${profit >= 0 ? '+' : ''}${profit.toLocaleString()}đ`)
            );

            if (recentTx.length > 0) {
                container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
                
                let recentText = '### 🕒 Giao dịch gần đây:\n';
                for (const tx of recentTx) {
                    const date = tx.paidAt ? new Date(tx.paidAt).toLocaleString('vi-VN') : 'N/A';
                    recentText += `> <@${tx.userId}> - **${tx.amount.toLocaleString()}đ** - ${date}\n`;
                }
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(recentText)
                );
            }

            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# Dùng \`!resetdoanhthu\` để reset thống kê`)
            );

            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Error getting revenue:', error);
            await message.reply('❌ Lỗi khi lấy thống kê!');
        }
    }

    // !resetdoanhthu - Reset thống kê doanh thu (Admin/Dev)
    if (command === 'resetdoanhthu' || command === 'resetrevenue') {
        const isDev = message.author.id === ID_DEV;
        const isAdmin = message.member.permissions.has('Administrator');
        if (!isDev && !isAdmin) {
            return message.reply('❌ Bạn không có quyền sử dụng lệnh này!');
        }

        try {
            const result = await Topup.resetRevenue(message.guild.id);
            await message.reply(`✅ Đã reset thống kê doanh thu!\n📝 Đã xóa **${result.deletedCount}** giao dịch.`);
        } catch (error) {
            console.error('Error resetting revenue:', error);
            await message.reply('❌ Lỗi khi reset thống kê!');
        }
    }

    // !cash hoặc !bal - Xem số dư
    if (command === 'cash' || command === 'bal' || command === 'money') {
        const targetUser = message.mentions.users.first() || message.author;
        const balance = await client.getBalance(targetUser.id);
        
        if (targetUser.id === message.author.id) {
            await message.reply(`💰 Số dư của bạn: **${balance.toLocaleString()}** 🪙`);
        } else {
            await message.reply(`💰 Số dư của ${targetUser}: **${balance.toLocaleString()}** 🪙`);
        }
    }

    // !help - Xem danh sách lệnh
    if (command === 'help' || command === 'h' || command === 'commands') {
        const container = new ContainerBuilder().setAccentColor(0x5865F2);
        
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# 📚 HƯỚNG DẪN SỬ DỤNG BOT\n\nPrefix hiện tại: \`${prefix}\`\n\n**Chọn danh mục bên dưới để xem các lệnh:**`)
        );
        
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        // Kiểm tra quyền admin
        const isDev = message.author.id === ID_DEV;
        const isAdmin = message.member.permissions.has('Administrator');

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_menu')
            .setPlaceholder('📋 Chọn danh mục...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('💰 Kinh tế')
                    .setDescription('Các lệnh về tiền bạc')
                    .setValue('economy')
                    .setEmoji('💰'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('🎮 Game')
                    .setDescription('Tài Xỉu, Bầu Cua')
                    .setValue('games')
                    .setEmoji('🎮'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('💍 Shop & Nhẫn')
                    .setDescription('Mua bán nhẫn')
                    .setValue('shop')
                    .setEmoji('💍'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('💕 Hôn nhân')
                    .setDescription('Cầu hôn, ly hôn')
                    .setValue('marriage')
                    .setEmoji('💕'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('💖 Điểm yêu thương')
                    .setDescription('Tăng/giảm điểm tình yêu')
                    .setValue('lovepoints')
                    .setEmoji('💖')
            );

        // Chỉ thêm option admin nếu có quyền
        if (isDev || isAdmin) {
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('⚙️ Quản trị')
                    .setDescription('Lệnh dành cho Admin')
                    .setValue('admin')
                    .setEmoji('⚙️')
            );
        }

        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));
        
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# Yêu cầu bởi ${message.author.username}`)
        );

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // ==================== SHOP NHẪN ====================
    
    // !shop - Xem shop nhẫn (embed với nút mua)
    if (command === 'shop' || command === 'rings') {
        const rings = await Ring.getRings(message.guild.id);
        const balance = await client.getBalance(message.author.id);
        
        const container = new ContainerBuilder().setAccentColor(0xFF69B4);

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# 💍 SHOP NHẪN\n💰 Số dư: **${balance.toLocaleString()}** 🪙`)
        );

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        if (rings.length === 0) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`*Chưa có nhẫn nào!*\n\n📌 Admin dùng \`${prefix}addring\` hoặc \`/ring add\` để thêm nhẫn`)
            );
        } else {
            rings.forEach((ring, index) => {
                const canBuy = balance >= ring.price;
                const buyButton = new ButtonBuilder()
                    .setCustomId(`shop_buy_${ring._id}`)
                    .setLabel('Mua')
                    .setStyle(canBuy ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setDisabled(!canBuy);
                
                // Hỗ trợ emoji Discord custom
                const emojiData = buttonEmoji(ring.emoji);
                if (emojiData) buyButton.setEmoji(emojiData);

                container.addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`**${index + 1}.** ${displayEmoji(ring.emoji)} **${ring.name}**\n💰 **${ring.price.toLocaleString()}** 🪙${ring.description ? `\n-# ${ring.description}` : ''}`)
                        )
                        .setButtonAccessory(buyButton)
                );
            });
        }

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // Xử lý nút mua từ shop
    if (message.client.on) {
        // Đã xử lý ở event interactionCreate
    }

    // !addring <tên> <giá> [emoji] [mô tả] - Thêm nhẫn (Admin/Dev)
    if (command === 'addring') {
        const isDev = message.author.id === ID_DEV;
        const isAdmin = message.member.permissions.has('Administrator');
        if (!isDev && !isAdmin) {
            return message.reply('❌ Bạn cần quyền **Administrator**!');
        }

        const name = args[0];
        const price = parseInt(args[1]);
        const emoji = args[2] || '💍';
        const description = args.slice(3).join(' ') || '';

        if (!name || !price || isNaN(price) || price <= 0) {
            return message.reply(`❌ Sai cú pháp!\n📌 Dùng: \`${prefix}addring <tên> <giá> [emoji] [mô tả]\`\n📌 Ví dụ: \`${prefix}addring Kim_Cương 50000 💎 Nhẫn kim cương lấp lánh\``);
        }

        const ring = await Ring.addRing(message.guild.id, name, price, emoji, description, message.author.id);
        await message.reply(`✅ Đã thêm nhẫn ${emoji} **${name}** với giá **${price.toLocaleString()}** 🪙\nID: \`${ring._id}\``);
    }

    // !removering <ID> - Xóa nhẫn (Admin/Dev)
    if (command === 'removering' || command === 'delring') {
        const isDev = message.author.id === ID_DEV;
        const isAdmin = message.member.permissions.has('Administrator');
        if (!isDev && !isAdmin) {
            return message.reply('❌ Bạn cần quyền **Administrator**!');
        }

        const ringId = args[0];
        if (!ringId) {
            return message.reply(`❌ Vui lòng nhập ID nhẫn! Dùng \`${prefix}shop\` để xem ID`);
        }

        try {
            const ring = await Ring.removeRing(message.guild.id, ringId);
            if (ring) {
                await message.reply(`✅ Đã xóa nhẫn ${displayEmoji(ring.emoji)} **${ring.name}**`);
            } else {
                await message.reply('❌ Không tìm thấy nhẫn!');
            }
        } catch (e) {
            await message.reply('❌ ID không hợp lệ!');
        }
    }

    // !buy <ID> - Mua nhẫn
    if (command === 'buy' || command === 'mua') {
        const ringId = args[0];
        if (!ringId) {
            return message.reply(`❌ Vui lòng nhập ID nhẫn! Dùng \`${prefix}shop\` để xem`);
        }

        try {
            const ring = await Ring.getRingById(ringId);
            if (!ring || ring.guildId !== message.guild.id) {
                return message.reply('❌ Không tìm thấy nhẫn!');
            }

            const balance = await client.getBalance(message.author.id);
            if (balance < ring.price) {
                return message.reply(`❌ Không đủ tiền! Cần **${ring.price.toLocaleString()}** 🪙, bạn có **${balance.toLocaleString()}** 🪙`);
            }

            await client.setBalance(message.author.id, balance - ring.price);
            await Inventory.addItem(message.author.id, message.guild.id, ring._id, ring.name, ring.emoji);
            
            await message.reply(`✅ Đã mua ${displayEmoji(ring.emoji)} **${ring.name}** với giá **${ring.price.toLocaleString()}** 🪙\n💰 Số dư còn lại: **${(balance - ring.price).toLocaleString()}** 🪙`);
        } catch (e) {
            await message.reply('❌ ID không hợp lệ!');
        }
    }

    // !inventory / !inv - Xem kho đồ
    if (command === 'inventory' || command === 'inv' || command === 'bag' || command === 'kho') {
        const inv = await Inventory.getInventory(message.author.id, message.guild.id);
        
        const embed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setAuthor({ 
                name: `Kho đồ của ${message.author.displayName || message.author.username}`, 
                iconURL: message.author.displayAvatarURL() 
            })
            .setThumbnail(message.author.displayAvatarURL({ size: 128 }));
        
        if (inv.items.length === 0) {
            embed.setDescription('*🎒 Kho đồ trống!*')
                .setFooter({ text: `📌 Dùng ${prefix}shop để mua nhẫn` });
        } else {
            let itemList = '';
            inv.items.forEach((item, index) => {
                itemList += `\`${index + 1}\` ${displayEmoji(item.emoji)} **${item.name}**\n`;
            });
            
            embed.setDescription(itemList)
                .setFooter({ text: `Tổng: ${inv.items.length} vật phẩm • Dùng ${prefix}marry @user <số> để cầu hôn` });
        }
        
        await message.reply({ embeds: [embed] });
    }

    // ==================== MARRY ====================
    
    // !marry @user <ringId> - Cầu hôn / !marry - Xem thông tin hôn nhân
    if (command === 'marry' || command === 'propose' || command === 'cuoi' || command === 'couple' || command === 'partner' || command === 'honhan') {
        const targetUser = message.mentions.users.first();
        
        // Nếu không có @ thì xem thông tin hôn nhân
        if (!targetUser) {
            const marriage = await Marriage.getMarriage(message.guild.id, message.author.id);
            
            if (!marriage) {
                const buffer = await createNotMarriedCard(message.author, prefix);
                const attachment = new AttachmentBuilder(buffer, { name: 'not-married.png' });
                return message.reply({ files: [attachment] });
            }

            const partnerId = marriage.user1 === message.author.id ? marriage.user2 : marriage.user1;
            const partner = await client.users.fetch(partnerId).catch(() => null);
            
            if (!partner) {
                return message.reply('❌ Không thể tìm thấy thông tin đối tác!');
            }

            const user1 = marriage.user1 === message.author.id ? message.author : partner;
            const user2 = marriage.user1 === message.author.id ? partner : message.author;

            const buffer = await createMarriageCard(user1, user2, marriage, client);
            const attachment = new AttachmentBuilder(buffer, { name: 'marriage-info.png' });
            return message.reply({ files: [attachment] });
        }
        
        // Có @ thì cầu hôn - cần có ID nhẫn
        const ringId = args[1]; // args[0] là @user, args[1] là ringId
        
        if (!ringId) {
            // Hiển thị kho đồ để chọn nhẫn
            const inv = await Inventory.getInventory(message.author.id, message.guild.id);
            
            if (inv.items.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setDescription(`❌ Bạn cần có nhẫn để cầu hôn!\n📌 Dùng \`${prefix}shop\` để mua nhẫn`);
                return message.reply({ embeds: [embed] });
            }
            
            // Hiển thị danh sách nhẫn trong kho
            const ringList = inv.items.map((item, index) => 
                `\`${index + 1}\` ${displayEmoji(item.emoji)} **${item.name}**`
            ).join('\n');
            
            const embed = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle('💍 Chọn nhẫn để cầu hôn')
                .setDescription(`Bạn cần chỉ định số thứ tự nhẫn!\n\n**Nhẫn trong kho:**\n${ringList}`)
                .setFooter({ text: `📌 Dùng: ${prefix}marry @user <số>` });
            
            return message.reply({ embeds: [embed] });
        }
        
        if (targetUser.id === message.author.id) {
            return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Không thể cầu hôn chính mình!')] });
        }
        if (targetUser.bot) {
            return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Không thể cầu hôn bot!')] });
        }

        // Kiểm tra đã kết hôn chưa
        const existingMarriage1 = await Marriage.getMarriage(message.guild.id, message.author.id);
        if (existingMarriage1) {
            const partnerId = existingMarriage1.user1 === message.author.id ? existingMarriage1.user2 : existingMarriage1.user1;
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setDescription(`❌ Bạn đã kết hôn với <@${partnerId}> rồi!\n📌 Dùng \`${prefix}divorce\` để ly hôn trước`);
            return message.reply({ embeds: [embed] });
        }

        const existingMarriage2 = await Marriage.getMarriage(message.guild.id, targetUser.id);
        if (existingMarriage2) {
            return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(`❌ ${targetUser} đã kết hôn với người khác rồi!`)] });
        }

        // Kiểm tra nhẫn trong kho theo số thứ tự
        const inv = await Inventory.getInventory(message.author.id, message.guild.id);
        const ringIndex = parseInt(ringId) - 1; // Chuyển từ 1-based sang 0-based
        const ring = inv.items[ringIndex];
        
        if (!ring || ringIndex < 0 || ringIndex >= inv.items.length) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setDescription(`❌ Không tìm thấy nhẫn số \`${ringId}\`!\n📌 Dùng \`${prefix}inventory\` để xem kho đồ`);
            return message.reply({ embeds: [embed] });
        }

        // Tạo lời cầu hôn
        const proposalKey = `${message.guild.id}_${targetUser.id}`;
        pendingProposals.set(proposalKey, {
            proposer: message.author.id,
            ring: ring,
            timestamp: Date.now()
        });

        // Tự động hết hạn sau 60 giây
        setTimeout(() => {
            if (pendingProposals.has(proposalKey)) {
                pendingProposals.delete(proposalKey);
            }
        }, 60000);

        const proposalEmbed = new EmbedBuilder()
            .setColor(0xFF69B4)
            .setTitle('💍 LỜI CẦU HÔN')
            .setDescription(`${message.author} đã quỳ xuống cầu hôn ${targetUser}!`)
            .addFields(
                { name: `${displayEmoji(ring.emoji)} Nhẫn`, value: `**${ring.name}**`, inline: true }
            )
            .setThumbnail(targetUser.displayAvatarURL())
            .setImage('https://media.giphy.com/media/3o7btQ8qwHaIgZvS4U/giphy.gif')
            .setFooter({ text: `Chỉ ${targetUser.username} mới có thể trả lời • Hết hạn sau 60s` })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`marry_accept_${targetUser.id}`)
                    .setLabel('Đồng ý')
                    .setEmoji('💚')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`marry_deny_${targetUser.id}`)
                    .setLabel('Từ chối')
                    .setEmoji('💔')
                    .setStyle(ButtonStyle.Danger)
            );

        await message.reply({ content: `${targetUser}`, embeds: [proposalEmbed], components: [row] });
    }

    // !divorce - Ly hôn (có xác nhận)
    if (command === 'divorce' || command === 'lyhon') {
        const marriage = await Marriage.getMarriage(message.guild.id, message.author.id);
        
        if (!marriage) {
            return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Bạn chưa kết hôn với ai!')] });
        }

        const partnerId = marriage.user1 === message.author.id ? marriage.user2 : marriage.user1;
        const partner = await client.users.fetch(partnerId).catch(() => null);
        const partnerName = partner ? (partner.displayName || partner.username) : `<@${partnerId}>`;
        
        const daysMarried = Math.floor((Date.now() - marriage.marriedAt.getTime()) / (1000 * 60 * 60 * 24));

        const confirmEmbed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setTitle('⚠️ XÁC NHẬN LY HÔN')
            .setDescription(`Bạn có chắc muốn ly hôn với **${partnerName}**?`)
            .addFields(
                { name: '💍 Nhẫn', value: `${displayEmoji(marriage.ringEmoji)} ${marriage.ringName}`, inline: true },
                { name: '⏳ Thời gian bên nhau', value: `${daysMarried} ngày`, inline: true }
            )
            .setFooter({ text: '⚠️ Hành động này không thể hoàn tác! Nhẫn sẽ bị mất!' })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`divorce_confirm_${message.author.id}`)
                    .setLabel('Xác nhận ly hôn')
                    .setEmoji('💔')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`divorce_cancel_${message.author.id}`)
                    .setLabel('Hủy bỏ')
                    .setEmoji('❌')
                    .setStyle(ButtonStyle.Secondary)
            );

        await message.reply({ embeds: [confirmEmbed], components: [row] });
    }

    // ==================== LOVE POINTS ====================
    
    // Lệnh tăng điểm yêu thương (+5 đến +15)
    const loveCommands = ['luv', 'moa', 'iuvk', 'iuck', 'iuv', 'o', 'iuchong', 'love', 'yeu', 'thuong', 'kiss', 'hug', 'cuddle'];
    if (loveCommands.includes(command)) {
        const marriage = await Marriage.getMarriage(message.guild.id, message.author.id);
        if (!marriage) {
            return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Bạn cần kết hôn trước!')] });
        }

        // Check cooldown
        const cooldownKey = `love_${message.guild.id}_${message.author.id}`;
        const lastUsed = loveCooldowns.get(cooldownKey);
        if (lastUsed) {
            const timeLeft = LOVE_COOLDOWN - (Date.now() - lastUsed);
            if (timeLeft > 0) {
                const minutes = Math.floor(timeLeft / 60000);
                const seconds = Math.floor((timeLeft % 60000) / 1000);
                return message.reply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription(`⏳ Bạn cần chờ **${minutes} phút ${seconds} giây** nữa mới có thể thể hiện tình cảm tiếp!`)] });
            }
        }
        loveCooldowns.set(cooldownKey, Date.now());

        const partnerId = marriage.user1 === message.author.id ? marriage.user2 : marriage.user1;
        const points = Math.floor(Math.random() * 11) + 5; // +5 đến +15
        const updatedMarriage = await Marriage.addLovePoints(message.guild.id, message.author.id, points);

        const loveMessages = [
            `${message.author} đã gửi tình yêu đến <@${partnerId}>! 💕`,
            `${message.author} thì thầm "yêu em" với <@${partnerId}>! 💗`,
            `${message.author} ôm <@${partnerId}> thật chặt! 🤗`,
            `${message.author} hôn <@${partnerId}> một cái! 😘`,
            `${message.author} vuốt ve <@${partnerId}>! 💞`,
            `${message.author} nhìn <@${partnerId}> với ánh mắt tình tứ! 😍`
        ];

        const embed = new EmbedBuilder()
            .setColor(0xFF69B4)
            .setDescription(loveMessages[Math.floor(Math.random() * loveMessages.length)])
            .addFields({ name: '💕 Điểm tình yêu', value: `+${points} → **${updatedMarriage.lovePoints}** điểm`, inline: true })
            .setFooter({ text: `💖 Hãy yêu thương nhau mỗi ngày!` });

        await message.reply({ embeds: [embed] });
    }

    // Lệnh giảm điểm yêu thương (-10 đến -25)
    const hateCommands = ['ditmemay', 'fuck', 'dumamay', 'hate', 'ghet', 'dit', 'vcl', 'clm', 'dm', 'dcm', 'cc'];
    if (hateCommands.includes(command)) {
        const marriage = await Marriage.getMarriage(message.guild.id, message.author.id);
        if (!marriage) {
            return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Bạn cần kết hôn trước!')] });
        }

        // Check cooldown (dùng chung với love commands)
        const cooldownKey = `love_${message.guild.id}_${message.author.id}`;
        const lastUsed = loveCooldowns.get(cooldownKey);
        if (lastUsed) {
            const timeLeft = LOVE_COOLDOWN - (Date.now() - lastUsed);
            if (timeLeft > 0) {
                const minutes = Math.floor(timeLeft / 60000);
                const seconds = Math.floor((timeLeft % 60000) / 1000);
                return message.reply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription(`⏳ Bạn cần chờ **${minutes} phút ${seconds} giây** nữa!`)] });
            }
        }
        loveCooldowns.set(cooldownKey, Date.now());

        const partnerId = marriage.user1 === message.author.id ? marriage.user2 : marriage.user1;
        const points = -(Math.floor(Math.random() * 16) + 10); // -10 đến -25
        const updatedMarriage = await Marriage.addLovePoints(message.guild.id, message.author.id, points);

        const hateMessages = [
            `${message.author} đã cãi nhau với <@${partnerId}>! 😤`,
            `${message.author} tức giận với <@${partnerId}>! 😡`,
            `${message.author} làm <@${partnerId}> buồn! 😢`,
            `${message.author} và <@${partnerId}> có mâu thuẫn! 💢`,
            `${message.author} đã nói lời không hay với <@${partnerId}>! 😠`
        ];

        const embed = new EmbedBuilder()
            .setColor(0xFF4757)
            .setDescription(hateMessages[Math.floor(Math.random() * hateMessages.length)])
            .addFields({ name: '💔 Điểm tình yêu', value: `${points} → **${updatedMarriage.lovePoints}** điểm`, inline: true })
            .setFooter({ text: `⚠️ Đừng để tình yêu phai nhạt...` });

        await message.reply({ embeds: [embed] });
    }

    // !lovepoint / !lp - Xem điểm tình yêu
    if (command === 'lovepoint' || command === 'lp' || command === 'diemyeu') {
        const marriage = await Marriage.getMarriage(message.guild.id, message.author.id);
        if (!marriage) {
            return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Bạn cần kết hôn trước!')] });
        }

        const partnerId = marriage.user1 === message.author.id ? marriage.user2 : marriage.user1;
        const lovePoints = marriage.lovePoints || 100;
        
        let loveStatus, loveColor, loveEmoji;
        if (lovePoints >= 500) {
            loveStatus = 'Tình yêu bất diệt! 💖';
            loveColor = 0xFF1493;
            loveEmoji = '💖💖💖💖💖';
        } else if (lovePoints >= 300) {
            loveStatus = 'Hạnh phúc viên mãn! 💕';
            loveColor = 0xFF69B4;
            loveEmoji = '💕💕💕💕';
        } else if (lovePoints >= 150) {
            loveStatus = 'Tình cảm tốt đẹp! 💗';
            loveColor = 0xFFB6C1;
            loveEmoji = '💗💗💗';
        } else if (lovePoints >= 50) {
            loveStatus = 'Bình thường 😐';
            loveColor = 0xFFD700;
            loveEmoji = '💛💛';
        } else if (lovePoints > 0) {
            loveStatus = 'Đang có vấn đề! 😟';
            loveColor = 0xFFA500;
            loveEmoji = '💔';
        } else {
            loveStatus = 'Sắp tan vỡ! 💔';
            loveColor = 0xFF0000;
            loveEmoji = '💔💔💔';
        }

        const embed = new EmbedBuilder()
            .setColor(loveColor)
            .setTitle(`${loveEmoji} Điểm Tình Yêu`)
            .setDescription(`**${message.author}** ❤️ **<@${partnerId}>**`)
            .addFields(
                { name: '💕 Điểm', value: `**${lovePoints}**`, inline: true },
                { name: '📊 Trạng thái', value: loveStatus, inline: true }
            )
            .setFooter({ text: 'Dùng luv, moa, iuv để tăng điểm!' });

        await message.reply({ embeds: [embed] });
    }
});
