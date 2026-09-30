import { api } from "./api.js";

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await api.getAdminMe();
    } catch {
        window.location.href = "admin_login.html";
        return;
    }

    const PAGE_SIZE = 20;
    let currentPage = 1;
    let hasNextPage = false;

    const tableBody = document.getElementById("contact-list-body");
    const pageLabel = document.getElementById("page-label");
    const prevBtn = document.getElementById("prev-page-btn");
    const nextBtn = document.getElementById("next-page-btn");

    function escapeHTML(str = "") {
        return String(str).replace(/[&<>"']/g, (match) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        }[match]));
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
    }

    async function loadContacts() {
        tableBody.innerHTML = `<tr><td colspan="4">Loading...</td></tr>`;
        try {
            const contacts = await api.getAdminContacts({ page: currentPage, limit: PAGE_SIZE });
            hasNextPage = contacts.length === PAGE_SIZE;
            pageLabel.textContent = `Page ${currentPage}`;

            if (!contacts.length) {
                tableBody.innerHTML = `<tr><td colspan="4">No messages yet.</td></tr>`;
                return;
            }

            tableBody.innerHTML = contacts
                .map(
                    (contact) => `
                <tr>
                    <td>${escapeHTML(contact.name)}</td>
                    <td>${escapeHTML(contact.email)}</td>
                    <td>${escapeHTML(contact.message)}</td>
                    <td>${escapeHTML(formatDate(contact.createdAt))}</td>
                </tr>
            `
                )
                .join("");
        } catch (error) {
            console.error("Error loading contact messages:", error);
            tableBody.innerHTML = `<tr><td colspan="4">Error: ${escapeHTML(error.message)}</td></tr>`;
        }
    }

    prevBtn.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage -= 1;
            loadContacts();
        }
    });

    nextBtn.addEventListener("click", () => {
        if (hasNextPage) {
            currentPage += 1;
            loadContacts();
        }
    });

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            if (!confirm("Are you sure you want to log out?")) return;
            await api.adminLogout().catch(() => {});
            window.location.href = "admin_login.html";
        });
    }

    loadContacts();
});
