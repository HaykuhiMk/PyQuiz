import { api } from "./api.js";
import { showListCount, showPageTotal } from "./adminLists.js";

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
        return Number.isNaN(date.getTime())
            ? ""
            : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    }

    // Next is enabled only when the server says another page exists (a
    // full page used to be taken as "there's more", which left an empty last
    // page whenever the total was a multiple of the page size).
    function updatePager() {
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = !hasNextPage;
    }

    // Only the latest load may fill the table: an earlier request (the first
    // page, loaded on arrival, or a page clicked past) can answer after a
    // later one, and would otherwise replace it with stale rows.
    let latestLoad = 0;

    async function loadContacts() {
        const load = ++latestLoad;
        tableBody.innerHTML = `<tr><td colspan="4">Loading...</td></tr>`;
        try {
            const { items: contacts, meta } = await api.getAdminContactsPage({ page: currentPage, limit: PAGE_SIZE });
            if (load !== latestLoad) return;
            hasNextPage = Boolean(meta.hasNextPage);
            pageLabel.textContent = `Page ${currentPage}`;
            showPageTotal(meta);
            showListCount(meta.total, ["message", "messages"]);
            updatePager();

            if (!contacts.length) {
                tableBody.innerHTML = `<tr><td colspan="4"><div class="admin-empty">No messages yet.</div></td></tr>`;
                return;
            }

            tableBody.innerHTML = contacts
                .map(
                    (contact) => `
                <tr>
                    <td class="admin-person__name">${escapeHTML(contact.name)}</td>
                    <td><a class="admin-mail" href="mailto:${encodeURIComponent(contact.email).replace(/%40/g, "@")}" title="Reply by email">${escapeHTML(contact.email)}</a></td>
                    <td><div class="admin-message">${escapeHTML(contact.message)}</div></td>
                    <td class="admin-muted-cell admin-nowrap">${escapeHTML(formatDate(contact.createdAt))}</td>
                </tr>
            `
                )
                .join("");
        } catch (error) {
            if (load !== latestLoad) return;
            hasNextPage = false;
            updatePager();
            console.error("Error loading contact messages:", error);
            showListCount(null);
            tableBody.innerHTML = `<tr><td colspan="4"><div class="admin-empty is-error">Couldn't load the messages: ${escapeHTML(error.message)}</div></td></tr>`;
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
