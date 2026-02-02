const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const Ring = require('../database/models/Ring');
const Inventory = require('../database/models/Inventory');
const User = require('../database/models/User');
const { displayEmoji } = require('../utils/emoji');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ring')
        .setDescription('Quản lý shop nhẫn')
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Thêm nhẫn vào shop (Admin)')
                .addStringOption(opt => opt.setName('tên').setDescription('Tên nhẫn').setRequired(true))
                .addIntegerOption(opt => opt.setName('giá').setDescription('Giá nhẫn').setRequired(true).setMinValue(1))
                .addStringOption(opt => opt.setName('emoji').setDescription('Emoji nhẫn (hỗ trợ emoji Discord <:name:id>)').setRequired(false))
                .addStringOption(opt => opt.setName('mô_tả').setDescription('Mô tả nhẫn').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Xóa nhẫn khỏi shop (Admin)')
                .addStringOption(opt => opt.setName('id').setDescription('ID nhẫn cần xóa').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('Xem danh sách nhẫn trong shop')
        )
        .addSubcommand(sub =>
            sub.setName('buy')
                .setDescription('Mua nhẫn')
                .addStringOption(opt => opt.setName('id').setDescription('ID nhẫn cần mua').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('edit')
                .setDescription('Sửa thông tin nhẫn (Admin)')
                .addStringOption(opt => opt.setName('id').setDescription('ID nhẫn cần sửa').setRequired(true))
                .addStringOption(opt => opt.setName('tên').setDescription('Tên mới').setRequired(false))
                .addIntegerOption(opt => opt.setName('giá').setDescription('Giá mới').setRequired(false).setMinValue(1))
                .addStringOption(opt => opt.setName('emoji').setDescription('Emoji mới (hỗ trợ emoji Discord <:name:id>)').setRequired(false))
                .addStringOption(opt => opt.setName('mô_tả').setDescription('Mô tả mới').setRequired(false))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'add': {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Bạn cần quyền **Administrator**!', flags: MessageFlags.Ephemeral });
                }

                const name = interaction.options.getString('tên');
                const price = interaction.options.getInteger('giá');
                const emoji = interaction.options.getString('emoji') || '💍';
                const description = interaction.options.getString('mô_tả') || '';

                const ring = await Ring.addRing(interaction.guild.id, name, price, emoji, description, interaction.user.id);
                await interaction.reply(`✅ Đã thêm nhẫn ${displayEmoji(emoji)} **${name}** với giá **${price.toLocaleString()}** 🪙\nID: \`${ring._id}\``);
                break;
            }

            case 'remove': {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Bạn cần quyền **Administrator**!', flags: MessageFlags.Ephemeral });
                }

                const ringId = interaction.options.getString('id');
                try {
                    const ring = await Ring.removeRing(interaction.guild.id, ringId);
                    if (ring) {
                        await interaction.reply(`✅ Đã xóa nhẫn ${displayEmoji(ring.emoji)} **${ring.name}**`);
                    } else {
                        await interaction.reply({ content: '❌ Không tìm thấy nhẫn!', flags: MessageFlags.Ephemeral });
                    }
                } catch (e) {
                    await interaction.reply({ content: '❌ ID không hợp lệ!', flags: MessageFlags.Ephemeral });
                }
                break;
            }

            case 'list': {
                const rings = await Ring.getRings(interaction.guild.id);
                
                if (rings.length === 0) {
                    return interaction.reply('💍 **Shop Nhẫn**\n\n*Chưa có nhẫn nào!*\n\n📌 Admin dùng `/ring add` để thêm nhẫn');
                }

                let shopText = '💍 **SHOP NHẪN**\n\n';
                rings.forEach((ring, index) => {
                    shopText += `**${index + 1}.** ${displayEmoji(ring.emoji)} **${ring.name}** - **${ring.price.toLocaleString()}** 🪙\n`;
                    if (ring.description) shopText += `   └ *${ring.description}*\n`;
                    shopText += `   └ ID: \`${ring._id}\`\n\n`;
                });
                shopText += '📌 Dùng `/ring buy` để mua nhẫn';
                
                await interaction.reply(shopText);
                break;
            }

            case 'buy': {
                const ringId = interaction.options.getString('id');
                
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
                    
                    await interaction.reply(`✅ Đã mua ${displayEmoji(ring.emoji)} **${ring.name}** với giá **${ring.price.toLocaleString()}** 🪙\n💰 Số dư còn lại: **${(balance - ring.price).toLocaleString()}** 🪙`);
                } catch (e) {
                    await interaction.reply({ content: '❌ ID không hợp lệ!', flags: MessageFlags.Ephemeral });
                }
                break;
            }

            case 'edit': {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Bạn cần quyền **Administrator**!', flags: MessageFlags.Ephemeral });
                }

                const ringId = interaction.options.getString('id');
                const newName = interaction.options.getString('tên');
                const newPrice = interaction.options.getInteger('giá');
                const newEmoji = interaction.options.getString('emoji');
                const newDescription = interaction.options.getString('mô_tả');

                if (!newName && !newPrice && !newEmoji && newDescription === null) {
                    return interaction.reply({ content: '❌ Vui lòng nhập ít nhất một thông tin cần sửa!', flags: MessageFlags.Ephemeral });
                }

                try {
                    const ring = await Ring.getRingById(ringId);
                    if (!ring || ring.guildId !== interaction.guild.id) {
                        return interaction.reply({ content: '❌ Không tìm thấy nhẫn!', flags: MessageFlags.Ephemeral });
                    }

                    if (newName) ring.name = newName;
                    if (newPrice) ring.price = newPrice;
                    if (newEmoji) ring.emoji = newEmoji;
                    if (newDescription !== null) ring.description = newDescription;
                    await ring.save();

                    await interaction.reply(`✅ Đã cập nhật nhẫn ${displayEmoji(ring.emoji)} **${ring.name}**\n💰 Giá: **${ring.price.toLocaleString()}** 🪙${ring.description ? `\n📝 Mô tả: *${ring.description}*` : ''}`);
                } catch (e) {
                    await interaction.reply({ content: '❌ ID không hợp lệ!', flags: MessageFlags.Ephemeral });
                }
                break;
            }
        }
    }
};
