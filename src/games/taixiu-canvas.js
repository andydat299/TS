const { createCanvas, loadImage } = require('canvas');
const { drawEmoji, isCustomEmoji } = require('../utils/emoji');

const COLORS = {
    background: '#1a1a2e',
    textWhite: '#ffffff',
    textGold: '#ffd700',
    textGreen: '#00ff88',
    textRed: '#ff4757',
    tai: '#e74c3c',
    xiu: '#3498db'
};

// Vẽ mặt xúc xắc bằng chấm tròn
function drawDiceFace(ctx, value, x, y, size) {
    const dotSize = size * 0.12;
    const padding = size * 0.22;
    
    ctx.fillStyle = '#ffffff';
    
    // Vị trí các chấm
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
        case 1:
            drawDot(positions.center);
            break;
        case 2:
            drawDot(positions.topLeft);
            drawDot(positions.bottomRight);
            break;
        case 3:
            drawDot(positions.topLeft);
            drawDot(positions.center);
            drawDot(positions.bottomRight);
            break;
        case 4:
            drawDot(positions.topLeft);
            drawDot(positions.topRight);
            drawDot(positions.bottomLeft);
            drawDot(positions.bottomRight);
            break;
        case 5:
            drawDot(positions.topLeft);
            drawDot(positions.topRight);
            drawDot(positions.center);
            drawDot(positions.bottomLeft);
            drawDot(positions.bottomRight);
            break;
        case 6:
            drawDot(positions.topLeft);
            drawDot(positions.topRight);
            drawDot(positions.midLeft);
            drawDot(positions.midRight);
            drawDot(positions.bottomLeft);
            drawDot(positions.bottomRight);
            break;
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

// Tạo board game Tài Xỉu
async function createGameBoard(balance, betAmount, choice) {
    const width = 500;
    const height = 200;
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

    // Title
    ctx.fillStyle = COLORS.textGold;
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎲 TÀI XỈU 🎲', width / 2, 40);

    // Info
    ctx.font = '18px Arial';
    ctx.fillStyle = COLORS.textWhite;
    ctx.fillText(`💰 Số dư: ${balance.toLocaleString()}đ`, width / 2, 75);

    // Bet info
    if (betAmount) {
        ctx.fillStyle = COLORS.textGreen;
        ctx.fillText(`🎯 Cược: ${betAmount.toLocaleString()}đ`, width / 2, 105);
    }

    // Choice boxes
    const boxWidth = 180;
    const boxHeight = 60;
    const boxY = 120;

    // TÀI box
    roundRect(ctx, 40, boxY, boxWidth, boxHeight, 10);
    ctx.fillStyle = choice === 'tai' ? COLORS.tai : '#2d3436';
    ctx.fill();
    ctx.strokeStyle = COLORS.tai;
    ctx.lineWidth = choice === 'tai' ? 4 : 2;
    ctx.stroke();

    ctx.fillStyle = COLORS.textWhite;
    ctx.font = 'bold 22px Arial';
    ctx.fillText('🔴 TÀI', 40 + boxWidth / 2, boxY + 28);
    ctx.font = '14px Arial';
    ctx.fillText('(11 - 18)', 40 + boxWidth / 2, boxY + 48);

    // XỈU box
    roundRect(ctx, width - 40 - boxWidth, boxY, boxWidth, boxHeight, 10);
    ctx.fillStyle = choice === 'xiu' ? COLORS.xiu : '#2d3436';
    ctx.fill();
    ctx.strokeStyle = COLORS.xiu;
    ctx.lineWidth = choice === 'xiu' ? 4 : 2;
    ctx.stroke();

    ctx.fillStyle = COLORS.textWhite;
    ctx.font = 'bold 22px Arial';
    ctx.fillText('🔵 XỈU', width - 40 - boxWidth / 2, boxY + 28);
    ctx.font = '14px Arial';
    ctx.fillText('(3 - 10)', width - 40 - boxWidth / 2, boxY + 48);

    return canvas.toBuffer('image/png');
}

// Tạo kết quả Tài Xỉu
async function createResultBoard(dice, total, won, betAmount, newBalance) {
    const width = 500;
    const height = 280;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    if (won) {
        gradient.addColorStop(0, '#1a472a');
        gradient.addColorStop(1, '#0d2818');
    } else {
        gradient.addColorStop(0, '#4a1a1a');
        gradient.addColorStop(1, '#2d0d0d');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = won ? COLORS.textGreen : COLORS.textRed;
    ctx.lineWidth = 4;
    ctx.strokeRect(5, 5, width - 10, height - 10);

    // Title
    ctx.fillStyle = COLORS.textGold;
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎲 KẾT QUẢ 🎲', width / 2, 38);

    // Dice
    const diceSize = 80;
    const diceStartX = (width - (diceSize * 3 + 30)) / 2;
    const diceY = 55;

    for (let i = 0; i < 3; i++) {
        const x = diceStartX + i * (diceSize + 15);
        
        roundRect(ctx, x, diceY, diceSize, diceSize, 12);
        ctx.fillStyle = '#0f3460';
        ctx.fill();
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Vẽ mặt xúc xắc
        drawDiceFace(ctx, dice[i], x, diceY, diceSize);
    }

    // Total & Result
    const result = total >= 11 ? 'TÀI' : 'XỈU';
    const resultColor = total >= 11 ? COLORS.tai : COLORS.xiu;
    const resultEmoji = total >= 11 ? '🔴' : '🔵';

    ctx.font = 'bold 32px Arial';
    ctx.fillStyle = resultColor;
    ctx.fillText(`${total} → ${resultEmoji} ${result}`, width / 2, 175);

    // Win/Lose
    ctx.font = 'bold 28px Arial';
    if (won) {
        ctx.fillStyle = COLORS.textGreen;
        ctx.fillText(`🎉 THẮNG +${Math.floor(betAmount * 0.8).toLocaleString()}đ`, width / 2, 215);
    } else {
        ctx.fillStyle = COLORS.textRed;
        ctx.fillText(`😢 THUA -${betAmount.toLocaleString()}đ`, width / 2, 215);
    }

    // Balance
    ctx.font = '20px Arial';
    ctx.fillStyle = COLORS.textWhite;
    ctx.fillText(`💰 Số dư: ${newBalance.toLocaleString()}đ`, width / 2, 255);

    return canvas.toBuffer('image/png');
}

// Animation đang lắc
async function createRollingAnimation() {
    const width = 500;
    const height = 150;
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
    ctx.fillText('🎲 ĐANG LẮC... 🎲', width / 2, 40);

    // Random dice
    const diceSize = 70;
    const diceStartX = (width - (diceSize * 3 + 30)) / 2;
    const diceY = 55;

    for (let i = 0; i < 3; i++) {
        const x = diceStartX + i * (diceSize + 15);
        const randomDice = Math.floor(Math.random() * 6) + 1;

        roundRect(ctx, x, diceY, diceSize, diceSize, 10);
        ctx.fillStyle = '#0f3460';
        ctx.fill();
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 2;
        ctx.stroke();

        drawDiceFace(ctx, randomDice, x, diceY, diceSize);
    }

    return canvas.toBuffer('image/png');
}

module.exports = {
    createGameBoard,
    createResultBoard,
    createRollingAnimation
};
