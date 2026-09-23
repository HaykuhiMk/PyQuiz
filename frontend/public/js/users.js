import { api } from "./api.js";

document.addEventListener("DOMContentLoaded", () => {
    if (!localStorage.getItem("adminToken")) {
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

    async function loadUsers() {
        tableBody.innerHTML = `<tr><td colspan="7">Loading...</td></tr>`;
        try {
            const users = await api.getAdminUsers({ page: currentPage, limit: PAGE_SIZE });
            hasNextPage = users.length === PAGE_SIZE;
            pageLabel.textContent = `Page ${currentPage}`;

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
            console.error("Error loading users:", error);
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
        logoutBtn.addEventListener("click", () => {
            if (!confirm("Are you sure you want to log out?")) return;
            localStorage.removeItem("adminToken");
            window.location.href = "admin_login.html";
        });
    }

    loadUsers();
});
