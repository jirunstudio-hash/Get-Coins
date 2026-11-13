(function () {
    const STORAGE_SESSION = 'app_member_key_v3';

    const loginScreen = document.getElementById('loginScreen');
    const loginForm = document.getElementById('loginForm');
    const keyInput = document.getElementById('keyInput');
    const loginBtn = document.getElementById('loginBtn');
    const loginStatus = document.getElementById('loginStatus');
    const appMount = document.getElementById('appMount');
    const appTemplate = document.getElementById('appTemplate');

    let expiryWatchInterval = null;
    let heartbeatInterval = null;
    let activeKeyValue = '';

    window.AppCleanups = [];

    function formatRemaining(ms) {
        if (ms <= 0) return '00:00';
        const totalSec = Math.ceil(ms / 1000);
        const hrs = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;
        if (hrs > 0) {
            return String(hrs).padStart(2, '0') + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
        }
        return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    }

    async function getDeviceName() {
        const ua = navigator.userAgent || '';
        let browser = 'Browser';
        if (/Edg/i.test(ua)) browser = 'Edge';
        else if (/OPR|Opera/i.test(ua)) browser = 'Opera';
        else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox';
        else if (/Chrome|CriOS/i.test(ua)) browser = 'Chrome';
        else if (/Safari/i.test(ua)) browser = 'Safari';

        let os = 'Perangkat Lain';
        let type = 'Perangkat';
        let model = '';

        if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
            try {
                const hints = await navigator.userAgentData.getHighEntropyValues(['model', 'platform']);
                if (hints.model) model = hints.model.trim();
                if (hints.platform) os = hints.platform;
            } catch {}
        }

        if (/iPhone/i.test(ua)) {
            type = 'HP';
            os = 'iPhone (iOS)';
        } else if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
            type = 'Tablet';
            os = 'iPad';
        } else if (/Android/i.test(ua) || os === 'Android') {
            type = 'HP';
            os = 'Android';
            if (!model) {
                const m = ua.match(/Android[^;]*;\s*([^)]+)\)/i);
                if (m && m[1]) {
                    const rawModel = m[1].split('Build/')[0].trim();
                    if (rawModel && rawModel !== 'K') model = rawModel;
                }
            }
        } else if (/Windows/i.test(ua) || os === 'Windows') {
            type = 'Laptop/PC';
            os = 'Windows';
        } else if (/Macintosh|Mac OS/i.test(ua) || os === 'macOS') {
            type = 'Laptop/PC';
            os = 'macOS';
        } else if (/CrOS/i.test(ua) || os === 'Chrome OS') {
            type = 'Laptop/PC';
            os = 'ChromeOS';
        } else if (/Linux/i.test(ua) || os === 'Linux') {
            type = 'Laptop/PC';
            os = 'Linux';
        }

        const detail = model ? `${os} (${model})` : os;
        return `${type} • ${detail} • ${browser}`;
    }

    async function callMemberApi(action, key) {
        const device = action === 'logout' ? '' : await getDeviceName();
        const res = await fetch('/api/member', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, key, device })
        });
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error('Server /api/member tidak ditemukan (HTTP ' + res.status + ').');
        }
        return data;
    }

    function cleanupApp() {
        if (expiryWatchInterval) { clearInterval(expiryWatchInterval); expiryWatchInterval = null; }
        if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }

        if (Array.isArray(window.AppCleanups)) {
            window.AppCleanups.forEach(fn => { try { fn(); } catch {} });
            window.AppCleanups = [];
        }

        document.querySelectorAll('script[data-app-module="1"]').forEach(el => el.remove());
        appMount.innerHTML = '';
    }

    function kickToLogin(reasonMessage) {
        localStorage.removeItem(STORAGE_SESSION);
        activeKeyValue = '';
        cleanupApp();

        keyInput.value = '';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Masuk';
        loginStatus.style.color = '#fe2c55';
        loginStatus.textContent = reasonMessage || 'Sesi berakhir.';
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
        activeKeyValue = rawKey;

        loginScreen.style.display = 'none';
        appMount.appendChild(appTemplate.content.cloneNode(true));

        const infoEl = document.getElementById('keyRemainingInfo');
        const logoutBtn = document.getElementById('logoutBtn');

        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                try { await callMemberApi('logout', activeKeyValue); } catch {}
                kickToLogin('Anda telah keluar.');
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
                callMemberApi('heartbeat', rawKey).catch(() => {});
                kickToLogin('Waktu Key sudah habis! Hubungi admin untuk Key baru.');
                return;
            }

            infoEl.textContent = '⏳ Sisa waktu: ' + formatRemaining(remaining);
            infoEl.style.color = remaining <= 15000 ? '#fe2c55' : '#555';
        }

        updateTimerDisplay();
        expiryWatchInterval = setInterval(updateTimerDisplay, 1000);

        heartbeatInterval = setInterval(async () => {
            try {
                const check = await callMemberApi('heartbeat', rawKey);
                if (!check.valid) {
                    kickToLogin(check.message || 'Key dinonaktifkan atau sudah habis.');
                } else if (check.expiresAt) {
                    authInfo.expiresAt = check.expiresAt;
                }
            } catch {}
        }, 15000);

        await loadScript('js/gift-banner.js');
        await loadScript('js/media.js');
        await loadScript('js/tiktok.js');
        await loadScript('js/payment.js');
    }

    window.addEventListener('beforeunload', () => {
        if (activeKeyValue && navigator.sendBeacon) {
            const blob = new Blob(
                [JSON.stringify({ action: 'logout', key: activeKeyValue })],
                { type: 'application/json' }
            );
            navigator.sendBeacon('/api/member', blob);
        }
    });

    loginForm.addEventListener('submit', async e => {
        e.preventDefault();
        const inputKey = keyInput.value.trim();
        if (!inputKey) return;

        loginBtn.disabled = true;
        loginBtn.textContent = 'Memeriksa Key...';
        loginStatus.style.color = '#fe2c55';
        loginStatus.textContent = '';

        try {
            const res = await callMemberApi('login', inputKey);
            if (!res.valid) {
                loginStatus.textContent = res.message || 'Key tidak valid.';
                return;
            }
            localStorage.setItem(STORAGE_SESSION, inputKey);
            await unlockApp(inputKey, res);
        } catch (err) {
            loginStatus.textContent = err.message || 'Gagal terhubung ke server.';
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Masuk';
        }
    });

    (async function checkSavedSession() {
        const savedKey = localStorage.getItem(STORAGE_SESSION);
        if (!savedKey) return;

        loginStatus.style.color = '#666';
        loginStatus.textContent = 'Memverifikasi sesi...';
        loginBtn.disabled = true;

        try {
            const res = await callMemberApi('login', savedKey);
            if (res.valid) {
                await unlockApp(savedKey, res);
            } else {
                localStorage.removeItem(STORAGE_SESSION);
                loginStatus.style.color = '#fe2c55';
                loginStatus.textContent = res.message || 'Sesi berakhir.';
            }
        } catch (err) {
            loginStatus.style.color = '#fe2c55';
            loginStatus.textContent = err.message || 'Gagal memverifikasi sesi.';
        } finally {
            loginBtn.disabled = false;
        }
    })();
})();
