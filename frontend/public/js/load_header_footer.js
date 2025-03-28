document.addEventListener("DOMContentLoaded", function () {
    fetch('header.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('header-container').innerHTML = data;
            const burger = document.querySelector(".burger-menu");
            const navMenu = document.querySelector("nav ul");

            if (burger && navMenu) {
                burger.addEventListener("click", function () {
                    navMenu.classList.toggle("active");
                });
            }
        })
        .catch(error => console.error('Error loading header:', error));
    fetch('footer.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('footer-container').innerHTML = data;
        })
        .catch(error => console.error('Error loading footer:', error));
});
