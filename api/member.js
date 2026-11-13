const JSONBIN_BASE = 'https://api.jsonbin.io/v3/b';
const BIN_ID = process.env.JSONBIN_BIN_ID || '6af6e587ac6210605a84a2ea';
const MASTER_KEY = process.env.JSONBIN_MASTER_KEY || '$2a$10$zzgQGr/zrf9XyruU9nvxWeBiZ0HRVCQsR3TnPKnKTkPWH10p63R4u';

function parseDurationMs(duration) {
    if (!duration) return null;
    const s = String(duration).trim().toLowerCase();
    if (!s || s === 'permanent' || s === 'permanen') return null;

    const match = s.match(/^(\d+)\s*(m|h|d)$/);
    if (!match) return null;

    const val = Number(match[1]);
    const unit = match[2];
    if (unit === 'm') return val * 60 * 1000;
    if (unit === 'h') return val * 60 * 60 * 1000;
    if (unit === 'd') return val * 24 * 60 * 60 * 1000;
    return null;
}

async function readBin() {
    const res = await fetch(`${JSONBIN_BASE}/${BIN_ID}/latest`, {
        headers: { 'X-Master-Key': MASTER_KEY },
        cache: 'no-store'
    });
    if (!res.ok) throw new Error('Gagal membaca data JSONBin.');
    const json = await res.json();
    const record = json.record || {};
    return Array.isArray(record.keys) ? record.keys : [];
}

async function writeBin(keys) {
    const res = await fetch(`${JSONBIN_BASE}/${BIN_ID}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': MASTER_KEY
        },
        body: JSON.stringify({ keys })
    });
    if (!res.ok) throw new Error('Gagal menyimpan data JSONBin.');
}

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ valid: false, message: 'Method not allowed' });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const action = body.action || 'login';
        const inputKey = String(body.key || '').trim();
        const device = String(body.device || '').trim().slice(0, 80);
        const deviceId = String(body.deviceId || 'default').trim().slice(0, 64);

        if (!inputKey) {
            return res.status(400).json({ valid: false, message: 'Masukkan Key terlebih dahulu.' });
        }

        const keys = await readBin();
        const idx = keys.findIndex(item =>
            item &&
            typeof item.key === 'string' &&
            item.key.trim().toLowerCase() === inputKey.toLowerCase()
        );

        if (idx === -1) {
            return res.status(200).json({ valid: false, message: 'Key tidak valid atau tidak terdaftar.' });
        }

        const item = keys[idx];
        const now = Date.now();
        if (!Array.isArray(item.sessions)) {
            item.sessions = [];
        }

        if (action === 'logout') {
            const sIdx = item.sessions.findIndex(s => s && s.deviceId === deviceId);
            if (sIdx !== -1) {
                item.sessions[sIdx].lastSeen = 0;
            }
            const stillAnyOnline = item.sessions.some(s => s && s.lastSeen && (now - s.lastSeen < 35000));
            if (!stillAnyOnline) {
                item.lastSeen = 0;
            }
            keys[idx] = item;
            await writeBin(keys);
            return res.status(200).json({ ok: true });
        }

        if (item.active === false) {
            return res.status(200).json({ valid: false, message: 'Key dinonaktifkan oleh admin.' });
        }

        const durationMs = parseDurationMs(item.duration);

        if (durationMs !== null) {
            if (!item.startedAt) {
                item.startedAt = now;
                item.expiresAt = now + durationMs;
            }

            if (now >= item.expiresAt) {
                item.active = false;
                item.lastSeen = 0;
                item.sessions = item.sessions.map(s => ({ ...s, lastSeen: 0 }));
                keys[idx] = item;
                await writeBin(keys);
                return res.status(200).json({
                    valid: false,
                    message: 'Waktu Key sudah habis dan tidak dapat digunakan lagi.'
                });
            }
        }

        const existingSessionIdx = item.sessions.findIndex(s => s && s.deviceId === deviceId);
        if (existingSessionIdx !== -1) {
            item.sessions[existingSessionIdx].lastSeen = now;
            if (device) item.sessions[existingSessionIdx].device = device;
        } else {
            item.sessions.unshift({
                deviceId,
                device: device || 'Perangkat Tidak Dikenal',
                firstSeen: now,
                lastSeen: now
            });
            if (item.sessions.length > 10) {
                item.sessions = item.sessions.slice(0, 10);
            }
        }

        item.lastSeen = now;
        if (device) item.device = device;
        keys[idx] = item;
        await writeBin(keys);

        return res.status(200).json({
            valid: true,
            name: item.name || 'Member',
            isPermanent: durationMs === null,
            expiresAt: item.expiresAt || null
        });
    } catch (err) {
        return res.status(500).json({ valid: false, message: err.message || 'Server error.' });
    }
};
