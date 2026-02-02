const { createCanvas, loadImage } = require('canvas');
const { drawEmoji, isCustomEmoji } = require('../utils/emoji');

// Màu sắc
const COLORS = {
    background: '#1a1a2e',
    boardBg: '#16213e',
    cellBg: '#0f3460',
    cellBorder: '#e94560',
    textWhite: '#ffffff',
    textGold: '#ffd700',
    textGreen: '#00ff88',
    textRed: '#ff4757',
    betHighlight: '#00ff88'
};

// Data cho từng con vật
// Emoji có thể thay bằng Discord custom emoji: '<:nai:1234567890>'
const SYMBOL_DATA = {
    nai: { name: 'NAI', color: '#b8e994', icon: '🦌', index: 0 },
    bau: { name: 'BẦU', color: '#ff9f43', icon: '🫎', index: 1 },
    ga: { name: 'GÀ', color: '#ffeaa7', icon: '🐓', index: 2 },
    tom: { name: 'TÔM', color: '#f368e0', icon: '🦐', index: 3 },
    cua: { name: 'CUA', color: '#ee5a24', icon: '🦀', index: 4 },
    ca: { name: 'CÁ', color: '#54a0ff', icon: '🐟', index: 5 }
};

const SYMBOL_LIST = ['nai', 'bau', 'ga', 'tom', 'cua', 'ca'];

// Vẽ rounded rectangle
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

// Tạo canvas game board - hiển thị bảng cược
async function createGameBoard(bets, betAmount) {
    const width = 600;
    const height = 350;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = '#e94560';
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, width - 10, height - 10);

    // Title
    ctx.fillStyle = COLORS.textGold;
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎲 BẦU CUA TÔM CÁ 🎲', width / 2, 40);

    // Vẽ 6 ô con vật (2 hàng x 3 cột)
    const cellWidth = 170;
    const cellHeight = 110;
    const startX = 25;
    const startY = 60;
    const gapX = 15;
    const gapY = 15;

    for (let i = 0; i < 6; i++) {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = startX + col * (cellWidth + gapX);
        const y = startY + row * (cellHeight + gapY);
        const symbol = SYMBOL_LIST[i];
        const data = SYMBOL_DATA[symbol];
        const betOnThis = bets[symbol] || 0;

        // Cell background
        roundRect(ctx, x, y, cellWidth, cellHeight, 12);
        ctx.fillStyle = betOnThis > 0 ? '#1e5128' : COLORS.cellBg;
        ctx.fill();

        // Border
        ctx.strokeStyle = betOnThis > 0 ? COLORS.betHighlight : '#4a69bd';
        ctx.lineWidth = betOnThis > 0 ? 4 : 2;
        ctx.stroke();

        // Icon (emoji) - hỗ trợ Discord custom
        await drawEmoji(ctx, data.icon, x + cellWidth / 2, y + 45, 45, loadImage);

        // Name
        ctx.fillStyle = data.color;
        ctx.font = 'bold 16px Arial';
        ctx.fillText(data.name, x + cellWidth / 2, y + 80);

        // Bet amount if any
        if (betOnThis > 0) {
            ctx.fillStyle = COLORS.textGreen;
            ctx.font = 'bold 14px Arial';
            ctx.fillText(`💰 ${betOnThis.toLocaleString()}đ`, x + cellWidth / 2, y + 100);
        }
    }

    // Footer
    ctx.fillStyle = '#888888';
    ctx.font = '13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Nhấn vào biểu tượng để đặt cược (+${betAmount.toLocaleString()}đ mỗi lần)`, width / 2, height - 15);

    return canvas.toBuffer('image/png');
}

