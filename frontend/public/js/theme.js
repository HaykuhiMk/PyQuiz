const STORAGE_KEY = "pyquiz-theme";

function getStoredTheme() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored === "light" || stored === "dark" ? stored : null;
    } catch {
        return null;
    }
}

function getSystemTheme() {
    if (!window.matchMedia) return "dark";
    if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
    return "dark";
}

function getActiveTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    updateToggleUI(theme);
}

function updateToggleUI(theme) {
    const toggle = document.getElementById("theme-toggle");
    if (!toggle) return;
    toggle.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
    toggle.setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme");
}

function setTheme(theme) {
    try {
        localStorage.setItem(STORAGE_KEY, theme);
    } catch {
        /* localStorage unavailable (private mode, etc.) — theme still applies for this load */
    }
    applyTheme(theme);
}

function initThemeToggle() {
    updateToggleUI(getActiveTheme());

    const toggle = document.getElementById("theme-toggle");
    if (toggle && !toggle.dataset.themeBound) {
        toggle.dataset.themeBound = "true";
        toggle.addEventListener("click", () => {
            setTheme(getActiveTheme() === "light" ? "dark" : "light");
        });
    }

    if (window.matchMedia) {
        const media = window.matchMedia("(prefers-color-scheme: light)");
        const onSystemChange = () => {
            // Only follow the system when the user hasn't chosen a theme themselves.
            if (!getStoredTheme()) applyTheme(getSystemTheme());
        };
        if (media.addEventListener) media.addEventListener("change", onSystemChange);
        else if (media.addListener) media.addListener(onSystemChange);
    }
}

export { initThemeToggle, setTheme, getActiveTheme };
