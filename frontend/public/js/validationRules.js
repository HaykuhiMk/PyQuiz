import { api } from './api.js';

// Client-side checks derived from the server's own rules
// (GET /api/v1/validation-rules, served from backend/config/validationRules.js),
// so the frontend never keeps a separate copy that could drift. If the rules
// can't be loaded, callers skip the client-side check and the server's
// validation still applies.
let rulesPromise = null;

export function getValidationRules() {
  if (!rulesPromise) {
    rulesPromise = api.getValidationRules().catch(() => null);
  }
  return rulesPromise;
}

// Resolves to { requirements, test(password) }, or null if unavailable.
export async function getPasswordRule() {
  const rules = await getValidationRules();
  if (!rules?.password) return null;

  const { minLength, pattern, requirements } = rules.password;
  const regex = new RegExp(pattern);
  return {
    requirements,
    test: (password) => password.length >= minLength && regex.test(password),
  };
}

// Resolves to { maxFileBytes, maxDataUrlLength, tooLargeMessage }, or null.
export async function getAvatarRule() {
  const rules = await getValidationRules();
  return rules?.avatar || null;
}

// Replaces a static help text with the server's wording of the rule.
export async function showPasswordRequirements(helpElement) {
  const rule = await getPasswordRule();
  if (rule && helpElement) helpElement.textContent = rule.requirements;
}
