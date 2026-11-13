(function () {
    const GITHUB_KEYS_URL = './keys.json';
    const STORAGE_SESSION = 'app_access_key_v2';
    const STORAGE_TIMERS = 'app_key_timers_v2';
    const STORAGE_BURNED = 'app_burned_keys_v2';

    const loginScreen = document.getElementById('loginScreen');
    const loginForm = document.getElementById('loginForm');
    const keyInput = document.getElementById('keyInput');
    const loginBtn = document.getElementById('loginBtn');
    const loginStatus = document.getElementById('loginStatus');
    const appMount = document.getElementById('appMount');
    const appTemplate = document.getElementById('appTemplate');

    let expiryWatchInterval = null;
    let remoteCheckInterval = null;

    window.AppCleanups = [];

    function readJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    function writeJSON(key, val) {
        try {
            localStorage.setItem(key, JSON.stringify(val));
        } catch {}
    }

    async function sha256(text) {
        if (!window.crypto || !crypto.subtle) return text;
        const data = new TextEncoder().encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

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

    function isDateExpired(expiresStr) {
        if (!expiresStr) return false;
        const today = new Date().toISOString().slice(0, 10);
        return today > String(expiresStr).trim();
    }

    function formatRemaining(ms) {
        if (ms <= 0) return '00:00';
        const totalSec = Math.ceil(ms / 1000);
        const hrs = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;

        if (hrs > 0) {
            return (
                String(hrs).padStart(2, '0') + ':' +
                String(mins).padStart(2, '0') + ':' +
                String(secs).padStart(2, '0')
            );
        }
        return (
            String(mins).padStart(2, '0') + ':' +
            String(secs).padStart(2, '0')
        );
    }

    function burnKey(keyId) {
        const burned = readJSON(STORAGE_BURNED, {});
        burned[keyId] = Date.now();
        writeJSON(STORAGE_BURNED, burned);
    }

    function isKeyBurned(keyId) {
        const burned = readJSON(STORAGE_BURNED, {});
        return Boolean(burned[keyId]);
    }

    async function validateKeyFromGitHub(rawKey) {
        const input = String(rawKey || '').trim();
        if (!input) {
            return { valid: false, message: 'Masukkan Key terlebih dahulu.' };
        }

        const response = await fetch(GITHUB_KEYS_URL + '?t=' + Date.now(), {
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error('Gagal mengambil daftar Key dari GitHub.');
        }

        const data = await response.json();
        const list = Array.isArray(data.keys) ? data.keys : [];
        const inputHash = await sha256(input);

        for (const item of list) {
            if (!item || typeof item !== 'object') continue;

            const matchPlain = typeof item.key === 'string' && item.key === input;
            const matchHash = typeof item.hash === 'string' && item.hash.toLowerCase() === inputHash;

            if (matchPlain || matchHash) {
                const durationMs = parseDurationMs(item.duration);
                const keyId = (item.hash || inputHash) + ':' + (item.duration || 'permanent');

                if (item.active === false) {
                    return { valid: false, message: 'Key ini sedang dinonaktifkan.' };
                }

                if (isDateExpired(item.expires)) {
                    return { valid: false, message: 'Key sudah kedaluwarsa.' };
                }

                if (durationMs !== null) {
                    if (isKeyBurned(keyId)) {
                        return {
                            valid: false,
                            message: 'Key ini sudah habis masa berlakunya dan tidak dapat digunakan lagi. Buat Key baru di GitHub.'
                        };
                    }

                    const timers = readJSON(STORAGE_TIMERS, {});
                    const now = Date.now();
                    let record = timers[keyId];

                    if (!record) {
                        record = {
                            startedAt: now,
                            expiresAt: now + durationMs
                        };
                        timers[keyId] = record;
                        writeJSON(STORAGE_TIMERS, timers);
                    }

                    if (now >= record.expiresAt) {
                        burnKey(keyId);
                        return {
                            valid: false,
                            message: 'Waktu Key sudah habis dan tidak dapat digunakan lagi. Buat Key baru di GitHub.'
                        };
                    }

                    return {
                        valid: true,
                        keyId: keyId,
                        expiresAt: record.expiresAt,
                        isPermanent: false
                    };
                }

                return {
                    valid: true,
                    keyId: keyId,
                    expiresAt: null,
                    isPermanent: true
                };
            }
        }

        return { valid: false, message: 'Key tidak valid atau tidak terdaftar.' };
    }

    function cleanupApp() {
        if (expiryWatchInterval) {
            clearInterval(expiryWatchInterval);
            expiryWatchInterval = null;
        }
        if (remoteCheckInterval) {
            clearInterval(remoteCheckInterval);
            remoteCheckInterval = null;
        }

        if (Array.isArray(window.AppCleanups)) {
            window.AppCleanups.forEach(fn => {
                try { fn(); } catch {}
            });
            window.AppCleanups = [];
        }

        document.querySelectorAll('script[data-app-module="1"]').forEach(el => el.remove());
        appMount.innerHTML = '';
    }

    /* LANGSUNG TERPENTAL KE HALAMAN LOGIN TANPA REFRESH */
    function kickToLogin(reasonMessage, shouldBurnKeyId) {
        if (shouldBurnKeyId) {
            burnKey(shouldBurnKeyId);
        }

        localStorage.removeItem(STORAGE_SESSION);
        cleanupApp();

        keyInput.value = '';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Masuk';
        loginStatus.style.color = '#fe2c55';
        loginStatus.textContent = reasonMessage || 'Sesi berakhir. Silakan masuk dengan Key baru.';
        loginScreen.style.display = 'flex';
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src + '?v=' + Date.now();
            s.dataset.appModule = '1';
            s.onload = resolve;
            s.onerror = () => reject(new Error('Gagal memuat ' + src));
            document.body.appendChild(s);
        });
    }

    async function unlockApp(rawKey, authInfo) {
        cleanupApp();

        loginScreen.style.display = 'none';
        appMount.appendChild(appTemplate.content.cloneNode(true));

        const infoEl = document.getElementById('keyRemainingInfo');
        const logoutBtn = document.getElementById('logoutBtn');

        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                kickToLogin('Anda telah keluar. Masukkan Key untuk masuk kembali.', null);
            });
        }

        function updateTimerDisplay() {
            if (!infoEl) return;

            if (authInfo.isPermanent) {
                infoEl.textContent = '♾ Key Permanen (Aktif)';
                infoEl.style.color = '#00a870';
                return;
            }

            const remaining = authInfo.expiresAt - Date.now();
            if (remaining <= 0) {
                kickToLogin(
                    'Waktu Key sudah habis! Key hangus, silakan buat Key baru di GitHub.',
                    authInfo.keyId
                );
                return;
            }

            infoEl.textContent = '⏳ Sisa waktu: ' + formatRemaining(remaining);
            infoEl.style.color = remaining <= 15000 ? '#fe2c55' : '#555';
        }

        updateTimerDisplay();

        /* Pantau tiap 1 detik: jika waktu habis, langsung terpental tanpa refresh */
        expiryWatchInterval = setInterval(updateTimerDisplay, 1000);

        /* Cek status keys.json di GitHub setiap 20 detik */
        remoteCheckInterval = setInterval(async () => {
            try {
                const check = await validateKeyFromGitHub(rawKey);
                if (!check.valid) {
                    kickToLogin(check.message, null);
                }
            } catch {
                // Abaikan jika koneksi internet sempat putus sesaat
            }
        }, 20000);

        await loadScript('js/gift-banner.js');
        await loadScript('js/media.js');
        await loadScript('js/tiktok.js');
        await loadScript('js/payment.js');
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const inputKey = keyInput.value.trim();

        loginBtn.disabled = true;
        loginBtn.textContent = 'Memeriksa Key...';
        loginStatus.style.color = '#fe2c55';
        loginStatus.textContent = '';

        try {
            const res = await validateKeyFromGitHub(inputKey);
            if (!res.valid) {
                loginStatus.textContent = res.message;
                return;
            }

            localStorage.setItem(STORAGE_SESSION, inputKey);
            await unlockApp(inputKey, res);
        } catch (err) {
            loginStatus.textContent = err.message || 'Terjadi kesalahan koneksi.';
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Masuk';
        }
    });

    (async function checkSavedSession() {
        const savedKey = localStorage.getItem(STORAGE_SESSION);
        if (!savedKey) return;

        loginStatus.style.color = '#666';
        loginStatus.textContent = 'Memverifikasi sesi tersimpan...';
        loginBtn.disabled = true;

        try {
            const res = await validateKeyFromGitHub(savedKey);
            if (res.valid) {
                await unlockApp(savedKey, res);
            } else {
                localStorage.removeItem(STORAGE_SESSION);
                loginStatus.style.color = '#fe2c55';
                loginStatus.textContent = res.message;
            }
        } catch {
            loginStatus.style.color = '#fe2c55';
            loginStatus.textContent = 'Gagal memverifikasi sesi. Silakan login ulang.';
        } finally {
            loginBtn.disabled = false;
        }
    })();
})();
