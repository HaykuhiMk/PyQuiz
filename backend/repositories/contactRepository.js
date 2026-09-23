const Contact = require('../models/contact');

async function createContact(payload) {
  return Contact.create(payload);
}

async function findAllPaginated({ page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;
  return Contact.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
}

async function countContacts() {
  return Contact.countDocuments({});
}

module.exports = { createContact, findAllPaginated, countContacts };
