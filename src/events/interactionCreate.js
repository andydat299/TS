const { Events, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder } = require('discord.js');
const taixiuHandler = require('../games/taixiu');
const baucuaHandler = require('../games/baucua');
const taixiuSession = require('../games/taixiu-session');
const baucuaSession = require('../games/baucua-session');
const Ring = require('../database/models/Ring');
const Inventory = require('../database/models/Inventory');
const User = require('../database/models/User');
const Marriage = require('../database/models/Marriage');
const Topup = require('../database/models/Topup');
const { buttonEmoji, displayEmoji } = require('../utils/emoji');

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

// Cache proposals từ index.js (sẽ được set từ client)
let pendingProposals = null;

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // Xử lý Slash Commands
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                const errorMsg = { content: '❌ Có lỗi xảy ra khi thực hiện lệnh!', flags: MessageFlags.Ephemeral };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMsg);
                } else {
                    await interaction.reply(errorMsg);
                }
            }
        }
        
        // Xử lý Button
        if (interaction.isButton()) {
            const [game, action, ...params] = interaction.customId.split('_');
            
            try {                // Help back button handler
                if (interaction.customId === 'help_back') {
                    const prefix = '!';
                    const container = new ContainerBuilder().setAccentColor(0x5865F2);
                    
                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`# 📚 HƯỚNG DẪN SỬ DỤNG BOT\n\nPrefix hiện tại: \`${prefix}\`\n\n**Chọn danh mục bên dưới để xem các lệnh:**`)
                    );
                    
                    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

                    const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
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
                                .setLabel('⚙️ Quản trị')
                                .setDescription('Lệnh dành cho Admin')
                                .setValue('admin')
                                .setEmoji('⚙️')
                        );

                    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));
                    
                    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`-# Yêu cầu bởi ${interaction.user.username}`)
                    );

                    await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                    return;
                }

                // Naptien confirm/cancel handler
                if (game === 'naptien') {
                    const code = params.join('_');
                    
                    if (action === 'confirm') {
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                        const topup = await Topup.findPendingByCode(code);
                        if (!topup) {
                            return interaction.editReply({ content: '❌ Không tìm thấy lệnh nạp hoặc đã hết hạn!' });
                        }

                        if (topup.userId !== interaction.user.id) {
                            return interaction.editReply({ content: '❌ Đây không phải lệnh nạp của bạn!' });
                        }

                        if (topup.expiresAt <= new Date()) {
                            await Topup.updateOne({ _id: topup._id }, { status: 'expired' });
                            return interaction.editReply({ content: '❌ Lệnh nạp đã hết hạn! Vui lòng tạo lệnh mới.' });
                        }

                        // Kiểm tra giao dịch trên Casso
                        const tx = await checkCassoTransaction(topup.code);
                        if (!tx) {
                            return interaction.editReply({ content: '❌ Chưa tìm thấy giao dịch! Vui lòng chờ 1-2 phút sau khi chuyển khoản rồi thử lại.' });
                        }

                        // Sử dụng số tiền thực tế chuyển khoản
                        const actualAmount = tx.amount;

                        // Đánh dấu đã thanh toán
                        await Topup.markPaid(topup._id, { transactionId: tx.transactionId, description: tx.description, amount: actualAmount });

                        // Cộng tiền
                        const currentBalance = await User.getBalance(interaction.user.id);
                        const newBalance = currentBalance + actualAmount;
                        await User.setBalance(interaction.user.id, newBalance);

                        // Update message gốc với Components V2
                        const successContainer = new ContainerBuilder().setAccentColor(0x00D166);
                        successContainer.addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`# ✅ NẠP TIỀN THÀNH CÔNG\n\n💰 **Số tiền:** ${actualAmount.toLocaleString()}đ\n📝 **Mã nạp:** ${topup.code}\n💳 **Số dư mới:** ${newBalance.toLocaleString()}đ`)
                        );
                        successContainer.addActionRowComponents(
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('naptien_done')
                                    .setLabel('✅ Đã nạp thành công')
                                    .setStyle(ButtonStyle.Success)
                                    .setDisabled(true)
                            )
                        );

                        await interaction.message.edit({ components: [successContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
                        return interaction.editReply({ content: `✅ Nạp tiền thành công! Số tiền: **${actualAmount.toLocaleString()}đ** - Số dư mới: **${newBalance.toLocaleString()}đ**` });

                    } else if (action === 'cancel') {
                        const topup = await Topup.findPendingByCode(code);
                        if (topup && topup.userId === interaction.user.id) {
                            await Topup.updateOne({ _id: topup._id }, { status: 'expired' });
                        }

                        const container = new ContainerBuilder().setAccentColor(0xFF4757);
                        container.addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`# ❌ ĐÃ HỦY LỆNH NẠP\n\n> Bạn có thể tạo lệnh nạp mới bằng \`!naptien\``)
                        );
                        container.addActionRowComponents(
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('naptien_cancelled')
                                    .setLabel('❌ Đã hủy')
                                    .setStyle(ButtonStyle.Danger)
                                    .setDisabled(true)
                            )
                        );

                        await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                        return;
                    }
                }

                if (game === 'taixiu') {
                    return await taixiuHandler.handleButton(interaction, action, params);
                } else if (game === 'baucua') {
                    return await baucuaHandler.handleButton(interaction, action, params);
                } else if (game === 'txs') {
                    // Tài xỉu session
                    return await taixiuSession.handleButton(interaction, action, params);
                } else if (game === 'bcs') {
                    // Bầu cua session
                    return await baucuaSession.handleButton(interaction, action, params);
                } else if (game === 'shop') {
                    // Xử lý mua nhẫn từ shop
                    if (action === 'buy') {
                        const ringId = params[0];
                        try {
                            const ring = await Ring.getRingById(ringId);
                            if (!ring || ring.guildId !== interaction.guild.id) {
                                return interaction.reply({ content: '❌ Không tìm thấy nhẫn!', flags: MessageFlags.Ephemeral });
                            }

                            const balance = await User.getBalance(interaction.user.id);
                            if (balance < ring.price) {
                                return interaction.reply({ content: `❌ Không đủ tiền! Cần **${ring.price.toLocaleString()}** 🪙, bạn có **${balance.toLocaleString()}** 🪙`, flags: MessageFlags.Ephemeral });
                            }

                            await User.setBalance(interaction.user.id, balance - ring.price);
                            await Inventory.addItem(interaction.user.id, interaction.guild.id, ring._id, ring.name, ring.emoji);
                            
                            // Cập nhật lại shop UI
                            const rings = await Ring.getRings(interaction.guild.id);
                            const newBalance = balance - ring.price;
                            
                            const container = new ContainerBuilder().setAccentColor(0xFF69B4);
                            container.addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(`# 💍 SHOP NHẪN\n💰 Số dư: **${newBalance.toLocaleString()}** 🪙\n\n✅ Đã mua ${displayEmoji(ring.emoji)} **${ring.name}**!`)
                            );
                            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

                            rings.forEach((r, index) => {
                                const canBuy = newBalance >= r.price;
                                const buyButton = new ButtonBuilder()
                                    .setCustomId(`shop_buy_${r._id}`)
                                    .setLabel('Mua')
                                    .setStyle(canBuy ? ButtonStyle.Success : ButtonStyle.Secondary)
                                    .setDisabled(!canBuy);
                                
                                // Hỗ trợ emoji Discord custom
                                const emojiData = buttonEmoji(r.emoji);
                                if (emojiData) buyButton.setEmoji(emojiData);

                                container.addSectionComponents(
                                    new SectionBuilder()
                                        .addTextDisplayComponents(
                                            new TextDisplayBuilder().setContent(`**${index + 1}.** ${displayEmoji(r.emoji)} **${r.name}**\n💰 **${r.price.toLocaleString()}** 🪙${r.description ? `\n-# ${r.description}` : ''}`)
                                        )
                                        .setButtonAccessory(buyButton)
                                );
                            });

                            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                        } catch (e) {
                            console.error(e);
                            await interaction.reply({ content: '❌ Có lỗi xảy ra!', flags: MessageFlags.Ephemeral });
                        }
                    }
                } else if (game === 'marry') {
                    // Xử lý chấp nhận/từ chối cầu hôn
                    pendingProposals = interaction.client.pendingProposals;
                    if (!pendingProposals) {
                        return interaction.reply({ content: '❌ Có lỗi xảy ra!', flags: MessageFlags.Ephemeral });
                    }

                    const targetUserId = params[0];
                    
                    // Chỉ người được cầu hôn mới có thể trả lời
                    if (interaction.user.id !== targetUserId) {
                        return interaction.reply({ content: '❌ Chỉ người được cầu hôn mới có thể trả lời!', flags: MessageFlags.Ephemeral });
                    }

                    const proposalKey = `${interaction.guild.id}_${targetUserId}`;
                    const proposal = pendingProposals.get(proposalKey);

                    if (!proposal) {
                        // Disable buttons
                        const disabledRow = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('marry_expired_accept')
                                    .setLabel('Đồng ý')
                                    .setEmoji('💚')
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(true),
                                new ButtonBuilder()
                                    .setCustomId('marry_expired_deny')
                                    .setLabel('Từ chối')
                                    .setEmoji('💔')
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(true)
                            );
                        
                        await interaction.update({ components: [disabledRow] });
                        return interaction.followUp({ content: '❌ Lời cầu hôn đã hết hạn!', flags: MessageFlags.Ephemeral });
                    }

                    if (action === 'accept') {
                        // Xóa nhẫn từ kho người cầu hôn
                        await Inventory.removeItem(proposal.proposer, interaction.guild.id, proposal.ring.ringId);

                        // Tạo hôn nhân
                        await Marriage.createMarriage(
                            interaction.guild.id,
                            proposal.proposer,
                            interaction.user.id,
                            proposal.ring.ringId,
                            proposal.ring.name,
                            proposal.ring.emoji
                        );

                        pendingProposals.delete(proposalKey);

                        const weddingEmbed = new EmbedBuilder()
                            .setColor(0xFFD700)
                            .setTitle('🎉💒 CHÚC MỪNG HÔN LỄ! 💒🎉')
                            .setDescription(`<@${proposal.proposer}> và ${interaction.user} đã chính thức kết hôn!`)
                            .addFields(
                                { name: `${displayEmoji(proposal.ring.emoji)} Nhẫn cưới`, value: `**${proposal.ring.name}**`, inline: true }
                            )
                            .setImage('https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif')
                            .setFooter({ text: '💕 Chúc hai bạn trăm năm hạnh phúc!' })
                            .setTimestamp();

                        // Disable buttons
                        const disabledRow = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('marry_done_accept')
                                    .setLabel('Đã đồng ý')
                                    .setEmoji('💚')
                                    .setStyle(ButtonStyle.Success)
                                    .setDisabled(true),
                                new ButtonBuilder()
                                    .setCustomId('marry_done_deny')
                                    .setLabel('Từ chối')
                                    .setEmoji('💔')
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(true)
                            );

                        await interaction.update({ embeds: [weddingEmbed], components: [disabledRow] });
                    } else if (action === 'deny') {
                        pendingProposals.delete(proposalKey);

                        const denyEmbed = new EmbedBuilder()
                            .setColor(0x808080)
                            .setTitle('💔 Lời cầu hôn bị từ chối')
                            .setDescription(`${interaction.user} đã từ chối lời cầu hôn của <@${proposal.proposer}>`)
                            .setTimestamp();

                        // Disable buttons
                        const disabledRow = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('marry_done_accept')
                                    .setLabel('Đồng ý')
                                    .setEmoji('💚')
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(true),
                                new ButtonBuilder()
                                    .setCustomId('marry_done_deny')
                                    .setLabel('Đã từ chối')
                                    .setEmoji('💔')
                                    .setStyle(ButtonStyle.Danger)
                                    .setDisabled(true)
                            );

                        await interaction.update({ embeds: [denyEmbed], components: [disabledRow] });
                    }
                } else if (game === 'divorce') {
                    // Xử lý xác nhận/hủy ly hôn
                    const userId = params[0];
                    
                    // Chỉ người yêu cầu ly hôn mới có thể xác nhận
                    if (interaction.user.id !== userId) {
                        return interaction.reply({ content: '❌ Chỉ người yêu cầu ly hôn mới có thể xác nhận!', flags: MessageFlags.Ephemeral });
                    }

                    if (action === 'confirm') {
                        const marriage = await Marriage.getMarriage(interaction.guild.id, interaction.user.id);
                        
                        if (!marriage) {
                            const disabledRow = new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('divorce_expired')
                                        .setLabel('Đã hết hạn')
                                        .setStyle(ButtonStyle.Secondary)
                                        .setDisabled(true)
                                );
                            await interaction.update({ components: [disabledRow] });
                            return interaction.followUp({ content: '❌ Bạn chưa kết hôn với ai!', flags: MessageFlags.Ephemeral });
                        }

                        const partnerId = marriage.user1 === interaction.user.id ? marriage.user2 : marriage.user1;
                        
                        // Thực hiện ly hôn
                        await Marriage.divorce(interaction.guild.id, interaction.user.id);

                        const divorceEmbed = new EmbedBuilder()
                            .setColor(0x2F3136)
                            .setTitle('💔 LY HÔN')
                            .setDescription(`${interaction.user} đã ly hôn với <@${partnerId}>`)
                            .setFooter({ text: 'Mối quan hệ đã kết thúc...' })
                            .setTimestamp();

                        const disabledRow = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('divorce_done_confirm')
                                    .setLabel('Đã ly hôn')
                                    .setEmoji('💔')
                                    .setStyle(ButtonStyle.Danger)
                                    .setDisabled(true),
                                new ButtonBuilder()
                                    .setCustomId('divorce_done_cancel')
                                    .setLabel('Hủy bỏ')
                                    .setEmoji('❌')
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(true)
                            );

                        await interaction.update({ embeds: [divorceEmbed], components: [disabledRow] });
                    } else if (action === 'cancel') {
                        const cancelEmbed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle('✅ Đã hủy')
                            .setDescription(`${interaction.user} đã quyết định tiếp tục cuộc hôn nhân!`)
                            .setFooter({ text: '💕 Hãy giữ gìn hạnh phúc!' })
                            .setTimestamp();

                        const disabledRow = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('divorce_done_confirm')
                                    .setLabel('Xác nhận ly hôn')
                                    .setEmoji('💔')
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(true),
                                new ButtonBuilder()
                                    .setCustomId('divorce_done_cancel')
                                    .setLabel('Đã hủy')
                                    .setEmoji('✅')
                                    .setStyle(ButtonStyle.Success)
                                    .setDisabled(true)
                            );

                        await interaction.update({ embeds: [cancelEmbed], components: [disabledRow] });
                    }
                }
            } catch (error) {
                console.error(error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '❌ Có lỗi xảy ra!', flags: MessageFlags.Ephemeral });
                }
            }
        }

        // Xử lý String Select Menu
        if (interaction.isStringSelectMenu()) {
            const [game, action] = interaction.customId.split('_');
            
            try {
                if (game === 'taixiu') {
                    await taixiuHandler.handleSelect(interaction, action);
                } else if (game === 'baucua') {
                    await baucuaHandler.handleSelect(interaction, action);
                } else if (game === 'help') {
                    // Help menu handler - Components V2
                    const selected = interaction.values[0];
                    const prefix = '!'; // Default prefix
                    
                    // Kiểm tra quyền admin
                    const isDev = interaction.user.id === process.env.ID_DEV;
                    const isAdmin = interaction.member.permissions.has('Administrator');
                    
                    // Nếu chọn admin mà không có quyền, từ chối
                    if (selected === 'admin' && !isDev && !isAdmin) {
                        return await interaction.reply({
                            content: '❌ Bạn không có quyền xem danh mục này!',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                    
                    const helpCategories = {
                        economy: {
                            title: '# 💰 LỆNH KINH TẾ',
                            color: 0xF1C40F,
                            commands: [
                                { name: `${prefix}cash`, desc: 'Xem số dư của bạn' },
                                { name: `${prefix}cash @user`, desc: 'Xem số dư người khác' },
                                { name: `${prefix}daily`, desc: 'Nhận tiền hàng ngày' },
                                { name: `${prefix}transfer @user <số>`, desc: 'Chuyển tiền cho người khác' },
                                { name: `${prefix}naptien`, desc: 'Nạp tiền tự động (VietQR)' }
                            ]
                        },
                        games: {
                            title: '# 🎮 LỆNH GAME',
                            color: 0x9B59B6,
                            commands: [
                                { name: `/taixiu choi <tiền>`, desc: 'Chơi Tài Xỉu (1 người)' },
                                { name: `/taixiu auto`, desc: 'Bắt đầu phiên Tài Xỉu tự động' },
                                { name: `/taixiu stop`, desc: 'Dừng phiên Tài Xỉu' },
                                { name: `/baucua choi <tiền>`, desc: 'Chơi Bầu Cua (1 người)' },
                                { name: `/baucua auto`, desc: 'Bắt đầu phiên Bầu Cua tự động' },
                                { name: `/baucua stop`, desc: 'Dừng phiên Bầu Cua' }
                            ]
                        },
                        shop: {
                            title: '# 💍 SHOP & NHẪN',
                            color: 0xFF69B4,
                            commands: [
                                { name: `${prefix}shop`, desc: 'Xem shop nhẫn' },
                                { name: `${prefix}buy <ID>`, desc: 'Mua nhẫn' },
                                { name: `${prefix}inventory`, desc: 'Xem kho đồ của bạn' },
                                { name: `/ring list`, desc: 'Xem danh sách nhẫn' },
                                { name: `/ring buy <ID>`, desc: 'Mua nhẫn bằng slash' }
                            ]
                        },
                        marriage: {
                            title: '# 💕 HÔN NHÂN',
                            color: 0xE91E63,
                            commands: [
                                { name: `${prefix}marry @user <số>`, desc: 'Cầu hôn với nhẫn số ...' },
                                { name: `${prefix}marry`, desc: 'Xem thông tin hôn nhân' },
                                { name: `${prefix}divorce`, desc: 'Ly hôn' }
                            ]
                        },
                        lovepoints: {
                            title: '# 💖 ĐIỂM YÊU THƯƠNG',
                            color: 0xFF69B4,
                            commands: [
                                { name: `${prefix}lp`, desc: 'Xem điểm tình yêu hiện tại' },
                                { name: `${prefix}luv / moa / iuv`, desc: 'Tăng điểm (+5 đến +15)' },
                                { name: `${prefix}kiss / hug / cuddle`, desc: 'Tăng điểm (+5 đến +15)' },
                                { name: `${prefix}iuchong / iuvk / o`, desc: 'Tăng điểm (+5 đến +15)' },
                                { name: `${prefix}hate / ghet`, desc: 'Giảm điểm (-10 đến -25)' },
                                { name: `-# Các lệnh khác`, desc: 'fuck, dm, vcl... (-10 đến -25)' }
                            ]
                        },
                        admin: {
                            title: '# ⚙️ LỆNH QUẢN TRỊ',
                            color: 0xE74C3C,
                            commands: [
                                { name: `${prefix}setprefix <prefix>`, desc: 'Đổi prefix server' },
                                { name: `${prefix}addmoney @user <số>`, desc: 'Thêm tiền cho user' },
                                { name: `${prefix}setmoney @user <số>`, desc: 'Đặt tiền cho user' },
                                { name: `${prefix}reset @user`, desc: 'Reset tiền 1 user về 10k' },
                                { name: `${prefix}resetall`, desc: 'Reset tiền tất cả users (Dev)' },
                                { name: `${prefix}doanhthu`, desc: 'Xem thống kê doanh thu nạp tiền' },
                                { name: `${prefix}resetdoanhthu`, desc: 'Reset thống kê doanh thu' },
                                { name: `${prefix}addring <tên> <giá> [emoji]`, desc: 'Thêm nhẫn vào shop' },
                                { name: `${prefix}removering <ID>`, desc: 'Xóa nhẫn khỏi shop' },
                                { name: `/ring add`, desc: 'Thêm nhẫn (slash)' },
                                { name: `/ring remove <ID>`, desc: 'Xóa nhẫn (slash)' },
                                { name: `/ring edit <ID>`, desc: 'Sửa nhẫn (slash)' }
                            ]
                        }
                    };

                    const category = helpCategories[selected];
                    if (category) {
                        const container = new ContainerBuilder().setAccentColor(category.color);
                        
                        container.addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(category.title)
                        );
                        
                        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
                        
                        const commandsText = category.commands.map(c => `\`${c.name}\`\n↳ ${c.desc}`).join('\n\n');
                        container.addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(commandsText)
                        );
                        
                        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
                        
                        // Nút quay lại
                        const backButton = new ButtonBuilder()
                            .setCustomId('help_back')
                            .setLabel('◀️ Quay lại')
                            .setStyle(ButtonStyle.Secondary);
                        
                        container.addActionRowComponents(new ActionRowBuilder().addComponents(backButton));

                        await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                    }
                }
            } catch (error) {
                console.error(error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '❌ Có lỗi xảy ra!', flags: MessageFlags.Ephemeral });
                }
            }
        }

        // Xử lý Modal Submit
        if (interaction.isModalSubmit()) {
            try {
                if (interaction.customId === 'txs_custombet_modal' || interaction.customId === 'txs_soicau_modal') {
                    return await taixiuSession.handleModal(interaction);
                } else if (interaction.customId === 'bcs_custombet_modal') {
                    return await baucuaSession.handleModal(interaction);
                }
            } catch (error) {
                console.error('Modal error:', error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '❌ Có lỗi xảy ra!', flags: MessageFlags.Ephemeral });
                }
            }
        }
    }
};
