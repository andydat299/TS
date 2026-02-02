/**
 * Tiện ích xử lý Emoji Discord
 * Hỗ trợ cả emoji Unicode thường và emoji custom Discord (<:name:id> hoặc <a:name:id>)
 */

/**
 * Parse emoji string để sử dụng trong ButtonBuilder.setEmoji()
 * @param {string} emoji - Emoji string (Unicode hoặc Discord custom format)
 * @returns {string|object} - Emoji đã được parse
 */
function parseEmoji(emoji) {
    if (!emoji) return null;
    
    // Kiểm tra emoji custom Discord: <:name:id> hoặc <a:name:id>
    const customEmojiMatch = emoji.match(/^<(a)?:(\w+):(\d+)>$/);
    if (customEmojiMatch) {
        return {
            animated: !!customEmojiMatch[1],
            name: customEmojiMatch[2],
            id: customEmojiMatch[3]
        };
    }
    
    // Emoji Unicode thường
    return emoji;
}

/**
 * Parse emoji từ string để hiển thị
 * @param {string} emoji - Emoji string
 * @returns {string} - Emoji để hiển thị trong text
 */
function displayEmoji(emoji) {
    if (!emoji) return '💍';
    return emoji; // Discord tự render cả emoji custom và unicode
}

/**
 * Kiểm tra xem string có phải emoji custom Discord không
 * @param {string} emoji - Emoji string
 * @returns {boolean}
 */
function isCustomEmoji(emoji) {
    if (!emoji) return false;
    return /^<a?:\w+:\d+>$/.test(emoji);
}

/**
 * Lấy URL của emoji custom Discord
 * @param {string} emoji - Emoji string
 * @returns {string|null} - URL của emoji hoặc null
 */
function getEmojiURL(emoji) {
    if (!emoji) return null;
    
    const customEmojiMatch = emoji.match(/^<(a)?:(\w+):(\d+)>$/);
    if (customEmojiMatch) {
        const animated = !!customEmojiMatch[1];
        const id = customEmojiMatch[3];
        const ext = animated ? 'gif' : 'png';
        return `https://cdn.discordapp.com/emojis/${id}.${ext}`;
    }
    
    return null;
}

/**
 * Tạo emoji object cho ButtonBuilder
 * @param {string} emoji - Emoji string
 * @returns {object|string} - Emoji object hoặc string
 */
function buttonEmoji(emoji) {
    if (!emoji) return null;
    
    const parsed = parseEmoji(emoji);
    if (typeof parsed === 'object') {
        return parsed;
    }
    return emoji;
}

/**
 * Parse emoji ID từ string
 * @param {string} emoji - Emoji string
 * @returns {string|null} - Emoji ID hoặc null
 */
function getEmojiId(emoji) {
    if (!emoji) return null;
    
    const match = emoji.match(/^<a?:\w+:(\d+)>$/);
    return match ? match[1] : null;
}

/**
 * Parse emoji name từ string
 * @param {string} emoji - Emoji string  
 * @returns {string|null} - Emoji name hoặc null
 */
function getEmojiName(emoji) {
    if (!emoji) return null;
    
    const match = emoji.match(/^<a?:(\w+):\d+>$/);
    return match ? match[1] : null;
}

// Cache để lưu ảnh emoji đã load
const emojiImageCache = new Map();

/**
 * Load emoji image từ Discord CDN (hỗ trợ custom emoji)
 * @param {string} emoji - Emoji string
 * @param {function} loadImage - loadImage function từ canvas
 * @returns {Promise<Image|null>} - Image object hoặc null
 */
async function loadEmojiImage(emoji, loadImage) {
    if (!emoji || !loadImage) return null;
    
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

/**
 * Vẽ emoji lên canvas (hỗ trợ cả Unicode và Discord custom)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} emoji - Emoji string
 * @param {number} x - Tọa độ X (center)
 * @param {number} y - Tọa độ Y (center)
 * @param {number} size - Kích thước emoji
 * @param {function} loadImage - loadImage function từ canvas
 * @param {object} options - Tùy chọn (opacity, align)
 * @returns {Promise<boolean>} - true nếu vẽ được custom emoji
 */
async function drawEmoji(ctx, emoji, x, y, size, loadImage, options = {}) {
    const { opacity = 1, align = 'center' } = options;
    
    const emojiImg = await loadEmojiImage(emoji, loadImage);
    
    ctx.save();
    if (opacity !== 1) ctx.globalAlpha = opacity;
    
    if (emojiImg) {
        // Discord custom emoji - vẽ image
        let drawX = x;
        let drawY = y;
        
        if (align === 'center') {
            drawX = x - size / 2;
            drawY = y - size / 2;
        } else if (align === 'left') {
            drawY = y - size / 2;
        }
        
        ctx.drawImage(emojiImg, drawX, drawY, size, size);
        ctx.restore();
        return true;
    } else {
        // Unicode emoji - vẽ text
        ctx.font = `${size}px Arial`;
        ctx.textAlign = align === 'left' ? 'left' : 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, x, y);
        ctx.restore();
        return false;
    }
}

/**
 * Clear cache emoji
 */
function clearEmojiCache() {
    emojiImageCache.clear();
}

module.exports = {
    parseEmoji,
    displayEmoji,
    isCustomEmoji,
    getEmojiURL,
    buttonEmoji,
    getEmojiId,
    getEmojiName,
    loadEmojiImage,
    drawEmoji,
    clearEmojiCache}
