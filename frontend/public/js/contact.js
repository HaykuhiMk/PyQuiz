import { api } from './api.js';
import { icon } from './icons.js';

const FIELDS = [
    { id: 'name', empty: 'Enter your name.' },
    { id: 'email', empty: 'Enter your email address.', invalid: 'Enter a valid email address, like name@example.com.' },
    { id: 'message', empty: 'Write a message.' },
];

function escapeHTML(str = '') {
    return String(str).replace(/[&<>"']/g, (match) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match])
    );
}

function setFieldError(input, message) {
    const error = document.getElementById(`${input.id}-error`);
    if (message) {
        input.setAttribute('aria-invalid', 'true');
        error.innerHTML = `${icon('cross', 16)}${escapeHTML(message)}`;
        error.hidden = false;
    } else {
        input.removeAttribute('aria-invalid');
        error.textContent = '';
        error.hidden = true;
    }
}

// Client-side checks mirror what the API requires; the server still
// validates everything and its message is shown if it rejects the form.
function validate() {
    let firstInvalid = null;
    FIELDS.forEach(({ id, empty, invalid }) => {
        const input = document.getElementById(id);
        const value = input.value.trim();
        let message = '';
        if (!value) message = empty;
        else if (invalid && input.validity.typeMismatch) message = invalid;
        setFieldError(input, message);
        if (message && !firstInvalid) firstInvalid = input;
    });
    return firstInvalid;
}

function showStatus(tone, text) {
    const status = document.getElementById('contact-status');
    if (!tone) {
        status.innerHTML = '';
        return;
    }
    const mark = tone === 'sun'
        ? '<span class="pq-disc-mark" aria-hidden="true"></span>'
        : icon('alert');
    const toneClass = tone === 'sun' ? ' pq-banner--sun' : ' pq-banner--coral';
    status.innerHTML = `<div class="pq-banner${toneClass}">${mark}<span class="pq-banner__text">${escapeHTML(text)}</span></div>`;
}

document.addEventListener("DOMContentLoaded", () => {
    const contactForm = document.getElementById("contact-form");
    const submitBtn = document.getElementById("submit-btn");

    FIELDS.forEach(({ id }) => {
        const input = document.getElementById(id);
        input.addEventListener('input', () => {
            if (input.getAttribute('aria-invalid') === 'true') setFieldError(input, '');
        });
    });

    contactForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        showStatus(null);

        const firstInvalid = validate();
        if (firstInvalid) {
            firstInvalid.focus();
            return;
        }

        const name = document.getElementById("name").value;
        const email = document.getElementById("email").value;
        const message = document.getElementById("message").value;
        const website = document.getElementById("website").value;

        submitBtn.disabled = true;
        submitBtn.setAttribute('aria-busy', 'true');

        try {
            await api.submitContact({ name, email, message, website });
            contactForm.reset();
            showStatus('sun', 'Message sent successfully. Thanks for getting in touch.');
        } catch (error) {
            console.error("Error sending message:", error);
            showStatus('coral', error.message || "We couldn't send your message. Please try again later.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.removeAttribute('aria-busy');
        }
    });
});
