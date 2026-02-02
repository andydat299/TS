require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`🔄 Đang đăng ký ${commands.length} slash commands globally...`);

        // Đăng ký global
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log(`✅ Đã đăng ký ${data.length} commands globally!`);
        console.log('⏳ Lưu ý: Commands global có thể mất đến 1 giờ để cập nhật trên tất cả servers.');
    } catch (error) {
        console.error('❌ Lỗi:', error);
    }
})();
