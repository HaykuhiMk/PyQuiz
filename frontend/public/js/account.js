document.addEventListener("DOMContentLoaded", () => {
    fetch("http://localhost:5000/api/users/me", {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.username) {
            document.getElementById("username").textContent = data.username;
            document.getElementById("answered-count").textContent = data.answered;
            document.getElementById("unanswered-count").textContent = data.unanswered;

            const totalQuestions = data.answered + data.unanswered;
            const progress = totalQuestions > 0 ? (data.answered / totalQuestions) * 100 : 0;
            document.getElementById("progress-fill").style.width = progress + "%";
        } else {
            window.location.href = "/login.html";
        }
    })
    .catch(() => {
        window.location.href = "/login.html";
    });

    document.getElementById("logout").addEventListener("click", () => {
        localStorage.removeItem("token");
        window.location.href = "/login.html";
    });
});
