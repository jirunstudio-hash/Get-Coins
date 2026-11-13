(function () {
    const mainVideo = document.getElementById('mainVideo');
    const videoFileInput = document.getElementById('videoFileInput');
    const videoMenuBtn = document.getElementById('videoMenuBtn');
    const videoMenuContent = document.getElementById('videoMenuContent');
    const videoPlaceholder = document.getElementById('videoPlaceholder');

    const startCameraBtn = document.getElementById('startCameraBtn');
    const switchCameraBtn = document.getElementById('switchCameraBtn');
    const stopCameraBtn = document.getElementById('stopCameraBtn');
    const cameraPermissionModal = document.getElementById('cameraPermissionModal');
    const cancelCamPermBtn = document.getElementById('cancelCamPermBtn');
    const allowCamPermBtn = document.getElementById('allowCamPermBtn');

    let currentVideoURL = null;
    let currentCameraStream = null;
    let currentFacingMode = 'user';

    const VIDEO_DB_NAME = 'TikTokCoinsVideoDB';
    const VIDEO_STORE_NAME = 'videos';
    const VIDEO_KEY = 'embeddedVideo';

    function openVideoDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB tidak didukung browser ini.'));
                return;
            }

            const req = indexedDB.open(VIDEO_DB_NAME, 1);

            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(VIDEO_STORE_NAME)) {
                    db.createObjectStore(VIDEO_STORE_NAME, { keyPath: 'id' });
                }
            };

            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(e.target.error);
        });
    }

    async function saveVideoToDB(file) {
        try {
            const db = await openVideoDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(VIDEO_STORE_NAME, 'readwrite');
                const store = tx.objectStore(VIDEO_STORE_NAME);
                store.put({
                    id: VIDEO_KEY,
                    blob: file,
                    name: file.name || 'video.mp4',
                    type: file.type || 'video/mp4',
                    savedAt: Date.now()
                });
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = e => { db.close(); reject(e.target.error); };
            });
        } catch (err) {
            console.warn('Gagal menyimpan video:', err);
        }
    }

    async function loadVideoFromDB() {
        try {
            const db = await openVideoDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(VIDEO_STORE_NAME, 'readonly');
                const store = tx.objectStore(VIDEO_STORE_NAME);
                const req = store.get(VIDEO_KEY);
                req.onsuccess = e => { db.close(); resolve(e.target.result || null); };
                req.onerror = e => { db.close(); reject(e.target.error); };
            });
        } catch (err) {
            console.warn('Gagal memuat video:', err);
            return null;
        }
    }

    async function deleteVideoFromDB() {
        try {
            const db = await openVideoDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(VIDEO_STORE_NAME, 'readwrite');
                const store = tx.objectStore(VIDEO_STORE_NAME);
                store.delete(VIDEO_KEY);
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = e => { db.close(); reject(e.target.error); };
            });
        } catch (err) {
            console.warn('Gagal menghapus video:', err);
        }
    }

    function updateCameraMenuUI(isCameraActive) {
        startCameraBtn.style.display = isCameraActive ? 'none' : 'block';
        switchCameraBtn.style.display = isCameraActive ? 'block' : 'none';
        stopCameraBtn.style.display = isCameraActive ? 'block' : 'none';
    }

    function stopCameraStreamOnly() {
        if (currentCameraStream) {
            currentCameraStream.getTracks().forEach(track => track.stop());
            currentCameraStream = null;
        }
        mainVideo.srcObject = null;
        mainVideo.classList.remove('mirror');
        updateCameraMenuUI(false);
    }

    function applyVideoBlob(blob) {
        if (!blob) return;

        stopCameraStreamOnly();

        if (currentVideoURL) {
            URL.revokeObjectURL(currentVideoURL);
        }

        currentVideoURL = URL.createObjectURL(blob);
        mainVideo.srcObject = null;
        mainVideo.src = currentVideoURL;
        mainVideo.muted = true;
        mainVideo.loop = true;
        mainVideo.classList.remove('mirror');
        mainVideo.load();
        mainVideo.play().catch(() => {});

        videoPlaceholder.style.display = 'none';
    }

    async function startRealtimeCamera(facingMode) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Akses kamera membutuhkan koneksi HTTPS atau localhost di browser yang mendukung.');
            return;
        }

        stopCameraStreamOnly();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: facingMode },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });

            currentCameraStream = stream;
            currentFacingMode = facingMode;

            mainVideo.pause();
            mainVideo.removeAttribute('src');
            mainVideo.srcObject = stream;
            mainVideo.muted = true;
            mainVideo.loop = false;

            if (facingMode === 'user') {
                mainVideo.classList.add('mirror');
            } else {
                mainVideo.classList.remove('mirror');
            }

            await mainVideo.play().catch(() => {});
            videoPlaceholder.style.display = 'none';
            updateCameraMenuUI(true);

        } catch (err) {
            stopCameraStreamOnly();

            if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
                alert('Izin kamera ditolak. Silakan izinkan akses kamera di pengaturan browser.');
            } else if (err && (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')) {
                alert('Kamera tidak ditemukan pada perangkat ini.');
            } else if (err && err.name === 'NotReadableError') {
                alert('Kamera sedang digunakan aplikasi lain atau tidak dapat diakses.');
            } else {
                alert('Gagal mengakses kamera: ' + (err && err.message ? err.message : 'Error tidak diketahui.'));
            }
        }
    }

    (async function restoreEmbeddedVideo() {
        const saved = await loadVideoFromDB();
        if (saved && saved.blob) {
            applyVideoBlob(saved.blob);
        }
    })();

    videoMenuBtn.addEventListener('click', () => {
        videoMenuContent.classList.toggle('show');
    });

    document.getElementById('chooseVideoBtn').addEventListener('click', () => {
        videoMenuContent.classList.remove('show');
        videoFileInput.click();
    });

    startCameraBtn.addEventListener('click', () => {
        videoMenuContent.classList.remove('show');
        cameraPermissionModal.classList.add('show');
    });

    cancelCamPermBtn.addEventListener('click', () => {
        cameraPermissionModal.classList.remove('show');
    });

    allowCamPermBtn.addEventListener('click', async () => {
        cameraPermissionModal.classList.remove('show');
        await startRealtimeCamera(currentFacingMode);
    });

    switchCameraBtn.addEventListener('click', async () => {
        videoMenuContent.classList.remove('show');
        const nextFacing = currentFacingMode === 'user' ? 'environment' : 'user';
        await startRealtimeCamera(nextFacing);
    });

    stopCameraBtn.addEventListener('click', async () => {
        videoMenuContent.classList.remove('show');
        stopCameraStreamOnly();

        const saved = await loadVideoFromDB();
        if (saved && saved.blob) {
            applyVideoBlob(saved.blob);
        } else {
            mainVideo.pause();
            mainVideo.removeAttribute('src');
            mainVideo.load();
            videoPlaceholder.style.display = 'block';
        }
    });

    videoFileInput.addEventListener('change', async function () {
        const file = this.files[0];
        if (!file) return;

        if (!file.type.startsWith('video/')) {
            alert('Pilih file video yang valid.');
            return;
        }

        applyVideoBlob(file);
        await saveVideoToDB(file);
    });

    document.getElementById('removeVideoBtn').addEventListener('click', async () => {
        stopCameraStreamOnly();

        mainVideo.pause();
        mainVideo.removeAttribute('src');
        mainVideo.load();

        if (currentVideoURL) {
            URL.revokeObjectURL(currentVideoURL);
            currentVideoURL = null;
        }

        videoPlaceholder.style.display = 'block';
        videoFileInput.value = '';
        videoMenuContent.classList.remove('show');

        await deleteVideoFromDB();
    });

    cameraPermissionModal.addEventListener('click', e => {
        if (e.target === cameraPermissionModal) {
            cameraPermissionModal.classList.remove('show');
        }
    });

    function handleOutsideDocClick(e) {
        if (!e.target.closest('.video-menu')) {
            videoMenuContent.classList.remove('show');
        }
    }

    document.addEventListener('click', handleOutsideDocClick);

    if (Array.isArray(window.AppCleanups)) {
        window.AppCleanups.push(() => {
            stopCameraStreamOnly();
            if (currentVideoURL) {
                URL.revokeObjectURL(currentVideoURL);
                currentVideoURL = null;
            }
            document.removeEventListener('click', handleOutsideDocClick);
        });
    }
})();
