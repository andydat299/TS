require('dotenv').config();

const raw = process.env.ID_DEV || '';
const devIds = new Set(raw.split(',').map(s => s.trim()).filter(Boolean));

function isDev(id) {
    return devIds.has(String(id));
}

module.exports = { isDev, devIds };
