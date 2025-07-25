import { initializeHeaderLogic } from './header_logic.js';

document.addEventListener("DOMContentLoaded", async function () {
    try {
        const headerResponse = await fetch('header.html');
        const headerData = await headerResponse.text();
        document.getElementById('header-container').innerHTML = headerData;

        const burger = document.querySelector(".burger-menu");
        const navMenu = document.querySelector("nav ul");

        if (burger && navMenu) {
            burger.addEventListener("click", function () {
                navMenu.classList.toggle("active");
            });
        }

        // Initialize header logic after content is loaded
        initializeHeaderLogic();

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
