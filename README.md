# 🎲 Discord Bot Tài Xỉu & Bầu Cua

Bot Discord chơi game Tài Xỉu và Bầu Cua với giao diện components v2 (buttons, select menus).

## 📋 Tính năng

### 🎲 Tài Xỉu
- Đoán tổng 3 viên xúc xắc: **TÀI** (11-18) hoặc **XỈU** (3-10)
- Chọn mức cược linh hoạt
- Animation lắc xúc xắc
- Thắng x2 tiền cược

### 🦀 Bầu Cua
- 6 biểu tượng: Bầu 🎃, Cua 🦀, Tôm 🦐, Cá 🐟, Gà 🐓, Nai 🦌
- Đặt cược nhiều con cùng lúc
- Mỗi con trùng = x1 tiền cược
- Animation lắc

### 💰 Hệ thống tiền
- Số dư ban đầu: 10,000 🪙
- `/daily` - Nhận tiền hàng ngày (1,000 - 5,000 🪙)
- `/balance` - Xem số dư

## 🚀 Cài đặt

### 1. Cài đặt dependencies
```bash
npm install
```

### 2. Tạo Discord Bot
1. Vào [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" → Đặt tên bot
3. Vào tab "Bot" → Click "Add Bot"
4. Copy **Token** 
5. Bật các **Privileged Gateway Intents**:
   - MESSAGE CONTENT INTENT
6. Vào tab "OAuth2" → "URL Generator"
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Use Slash Commands`, `Embed Links`
7. Copy URL và mời bot vào server

### 3. Cấu hình
Tạo file `.env` từ `.env.example`:
```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_id_here
GUILD_ID=your_server_id_here
```

- **DISCORD_TOKEN**: Token của bot (từ tab Bot)
- **CLIENT_ID**: Application ID (từ tab General Information)
- **GUILD_ID**: ID server Discord (chuột phải vào server → Copy ID)

### 4. Đăng ký Slash Commands
```bash
node src/deploy-commands.js
```

### 5. Chạy bot
```bash
npm start
```
Hoặc chế độ development:
```bash
npm run dev
```

## 📝 Commands

| Command | Mô tả |
|---------|-------|
| `/taixiu` | Chơi game Tài Xỉu |
| `/baucua` | Chơi game Bầu Cua |
| `/balance` | Xem số dư tài khoản |
| `/daily` | Nhận tiền hàng ngày |

## 🎮 Cách chơi

### Tài Xỉu
1. Dùng lệnh `/taixiu`
2. Chọn mức cược từ menu dropdown
3. Bấm nút **TÀI** hoặc **XỈU**
4. Bấm **LẮC!** để quay

### Bầu Cua
1. Dùng lệnh `/baucua`
2. Chọn mức cược từ menu dropdown
3. Bấm vào các con vật muốn cược (có thể cược nhiều con)
4. Bấm **LẮC!** để quay

## 📁 Cấu trúc project

```
├── src/
│   ├── commands/         # Slash commands
│   │   ├── taixiu.js
│   │   ├── baucua.js
│   │   ├── balance.js
│   │   └── daily.js
│   ├── events/           # Discord events
│   │   ├── ready.js
│   │   └── interactionCreate.js
│   ├── games/            # Game logic
│   │   ├── taixiu.js
│   │   └── baucua.js
│   ├── index.js          # Entry point
│   └── deploy-commands.js
├── .env
├── .env.example
├── package.json
└── README.md
```

## ⚠️ Lưu ý

- Dữ liệu số dư được lưu trong memory, sẽ mất khi restart bot
- Để lưu vĩnh viễn, tích hợp database (MongoDB, SQLite, etc.)
- Bot sử dụng Discord.js v14+

## 📄 License

MIT License
