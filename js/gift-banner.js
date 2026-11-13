(function () {
    const giftItems = [
        {
            icon: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/eba3a9bb85c33e017f3648eaf88d7189~tplv-obj.webp',
            amount: '1.000'
        },
        {
            icon: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/a4c4dc437fd3a6632aba149769491f49.png~tplv-obj.webp',
            amount: '5.000'
        },
        {
            icon: 'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/resource/075e206d6da035f10ff5f8fecd82abcc.png~tplv-obj.webp',
            amount: '15.000'
        },
        {
            icon: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/4e7ad6bdf0a1d860c538f38026d4e812~tplv-obj.webp',
            amount: '30.000'
        }
    ];

    const giftTicker = document.getElementById('giftTicker');
    const giftIcon = document.getElementById('giftIcon');
    const giftAmount = document.getElementById('giftAmount');

    if (!giftTicker || !giftIcon || !giftAmount) return;

    let giftIndex = 0;

    giftItems.forEach(item => {
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        img.src = item.icon;
    });

    const intervalId = setInterval(() => {
        giftIndex = (giftIndex + 1) % giftItems.length;
        const next = giftItems[giftIndex];

        giftTicker.classList.add('switching');
        setTimeout(() => {
            if (!document.body.contains(giftTicker)) return;
            giftIcon.src = next.icon;
            giftAmount.textContent = next.amount;
            giftTicker.classList.remove('switching');
        }, 220);
    }, 5000);

    if (Array.isArray(window.AppCleanups)) {
        window.AppCleanups.push(() => clearInterval(intervalId));
    }
})();