// Tạo canvas kết quả - hiển thị 3 xúc xắc và chi tiết
async function createResultBoard(diceResults, bets, results) {
    const width = 600;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background based on win/lose
    const isWin = results.netGain >= 0;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    if (results.netGain > 0) {
        gradient.addColorStop(0, '#1a472a');
        gradient.addColorStop(1, '#0d2818');
    } else if (results.netGain === 0) {
        gradient.addColorStop(0, '#3d3d00');
        gradient.addColorStop(1, '#1a1a00');
    } else {
        gradient.addColorStop(0, '#4a1a1a');
        gradient.addColorStop(1, '#2d0d0d');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = isWin ? '#00ff88' : '#ff4757';
    ctx.lineWidth = 4;
    ctx.strokeRect(5, 5, width - 10, height - 10);

    // Title
    ctx.fillStyle = COLORS.textGold;
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎲 KẾT QUẢ XÚC XẮC 🎲', width / 2, 38);

    // 3 dice results
    const diceSize = 130;
    const diceStartX = (width - (diceSize * 3 + 40)) / 2;
    const diceY = 55;

    for (let i = 0; i < 3; i++) {
        const x = diceStartX + i * (diceSize + 20);
        const diceIndex = diceResults[i];
        const symbol = SYMBOL_LIST[diceIndex];
        const data = SYMBOL_DATA[symbol];

        // Dice background
        roundRect(ctx, x, diceY, diceSize, diceSize, 18);
        ctx.fillStyle = '#0f3460';
        ctx.fill();
        ctx.strokeStyle = data.color;
        ctx.lineWidth = 4;
        ctx.stroke();

        // Icon - hỗ trợ Discord custom
        await drawEmoji(ctx, data.icon, x + diceSize / 2, diceY + 55, 60, loadImage);

        // Name
        ctx.fillStyle = data.color;
        ctx.font = 'bold 16px Arial';
        ctx.fillText(data.name, x + diceSize / 2, diceY + 110);
    }

    // Separator
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 205);
    ctx.lineTo(width - 30, 205);
    ctx.stroke();

    // Bet details
    let detailY = 230;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.textWhite;
    ctx.fillText('📋 Chi tiết cược:', 40, detailY);
    detailY += 25;

    ctx.font = '15px Arial';
    for (const detail of results.details) {
        const isWinDetail = detail.includes('+');
        ctx.fillStyle = isWinDetail ? COLORS.textGreen : COLORS.textRed;
        ctx.fillText(detail, 50, detailY);
        detailY += 22;
    }

    // Net result - big text
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    const resultY = height - 50;
    
    if (results.netGain > 0) {
        ctx.fillStyle = COLORS.textGreen;
        ctx.fillText(`🎉 THẮNG +${results.netGain.toLocaleString()}đ 🎉`, width / 2, resultY);
    } else if (results.netGain === 0) {
        ctx.fillStyle = COLORS.textGold;
        ctx.fillText(`😐 HÒA VỐN`, width / 2, resultY);
    } else {
        ctx.fillStyle = COLORS.textRed;
        ctx.fillText(`😢 THUA ${Math.abs(results.netGain).toLocaleString()}đ`, width / 2, resultY);
    }

    return canvas.toBuffer('image/png');
}

// Animation frame - hiển thị đang lắc
async function createAnimationFrame() {
    const width = 600;
    const height = 180;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#2d3436');
    gradient.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, width - 10, height - 10);

    // Title
    ctx.fillStyle = COLORS.textGold;
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎲 ĐANG LẮC XÚC XẮC... 🎲', width / 2, 38);

    // Random dice animation
    const diceSize = 100;
    const diceStartX = (width - (diceSize * 3 + 40)) / 2;
    const diceY = 55;

    for (let i = 0; i < 3; i++) {
        const x = diceStartX + i * (diceSize + 20);
        const randomSymbol = SYMBOL_LIST[Math.floor(Math.random() * 6)];
        const data = SYMBOL_DATA[randomSymbol];

        roundRect(ctx, x, diceY, diceSize, diceSize, 15);
        ctx.fillStyle = '#0f3460';
        ctx.fill();
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Icon - hỗ trợ Discord custom
        await drawEmoji(ctx, data.icon, x + diceSize / 2, diceY + 50, 50, loadImage);
    }

    return canvas.toBuffer('image/png');
}

module.exports = {
    createGameBoard,
    createResultBoard,
    createAnimationFrame,
    SYMBOL_DATA,
    SYMBOL_LIST
};
