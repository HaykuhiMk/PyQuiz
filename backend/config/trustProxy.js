// Configures Express's `trust proxy` setting from the TRUST_PROXY env
// variable (docs/AUDIT.md item 15: without this, req.ip resolves to the
// reverse proxy's address behind a load balancer, so express-rate-limit's
// default IP-based keying effectively limits by proxy IP instead of per
// client). Unset/empty leaves Express's default (`false` — trust nothing),
// which is the right choice for a deployment with no reverse proxy in front.
//
// TRUST_PROXY accepts the same values Express itself does:
//   - a hop count, e.g. "1" for exactly one reverse proxy (the common case:
//     nginx/a platform load balancer terminating TLS in front of Node);
//   - "true" to trust every proxy in the chain (only appropriate if every
//     hop in front of the app is one you control);
//   - "false" (or unset) to trust none, Express's default.
function configureTrustProxy(app) {
  const raw = process.env.TRUST_PROXY;
  if (!raw) return;

  if (raw === 'true') {
    app.set('trust proxy', true);
  } else if (raw === 'false') {
    app.set('trust proxy', false);
  } else if (/^\d+$/.test(raw)) {
    app.set('trust proxy', Number(raw));
  } else {
    app.set('trust proxy', raw);
  }
}

module.exports = { configureTrustProxy };
