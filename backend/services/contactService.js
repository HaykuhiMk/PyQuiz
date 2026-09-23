const AppError = require('../core/AppError');
const contactRepository = require('../repositories/contactRepository');
const { sendContactEmail } = require('../utils/emailUtils');
const { contactSchema } = require('../validators/contactValidators');

const SUCCESS_PAYLOAD = { message: 'Message sent successfully' };

async function submitContact(payload = {}) {
  // Honeypot: real users never see or fill this field. Checked before any
  // validation so a bot gets the exact same "success" response regardless
  // of what garbage it submitted elsewhere, and learns nothing from the
  // response shape. Nothing is written to the DB or emailed in this case.
  if (payload.website) {
    return SUCCESS_PAYLOAD;
  }

  const result = contactSchema.safeParse(payload);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new AppError(firstIssue.message, 400, result.error.flatten());
  }

  const { name, email, message } = result.data;

  await contactRepository.createContact({ name, email, message });

  try {
    await sendContactEmail(name, email, message);
  } catch (error) {
    console.error('Failed to send email:', error);
  }

  return SUCCESS_PAYLOAD;
}

async function getContactsForAdmin({ page = 1, limit = 20 } = {}) {
  const [contacts, total] = await Promise.all([
    contactRepository.findAllPaginated({ page, limit }),
    contactRepository.countContacts(),
  ]);

  return {
    contacts,
    meta: {
      total,
      page,
      limit,
      totalPages: total ? Math.ceil(total / limit) : 0,
      hasNextPage: page * limit < total,
    },
  };
}

module.exports = { submitContact, getContactsForAdmin };
