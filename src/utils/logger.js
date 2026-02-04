const fs = require('fs').promises;
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'transactions.log');

async function ensureLogDir() {
    try {
        await fs.mkdir(LOG_DIR, { recursive: true });
    } catch (e) {}
}

async function appendLog(line) {
    try {
        await ensureLogDir();
        await fs.appendFile(LOG_FILE, line + '\n', { encoding: 'utf8' });
    } catch (e) {
        console.error('Logger write error:', e);
    }
}

function fmtTime(date = new Date()) {
    return date.toISOString();
}

async function logDeposit({ userId, username, amount, newBalance, code }) {
    const line = `[${fmtTime()}] DEPOSIT | user:${userId} | name:${username} | amount:${amount} | balance:${newBalance} | code:${code || '-'} `;
    await appendLog(line);
}

async function logBet({ game, guildId, channelId, round, userId, username, choice, amount }) {
    const line = `[${fmtTime()}] BET | game:${game} | guild:${guildId || '-'} | channel:${channelId || '-'} | round:${round || '-'} | user:${userId} | name:${username} | choice:${choice || '-'} | amount:${amount}`;
    await appendLog(line);
}

async function logResult({ game, guildId, channelId, round, userId, username, stake, win }) {
    const outcome = win > 0 ? 'WIN' : 'LOSS';
    const line = `[${fmtTime()}] RESULT | game:${game} | guild:${guildId || '-'} | channel:${channelId || '-'} | round:${round || '-'} | user:${userId} | name:${username} | stake:${stake} | win:${win} | outcome:${outcome}`;
    await appendLog(line);
}

module.exports = { logDeposit, logBet, logResult };
