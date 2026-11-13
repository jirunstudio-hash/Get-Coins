(function () {
    // Jika file HTML dihosting di GitHub Pages bersama keys.json, pakai './keys.json'.
    // Jika ingin mengambil langsung dari raw GitHub, ganti ke:
    // 'https://raw.githubusercontent.com/USERNAME/NAMA-REPO/main/keys.json'
    const GITHUB_KEYS_URL = './keys.json';
    const STORAGE_KEY = 'app_access_key_v1';

    const loginScreen = document.getElementById('loginScreen');
    const loginForm = document.getElementById('loginForm');
    const keyInput = document.getElementById('keyInput');
    const loginBtn = document.getElementById('loginBtn');
    const loginStatus = document.getElementById('loginStatus');
    const appMount = document.getElementById('appMount');
    const appTemplate = document.getElementById('appTemplate');

    async function sha256(text) {
        const data = new TextEncoder().encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    function isExpired(expiresStr) {
        if (!expiresStr) return false;
        const today = new Date().toISOString().slice(0, 10);
        return today > String(expiresStr).trim();
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
        const inputHash = window.crypto && crypto.subtle ? await sha256(input) : '';

        for (const item of list) {
            if (!item || typeof item !== 'object') continue;

            const matchPlain = typeof item.key === 'string' && item.key === input;
            const matchHash = typeof item.hash === 'string' && inputHash && item.hash.toLowerCase() === inputHash;

            if (matchPlain || matchHash) {
                if (item.active === false) {
                    return { valid: false, message: 'Key ini sedang dinonaktifkan.' };
                }
                if (isExpired(item.expires)) {
                    return { valid: false, message: 'Key sudah kedaluwarsa.' };
                }
                return { valid: true };
            }
        }

        return { valid: false, message: 'Key tidak valid atau tidak terdaftar.' };
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error('Gagal memuat ' + src));
            document.body.appendChild(s);
        });
    }

    async function unlockApp() {
        loginScreen.style.display = 'none';
        appMount.innerHTML = '';
        appMount.appendChild(appTemplate.content.cloneNode(true));

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem(STORAGE_KEY);
                window.location.reload();
            });
        }

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
        loginStatus.textContent = '';

        try {
            const res = await validateKeyFromGitHub(inputKey);
            if (!res.valid) {
                loginStatus.textContent = res.message;
                return;
            }

            localStorage.setItem(STORAGE_KEY, inputKey);
            await unlockApp();
        } catch (err) {
            loginStatus.textContent = err.message || 'Terjadi kesalahan koneksi.';
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Masuk';
        }
    });

    /* Cek ulang key tersimpan otomatis agar jika key dihapus di GitHub langsung terkunci */
    (async function checkSavedSession() {
        const savedKey = localStorage.getItem(STORAGE_KEY);
        if (!savedKey) return;

        loginStatus.style.color = '#666';
        loginStatus.textContent = 'Memverifikasi sesi tersimpan...';
        loginBtn.disabled = true;

        try {
            const res = await validateKeyFromGitHub(savedKey);
            if (res.valid) {
                await unlockApp();
            } else {
                localStorage.removeItem(STORAGE_KEY);
                loginStatus.style.color = '#fe2c55';
                loginStatus.textContent = res.message;
            }
        } catch (err) {
            loginStatus.style.color = '#fe2c55';
            loginStatus.textContent = 'Gagal memverifikasi sesi. Silakan login ulang.';
        } finally {
            loginBtn.disabled = false;
        }
    })();
})();
