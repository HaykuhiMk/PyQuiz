import { api } from './api.js';

document.addEventListener("DOMContentLoaded", () => {
    const contactForm = document.getElementById("contact-form");

    contactForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const name = document.getElementById("name").value;
        const email = document.getElementById("email").value;
        const message = document.getElementById("message").value;
        const website = document.getElementById("website").value;

        try {
            await api.submitContact({ name, email, message, website });
            alert("Message sent successfully!");
            contactForm.reset();
        } catch (error) {
            console.error("Error sending message:", error);
            alert(error.message || "An error occurred. Please try again later.");
        }
    });
}); 