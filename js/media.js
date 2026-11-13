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
