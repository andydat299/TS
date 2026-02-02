const { createCanvas, loadImage } = require('canvas');
const { drawEmoji, getEmojiURL, isCustomEmoji } = require('./emoji');

/**
 * Tạo ảnh thông tin hôn nhân
 */
async function createMarriageCard(user1, user2, marriage, client) {
    const canvas = createCanvas(800, 450);
    const ctx = canvas.getContext('2d');

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 800, 450);
    gradient.addColorStop(0, '#ff9a9e');
    gradient.addColorStop(0.5, '#fecfef');
    gradient.addColorStop(1, '#fecfef');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 450);

    // Border
    ctx.strokeStyle = '#ff69b4';
    ctx.lineWidth = 8;
    roundRect(ctx, 10, 10, 780, 430, 20);
    ctx.stroke();

    // Inner glow
    ctx.shadowColor = 'rgba(255, 105, 180, 0.5)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    roundRect(ctx, 20, 20, 760, 410, 15);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Title
    ctx.fillStyle = '#c71585';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('💕 Married 💕', 400, 55);

    // Decorative line
    ctx.strokeStyle = '#ff69b4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(150, 70);
    ctx.lineTo(650, 70);
    ctx.stroke();

    // Load avatars
    try {
        // User 1 avatar
        const avatar1Url = user1.displayAvatarURL({ extension: 'png', size: 128 });
        const avatar1 = await loadImage(avatar1Url);
        
        // Avatar 1 circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(200, 170, 70, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar1, 130, 100, 140, 140);
        ctx.restore();

        // Avatar 1 border
        ctx.strokeStyle = '#ff1493';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(200, 170, 72, 0, Math.PI * 2);
        ctx.stroke();

        // User 2 avatar
        const avatar2Url = user2.displayAvatarURL({ extension: 'png', size: 128 });
        const avatar2 = await loadImage(avatar2Url);
        
        // Avatar 2 circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(600, 170, 70, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar2, 530, 100, 140, 140);
        ctx.restore();

        // Avatar 2 border
        ctx.strokeStyle = '#ff1493';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(600, 170, 72, 0, Math.PI * 2);
        ctx.stroke();
    } catch (e) {
        console.error('Error loading avatars:', e);
    }

    // Heart in the middle
    ctx.fillStyle = '#ff1493';
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('❤️', 400, 185);

    // User names
    ctx.fillStyle = '#8b008b';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(truncateName(user1.displayName || user1.username, 15), 200, 265);
    ctx.fillText(truncateName(user2.displayName || user2.username, 15), 600, 265);

    // Love points section
    const lovePoints = marriage.lovePoints || 100;
    const maxPoints = 500;
    const progressPercent = Math.min(lovePoints / maxPoints, 1);
    
    // Love status
    let loveStatus, loveColor, loveEmoji;
    if (lovePoints >= 500) {
        loveStatus = 'Tình yêu bất diệt!';
        loveColor = '#ff1493';
        loveEmoji = '💖💖💖💖💖';
    } else if (lovePoints >= 300) {
        loveStatus = 'Hạnh phúc viên mãn!';
        loveColor = '#ff69b4';
        loveEmoji = '💕💕💕💕';
    } else if (lovePoints >= 150) {
        loveStatus = 'Tình cảm tốt đẹp!';
        loveColor = '#ffb6c1';
        loveEmoji = '💗💗💗';
    } else if (lovePoints >= 50) {
        loveStatus = 'Bình thường';
        loveColor = '#ffd700';
        loveEmoji = '💛💛';
    } else if (lovePoints > 0) {
        loveStatus = 'Đang có vấn đề!';
        loveColor = '#ffa500';
        loveEmoji = '💔';
    } else {
        loveStatus = 'Sắp tan vỡ!';
        loveColor = '#ff4757';
        loveEmoji = '💔💔💔';
    }

    // Love points box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    roundRect(ctx, 100, 285, 600, 70, 12);
    ctx.fill();
    ctx.strokeStyle = loveColor;
    ctx.lineWidth = 3;
    roundRect(ctx, 100, 285, 600, 70, 12);
    ctx.stroke();

    // Love emoji and points text
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(loveEmoji, 400, 310);
    
    // Progress bar background
    ctx.fillStyle = '#e0e0e0';
    roundRect(ctx, 150, 320, 500, 20, 10);
    ctx.fill();
    
    // Progress bar fill
    ctx.fillStyle = loveColor;
    if (progressPercent > 0) {
        roundRect(ctx, 150, 320, 500 * progressPercent, 20, 10);
        ctx.fill();
    }
    
    // Points text on bar
    ctx.fillStyle = '#333';
    ctx.font = 'bold 12px Arial';
    ctx.fillText(`${lovePoints} / ${maxPoints} - ${loveStatus}`, 400, 335);

    // Marriage info box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    roundRect(ctx, 100, 365, 600, 70, 15);
    ctx.fill();
    ctx.strokeStyle = '#ff69b4';
    ctx.lineWidth = 2;
    roundRect(ctx, 100, 365, 600, 70, 15);
    ctx.stroke();

    // Marriage details
    const marriedDate = marriage.marriedAt.toLocaleDateString('vi-VN');
    const daysMarried = Math.floor((Date.now() - marriage.marriedAt.getTime()) / (1000 * 60 * 60 * 24));

    ctx.fillStyle = '#8b008b';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';

    // Ring info - xử lý custom emoji
    const emojiUrl = getEmojiURL(marriage.ringEmoji);
    if (emojiUrl) {
        try {
            const emojiImg = await loadImage(emojiUrl);
            ctx.drawImage(emojiImg, 115, 378, 24, 24);
            ctx.textAlign = 'left';
            ctx.fillText(`${marriage.ringName}`, 145, 395);
        } catch (e) {
            ctx.textAlign = 'center';
            ctx.fillText(`💍 ${marriage.ringName}`, 200, 395);
        }
    } else {
        ctx.fillText(`${marriage.ringEmoji} ${marriage.ringName}`, 200, 395);
    }
    
    // Date info
    ctx.textAlign = 'center';
    ctx.fillText(`📅 ${marriedDate}`, 400, 395);
    
    // Days together
    ctx.fillStyle = '#c71585';
    ctx.fillText(`⏳ ${daysMarried} ngày`, 600, 395);
    
    // Footer
    ctx.font = '14px Arial';
    ctx.fillStyle = '#8b008b';
    ctx.fillText('💕 Hãy yêu thương nhau mỗi ngày!', 400, 420);

    return canvas.toBuffer('image/png');
}

