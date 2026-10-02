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

    const tableBody = document.getElementById("user-list-body");
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

    async function loadUsers() {
        const load = ++latestLoad;
        tableBody.innerHTML = `<tr><td colspan="7">Loading...</td></tr>`;
        try {
            const { items: users, meta } = await api.getAdminUsersPage({ page: currentPage, limit: PAGE_SIZE });
            if (load !== latestLoad) return;
            hasNextPage = Boolean(meta.hasNextPage);
            pageLabel.textContent = `Page ${currentPage}`;
            updatePager();

            if (!users.length) {
                tableBody.innerHTML = `<tr><td colspan="7">No users found.</td></tr>`;
                return;
            }

            tableBody.innerHTML = users
                .map((user) => {
                    const isAdmin = user.role === "admin";
                    const statusLabel = user.banned ? "Banned" : "Active";
                    const actionButton = isAdmin
                        ? `<span class="admin-badge">Admin</span>`
                        : user.banned
                          ? `<button type="button" class="secondary-btn unban-btn" data-id="${user._id}">
                                <i class="fas fa-user-check"></i> Unban
                             </button>`
                          : `<button type="button" class="danger-btn ban-btn" data-id="${user._id}">
                                <i class="fas fa-user-slash"></i> Ban
                             </button>`;

                    return `
                    <tr>
                        <td>${escapeHTML(user.username)}</td>
                        <td>${escapeHTML(user.email)}</td>
                        <td>${escapeHTML(user.role)}</td>
                        <td>${user.stats?.totalPoints ?? 0}</td>
                        <td>${user.stats?.totalAnswered ?? 0}</td>
                        <td>${statusLabel}</td>
                        <td>${actionButton}</td>
                    </tr>
                `;
                })
                .join("");

            tableBody.querySelectorAll(".ban-btn").forEach((btn) => {
                btn.addEventListener("click", () => handleSetBanned(btn.dataset.id, true));
            });
            tableBody.querySelectorAll(".unban-btn").forEach((btn) => {
                btn.addEventListener("click", () => handleSetBanned(btn.dataset.id, false));
            });
        } catch (error) {
            if (load !== latestLoad) return;
            console.error("Error loading users:", error);
            hasNextPage = false;
            updatePager();
            tableBody.innerHTML = `<tr><td colspan="7">Error: ${escapeHTML(error.message)}</td></tr>`;
        }
    }

    async function handleSetBanned(id, banned) {
        const action = banned ? "ban" : "unban";
        if (!confirm(`Are you sure you want to ${action} this user?`)) return;

        try {
            await api.setUserBanned(id, banned);
            await loadUsers();
        } catch (error) {
            alert(`Error updating user: ${error.message}`);
        }
    }

    prevBtn.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage -= 1;
            loadUsers();
        }
    });

    nextBtn.addEventListener("click", () => {
        if (hasNextPage) {
            currentPage += 1;
            loadUsers();
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

    loadUsers();
});
