(function () {
    let selectedCoins = 30;
    let selectedPrice = 0.31;
    let tempCustomDigits = '';
    let tempCustomCoins = 0;
    let tempCustomPrice = 0;

    const coinOptions = document.querySelectorAll('.coin-option');
    const buyButton = document.getElementById('buyButton');

    const customModal = document.getElementById('customModal');
    const orderModal = document.getElementById('orderModal');
    const loaderModal = document.getElementById('loaderModal');
    const successModal = document.getElementById('successModal');
    const paymentOptions = document.querySelectorAll('.payment-option');
    const countdownTimer = document.getElementById('countdownTimer');
    const customInput = document.getElementById('coinAmountInput');

    let countdownInterval = null;

    function formatPrice(price) {
        return '$' + Number(price).toFixed(2);
    }

    function updateBuyButton() {
        buyButton.textContent = 'Buy for ' + formatPrice(selectedPrice);
    }

    coinOptions.forEach(option => {
        option.addEventListener('click', () => {
            if (option.id === 'customBtn') {
                tempCustomDigits = '';
                updateCustom();
                customModal.classList.add('show');
                return;
            }

            coinOptions.forEach(item => item.classList.remove('selected'));
            option.classList.add('selected');

            selectedCoins = Number(option.dataset.coins);
            selectedPrice = Number(option.dataset.price);

            updateBuyButton();
        });
    });

    function updateCustom() {
        tempCustomCoins = Number(tempCustomDigits || 0);
        tempCustomPrice = Number((tempCustomCoins * 0.0104).toFixed(2));

        customInput.value = tempCustomCoins.toLocaleString('id-ID');

        document.getElementById('customUSD').textContent =
            formatPrice(tempCustomPrice);

        document.getElementById('customTotal').textContent =
            formatPrice(tempCustomPrice);
    }

    customInput.addEventListener('input', () => {
        tempCustomDigits = customInput.value.replace(/\D/g, '').slice(0, 9);
        updateCustom();
    });

    document.getElementById('keypad').addEventListener('click', e => {
        if (e.target.tagName !== 'BUTTON') return;

        const value = e.target.textContent.trim();

        if (e.target.dataset.action === 'delete') {
            tempCustomDigits = tempCustomDigits.slice(0, -1);
        } else {
            tempCustomDigits = (tempCustomDigits + value).slice(0, 9);
        }

        updateCustom();
    });

    document.getElementById('customBackBtn').addEventListener('click', () => {
        customModal.classList.remove('show');
    });

    document.getElementById('customContinue').addEventListener('click', () => {
        if (tempCustomCoins <= 0) {
            alert('Masukkan jumlah koin terlebih dahulu.');
            return;
        }

        selectedCoins = tempCustomCoins;
        selectedPrice = tempCustomPrice;

        coinOptions.forEach(item => item.classList.remove('selected'));
        document.getElementById('customBtn').classList.add('selected');

        updateBuyButton();
        customModal.classList.remove('show');

        openOrder();
    });

    paymentOptions.forEach(option => {
        option.addEventListener('click', () => {
            paymentOptions.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });
    });

    function openOrder() {
        if (selectedCoins <= 0) {
            alert('Pilih jumlah koin terlebih dahulu.');
            return;
        }

        const account = window.AppTikTok ? window.AppTikTok.getDetectedAccount() : null;
        if (!account) {
            alert('Masukkan username TikTok dan tunggu deteksi profil selesai.');
            if (window.AppTikTok) window.AppTikTok.focusInput();
            return;
        }

        document.getElementById('orderAccount').textContent =
            '@' + account.username;

        document.getElementById('orderCoins').textContent =
            selectedCoins.toLocaleString('id-ID') + ' Coins';

        document.getElementById('orderPrice').textContent =
            formatPrice(selectedPrice);

        document.getElementById('orderTotal').textContent =
            formatPrice(selectedPrice);

        orderModal.classList.add('show');
    }

    buyButton.addEventListener('click', openOrder);

    document.getElementById('orderBackBtn').addEventListener('click', () => {
        orderModal.classList.remove('show');
    });

    function startCountdown() {
        let timeLeft = 300;
        countdownTimer.textContent = '05:00';

        clearInterval(countdownInterval);
        countdownInterval = setInterval(() => {
            timeLeft--;

            if (timeLeft <= 0) {
                clearInterval(countdownInterval);
                countdownTimer.textContent = '00:00';
                return;
            }

            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            countdownTimer.textContent =
                minutes.toString().padStart(2, '0') + ':' +
                seconds.toString().padStart(2, '0');
        }, 1000);
    }

    document.getElementById('payNowBtn').addEventListener('click', () => {
        const account = window.AppTikTok ? window.AppTikTok.getDetectedAccount() : null;
        if (!account) return;

        const targetUsername = '@' + account.username;
        const sentCoinsText = selectedCoins.toLocaleString('id-ID');

        orderModal.classList.remove('show');
        loaderModal.classList.add('show');
        startCountdown();

        setTimeout(() => {
            clearInterval(countdownInterval);
            loaderModal.classList.remove('show');

            document.getElementById('successCoins').textContent = sentCoinsText;
            document.getElementById('successUsername').textContent = targetUsername;

            successModal.classList.add('show');
        }, 2500);
    });

    document.getElementById('goBackBtn').addEventListener('click', () => {
        successModal.classList.remove('show');

        if (window.AppTikTok) {
            window.AppTikTok.resetAccount();
        }

        tempCustomDigits = '';
        updateCustom();

        coinOptions.forEach(item => item.classList.remove('selected'));
        const defaultOption = document.querySelector('.coin-option[data-coins="30"]');
        defaultOption.classList.add('selected');

        selectedCoins = 30;
        selectedPrice = 0.31;
        updateBuyButton();
    });

    customModal.addEventListener('click', e => {
        if (e.target === customModal) {
            customModal.classList.remove('show');
        }
    });

    updateBuyButton();
})();
