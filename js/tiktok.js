(function () {
    const usernameInput = document.getElementById('usernameInput');
    const accountStatus = document.getElementById('accountStatus');
    const profileCard = document.getElementById('profileCard');
    const loadingSlot = document.getElementById('loadingSlot');

    const DEFAULT_AVATAR_SVG =
        'data:image/svg+xml;utf8,' +
        encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">' +
            '<rect width="80" height="80" rx="40" fill="#e6e6e6"/>' +
            '<circle cx="40" cy="31" r="14" fill="#b8b8b8"/>' +
            '<path d="M16 70c4-14 14-20 24-20s20 6 24 20" fill="#b8b8b8"/>' +
            '</svg>'
        );

    let detectedAccount = null;
    let detectTimer = null;
    let requestNumber = 0;

    function setLoading(active) {
        loadingSlot.classList.toggle('loading', active);
    }

    function clearProfile() {
        detectedAccount = null;

        profileCard.classList.remove('show');

        const avatarEl = document.getElementById('profileAvatar');
        avatarEl.onerror = null;
        avatarEl.removeAttribute('src');

        document.getElementById('profileName').textContent = '-';
        document.getElementById('profileUsername').textContent = '-';
        document.getElementById('profileFollowers').textContent = '0';
        document.getElementById('profileVerified').style.display = 'none';
    }

    function normalizeUsername(value) {
        let username = String(value || '').trim();

        username = username.replace(
            /^https?:\/\/(?:www\.|m\.)?tiktok\.com\//i,
            ''
        );

        username = username.replace(/^@/, '');
        username = username.split(/[/?#]/)[0];

        return username.trim();
    }

    function shortNumber(value) {
        const n = Number(value);

        if (!Number.isFinite(n) || n < 0) return '0';

        if (n >= 1000000) {
            return (n / 1000000).toFixed(1) + 'M';
        }

        if (n >= 1000) {
            return (n / 1000).toFixed(1) + 'K';
        }

        return n.toLocaleString('id-ID');
    }

    function readVerified(user, info, root) {
        const values = [
            user.verified,
            user.is_verified,
            user.isVerified,
            info.verified,
            info.is_verified,
            info.isVerified,
            root.verified,
            root.is_verified
        ];

        for (const value of values) {
            if (value === true || value === 1 || value === 'true' || value === '1') {
                return true;
            }
            if (value === false || value === 0 || value === 'false' || value === '0') {
                return false;
            }
        }

        if (Number(user.verification_type) === 1 || Number(user.verificationType) === 1) {
            return true;
        }

        return false;
    }

    function readFollowers(stats, user, info, root) {
        const candidates = [
            stats.followerCount,
            stats.follower_count,
            stats.followers,
            stats.fans,
            stats.follower,
            user.followerCount,
            user.follower_count,
            user.followers,
            user.fans,
            info.followerCount,
            info.follower_count,
            root.followerCount,
            root.follower_count
        ];

        for (const value of candidates) {
            if (value !== undefined && value !== null && value !== '') {
                const number = Number(value);
                if (Number.isFinite(number) && number >= 0) {
                    return number;
                }
            }
        }

        return null;
    }

    function collectAvatars(...sources) {
        const urls = [];
        const keys = [
            'avatarMedium', 'avatar_medium',
            'avatarLarger', 'avatar_larger',
            'avatarThumb', 'avatar_thumb',
            'avatar', 'avatar_url', 'avatarUrl'
        ];

        for (const src of sources) {
            if (!src || typeof src !== 'object') continue;

            for (const k of keys) {
                const val = src[k];
                if (typeof val === 'string' && val.startsWith('http') && !urls.includes(val)) {
                    urls.push(val);
                } else if (val && Array.isArray(val.url_list)) {
                    for (const u of val.url_list) {
                        if (typeof u === 'string' && u.startsWith('http') && !urls.includes(u)) {
                            urls.push(u);
                        }
                    }
                }
            }

            const nestedUrlLists = [src.avatar_300x300, src.avatar_168x168, src.avatar_larger];
            for (const nested of nestedUrlLists) {
                if (nested && Array.isArray(nested.url_list)) {
                    for (const u of nested.url_list) {
                        if (typeof u === 'string' && u.startsWith('http') && !urls.includes(u)) {
                            urls.push(u);
                        }
                    }
                }
            }
        }

        return urls;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function extractProfileFromInfoPayload(result, requestedUsername) {
        if (!result || typeof result !== 'object') return null;

        if (result.code !== undefined && Number(result.code) !== 0) {
            return null;
        }

        const root = result.data || result;
        const info = root.userInfo || root.user_info || root.userinfo || root;
        const user = info.user || root.user || info;
        const stats = info.stats || root.stats || user.stats || info.statsV2 || root.statsV2 || {};

        const returnedUsername =
            user.uniqueId ||
            user.unique_id ||
            user.username ||
            user.uniqueID ||
            '';

        if (!returnedUsername) return null;

        const cleanReturned = String(returnedUsername).replace(/^@/, '').trim();
        if (cleanReturned.toLowerCase() !== requestedUsername.toLowerCase()) {
            return null;
        }

        const nickname =
            user.nickname ||
            user.display_name ||
            user.displayName ||
            info.nickname ||
            cleanReturned;

        const avatars = collectAvatars(user, info, root);
        const followers = readFollowers(stats, user, info, root);
        const verified = readVerified(user, info, root);

        return {
            username: cleanReturned,
            nickname: nickname,
            avatars: avatars,
            followers: followers !== null ? followers : 0,
            verified: verified
        };
    }

    async function fetchTikwmUserInfo(username, isCancelled) {
        for (let attempt = 0; attempt < 2; attempt++) {
            if (isCancelled()) return null;

            const response = await fetch('https://www.tikwm.com/api/user/info/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                body: 'unique_id=' + encodeURIComponent(username)
            });

            if (!response.ok) {
                if (response.status === 429 && attempt === 0) {
                    await sleep(1150);
                    continue;
                }
                return { errorMsg: 'Layanan pencarian sedang bermasalah.' };
            }

            const result = await response.json();

            if (
                result &&
                Number(result.code) !== 0 &&
                /limit|second|frequent|busy/i.test(String(result.msg || result.message || '')) &&
                attempt === 0
            ) {
                await sleep(1150);
                continue;
            }

            const profile = extractProfileFromInfoPayload(result, username);
            if (profile) {
                return { profile };
            }

            return {
                errorMsg: (result && (result.msg || result.message)) || 'Akun tidak ditemukan.'
            };
        }

        return null;
    }

    async function fetchTikwmUserSearch(username, isCancelled) {
        for (let attempt = 0; attempt < 2; attempt++) {
            if (isCancelled()) return null;

            const response = await fetch('https://www.tikwm.com/api/user/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                body: 'keywords=' + encodeURIComponent(username) + '&count=10&cursor=0'
            });

            if (!response.ok) return null;

            const result = await response.json();

            if (
                result &&
                Number(result.code) !== 0 &&
                /limit|second|frequent|busy/i.test(String(result.msg || result.message || '')) &&
                attempt === 0
            ) {
                await sleep(1150);
                continue;
            }

            if (!result || Number(result.code) !== 0 || !result.data) return null;

            const list =
                result.data.user_list ||
                result.data.users ||
                (Array.isArray(result.data) ? result.data : []);

            if (!Array.isArray(list) || list.length === 0) return null;

            const reqLower = username.toLowerCase();

            for (const entry of list) {
                const u = entry.user || entry.user_info || entry;
                const s = entry.stats || u.stats || entry;
                const uid = String(u.uniqueId || u.unique_id || u.username || '').replace(/^@/, '').trim();

                if (uid.toLowerCase() === reqLower) {
                    const followers = readFollowers(s, u, entry, result);
                    return {
                        username: uid,
                        nickname: u.nickname || u.display_name || uid,
                        avatars: collectAvatars(u, entry),
                        followers: followers !== null ? followers : 0,
                        verified: readVerified(u, entry, result)
                    };
                }
            }

            return null;
        }

        return null;
    }

    async function fetchTikwmUserPosts(username, isCancelled) {
        if (isCancelled()) return null;

        const response = await fetch('https://www.tikwm.com/api/user/posts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            body: 'unique_id=' + encodeURIComponent(username) + '&count=1'
        });

        if (!response.ok) return null;

        const result = await response.json();
        if (!result || Number(result.code) !== 0 || !result.data) return null;

        const videos = result.data.videos || result.data;
        if (!Array.isArray(videos) || videos.length === 0) return null;

        const author = videos[0].author || {};
        const uid = String(author.unique_id || author.uniqueId || '').replace(/^@/, '').trim();
        if (!uid || uid.toLowerCase() !== username.toLowerCase()) return null;

        return {
            username: uid,
            nickname: author.nickname || uid,
            avatars: collectAvatars(author),
            followers: 0,
            verified: readVerified(author, videos[0], result)
        };
    }

    async function lookupTikTok(username, isCancelled) {
        let lastError = 'Profil tidak ditemukan.';

        const infoRes = await fetchTikwmUserInfo(username, isCancelled);
        if (isCancelled()) return null;

        if (infoRes && infoRes.profile) {
            return infoRes.profile;
        }
        if (infoRes && infoRes.errorMsg) {
            lastError = infoRes.errorMsg;
        }

        await sleep(1100);
        if (isCancelled()) return null;

        const searchProfile = await fetchTikwmUserSearch(username, isCancelled);
        if (isCancelled()) return null;

        if (searchProfile) {
            return searchProfile;
        }

        await sleep(1100);
        if (isCancelled()) return null;

        const postsProfile = await fetchTikwmUserPosts(username, isCancelled);
        if (isCancelled()) return null;

        if (postsProfile) {
            return postsProfile;
        }

        throw new Error(lastError);
    }

    function displayProfile(data) {
        detectedAccount = data;

        document.getElementById('profileName').textContent =
            data.nickname || data.username;

        document.getElementById('profileUsername').textContent =
            '@' + data.username;

        document.getElementById('profileFollowers').textContent =
            shortNumber(data.followers);

        const avatar = document.getElementById('profileAvatar');
        const candidates = Array.isArray(data.avatars) ? data.avatars.slice() : [];
        let idx = 0;

        avatar.onerror = function () {
            idx++;
            if (idx < candidates.length) {
                this.src = candidates[idx];
            } else {
                this.onerror = null;
                this.src = DEFAULT_AVATAR_SVG;
            }
        };

        if (candidates.length > 0) {
            avatar.src = candidates[0];
        } else {
            avatar.onerror = null;
            avatar.src = DEFAULT_AVATAR_SVG;
        }

        const verifiedIcon = document.getElementById('profileVerified');
        verifiedIcon.style.display = data.verified ? 'inline-flex' : 'none';

        profileCard.classList.add('show');
        accountStatus.style.display = 'none';
    }

    async function detectAccount() {
        const username = normalizeUsername(usernameInput.value);
        const id = ++requestNumber;
        const isCancelled = () => id !== requestNumber;

        if (!username) {
            clearProfile();
            accountStatus.style.display = 'none';
            setLoading(false);
            return;
        }

        if (!/^[A-Za-z0-9._]+$/.test(username)) {
            clearProfile();
            accountStatus.textContent = 'Format username tidak valid.';
            accountStatus.style.display = 'block';
            setLoading(false);
            return;
        }

        setLoading(true);
        clearProfile();

        accountStatus.textContent = 'Mencari profil akun...';
        accountStatus.style.display = 'block';

        try {
            const data = await lookupTikTok(username, isCancelled);

            if (isCancelled() || !data) return;

            displayProfile(data);

        } catch (error) {
            if (isCancelled()) return;

            clearProfile();
            accountStatus.textContent = error.message || 'Profil tidak ditemukan.';
            accountStatus.style.display = 'block';

        } finally {
            if (!isCancelled()) {
                setLoading(false);
            }
        }
    }

    usernameInput.addEventListener('input', () => {
        clearTimeout(detectTimer);
        requestNumber++;

        clearProfile();
        setLoading(false);

        const username = normalizeUsername(usernameInput.value);

        if (!username) {
            accountStatus.style.display = 'none';
            return;
        }

        accountStatus.textContent = 'Menunggu pencarian...';
        accountStatus.style.display = 'block';

        detectTimer = setTimeout(detectAccount, 700);
    });

    usernameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            clearTimeout(detectTimer);
            detectAccount();
        }
    });

    window.AppTikTok = {
        getDetectedAccount: () => detectedAccount,
        focusInput: () => usernameInput.focus(),
        resetAccount: () => {
            usernameInput.value = '';
            requestNumber++;
            clearTimeout(detectTimer);
            setLoading(false);
            clearProfile();
            accountStatus.style.display = 'none';
        }
    };
})();
