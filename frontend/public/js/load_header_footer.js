import { initializeHeaderLogic } from './header_logic.js';
import { initUI } from './ui.js';
import { initThemeToggle } from './theme.js';
import { mountIcons } from './icons.js';

function initMobileMenu() {
    const burger = document.querySelector(".burger-menu");
    const menu = document.getElementById("pq-topnav");
    if (!burger || !menu) return;

    const setOpen = (open) => {
        menu.classList.toggle("is-open", open);
        burger.setAttribute("aria-expanded", String(open));
        burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };

    burger.addEventListener("click", () => {
        setOpen(!menu.classList.contains("is-open"));
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && menu.classList.contains("is-open")) {
            setOpen(false);
            burger.focus();
        }
    });

    document.addEventListener("click", (event) => {
        if (menu.classList.contains("is-open") && !event.target.closest(".pq-topbar")) {
            setOpen(false);
        }
    });

    // The panel only exists below 900px; reset it if the viewport widens.
    window.matchMedia("(min-width: 900px)").addEventListener("change", (event) => {
        if (event.matches) setOpen(false);
    });
}

document.addEventListener("DOMContentLoaded", async function () {
    // Page content marks icon slots with data-icon; fill them before the
    // header fetch so they render with the rest of the page.
    mountIcons(document.body);

    try {
        const headerResponse = await fetch('header.html');
        const headerData = await headerResponse.text();
        document.getElementById('header-container').innerHTML = headerData;

        initMobileMenu();

        // Initialize header logic after content is loaded
        initializeHeaderLogic();
        initUI();
        initThemeToggle();

    } catch (error) {
        console.error('Error loading header:', error);
    }

    try {
        const footerResponse = await fetch('footer.html');
        const footerData = await footerResponse.text();
        document.getElementById('footer-container').innerHTML = footerData;
    } catch (error) {
        console.error('Error loading footer:', error);
    }
});
