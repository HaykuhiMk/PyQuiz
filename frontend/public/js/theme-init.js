(function () {
    try {
        var t = localStorage.getItem('pyquiz-theme');
        if (t !== 'light' && t !== 'dark') {
            t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        }
        document.documentElement.setAttribute('data-theme', t);
    } catch (e) {}
})();