/**
 * Tạo ảnh khi chưa kết hôn
 */
async function createNotMarriedCard(user, prefix) {
    const canvas = createCanvas(600, 250);
    const ctx = canvas.getContext('2d');

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 600, 250);
    gradient.addColorStop(0, '#bdc3c7');
    gradient.addColorStop(1, '#95a5a6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 600, 250);

    // Border
    ctx.strokeStyle = '#7f8c8d';
    ctx.lineWidth = 6;
    roundRect(ctx, 8, 8, 584, 234, 15);
    ctx.stroke();

    // Title
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('💔 CHƯA KẾT HÔN', 300, 60);

    // Load avatar
    try {
        const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 128 });
        const avatar = await loadImage(avatarUrl);
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(300, 130, 45, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, 255, 85, 90, 90);
        ctx.restore();

        ctx.strokeStyle = '#7f8c8d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(300, 130, 47, 0, Math.PI * 2);
        ctx.stroke();
    } catch (e) {}

    // Message
    ctx.fillStyle = '#34495e';
    ctx.font = '18px Arial';
    ctx.fillText('Bạn chưa kết hôn với ai!', 300, 200);
    ctx.font = '16px Arial';
    ctx.fillStyle = '#7f8c8d';
    //ctx.fillText(`📌 Dùng ${prefix}marry @user để cầu hôn`, 300, 230);

    return canvas.toBuffer('image/png');
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

function truncateName(name, maxLength) {
    if (name.length > maxLength) {
        return name.substring(0, maxLength - 2) + '..';
    }
    return name;
}

module.exports = {
    createMarriageCard,
    createNotMarriedCard
};
