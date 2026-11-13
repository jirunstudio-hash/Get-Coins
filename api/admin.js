const JSONBIN_BASE = 'https://api.jsonbin.io/v3/b';
const BIN_ID = process.env.JSONBIN_BIN_ID || '6af6e587ac6210605a84a2ea';
const MASTER_KEY = process.env.JSONBIN_MASTER_KEY || '$2a$10$zzgQGr/zrf9XyruU9nvxWeBiZ0HRVCQsR3TnPKnKTkPWH10p63R4u';
const EXPECTED_ADMIN_KEY = process.env.ADMIN_KEY || 'JirunSnd27-';

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
        return res.status(405).json({ ok: false, message: 'Method not allowed' });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const adminKey = String(body.adminKey || '').trim();
        const action = body.action || 'list';

        if (adminKey !== EXPECTED_ADMIN_KEY) {
            return res.status(401).json({ ok: false, message: 'Key Admin salah!' });
        }

        let keys = await readBin();
        const now = Date.now();

        if (action === 'create') {
            const name = String(body.name || 'Member').trim();
            const key = String(body.key || '').trim();
            const duration = String(body.duration || '1h').trim();

            if (!key) {
                return res.status(400).json({ ok: false, message: 'Kode Key wajib diisi.' });
            }

            if (keys.some(k => k && String(k.key).trim().toLowerCase() === key.toLowerCase())) {
                return res.status(400).json({ ok: false, message: 'Kode Key sudah ada, gunakan kode lain.' });
            }

            keys.unshift({
                id: 'k_' + now + '_' + Math.random().toString(36).slice(2, 7),
                name,
                key,
                duration,
                device: '-',
                sessions: [],
                active: true,
                createdAt: now,
                startedAt: null,
                expiresAt: null,
                lastSeen: 0
            });

            await writeBin(keys);
        } else if (action === 'toggle') {
            const id = body.id;
            const item = keys.find(k => k && k.id === id);
            if (item) {
                if (item.expiresAt && now >= item.expiresAt) {
                    return res.status(400).json({
                        ok: false,
                        message: 'Key yang sudah habis waktunya tidak bisa diaktifkan lagi. Buat Key baru.'
                    });
                }
                item.active = !item.active;
                if (!item.active) {
                    item.lastSeen = 0;
                    if (Array.isArray(item.sessions)) {
                        item.sessions = item.sessions.map(s => ({ ...s, lastSeen: 0 }));
                    }
                }
                await writeBin(keys);
            }
        } else if (action === 'delete') {
            const id = body.id;
            keys = keys.filter(k => k && k.id !== id);
            await writeBin(keys);
        }

        const formatted = keys.map(item => {
            const isExpired = Boolean(item.expiresAt && now >= item.expiresAt);

            let rawSessions = Array.isArray(item.sessions) ? item.sessions : [];
            if (rawSessions.length === 0 && item.device && item.device !== '-') {
                rawSessions = [{
                    deviceId: 'legacy',
                    device: item.device,
                    lastSeen: item.lastSeen || 0
                }];
            }

            const sessions = rawSessions
                .map(s => ({
                    deviceId: s.deviceId,
                    device: s.device || 'Perangkat Tidak Dikenal',
                    isOnline: Boolean(!isExpired && item.active && s.lastSeen && (now - s.lastSeen < 35000)),
                    lastSeen: s.lastSeen || 0
                }))
                .sort((a, b) => {
                    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
                    return b.lastSeen - a.lastSeen;
                });

            const onlineCount = sessions.filter(s => s.isOnline).length;
            const isOnline = onlineCount > 0;

            return {
                id: item.id,
                name: item.name,
                key: item.key,
                duration: item.duration || 'permanent',
                device: item.device || '-',
                sessions,
                onlineCount,
                active: Boolean(item.active) && !isExpired,
                isExpired,
                isOnline,
                startedAt: item.startedAt || null,
                expiresAt: item.expiresAt || null
            };
        });

        return res.status(200).json({ ok: true, keys: formatted });
    } catch (err) {
        return res.status(500).json({ ok: false, message: err.message || 'Server error.' });
    }
};
