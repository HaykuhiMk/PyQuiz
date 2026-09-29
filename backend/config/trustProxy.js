const logger = require('./logger');

// Configures Express's `trust proxy` setting from the TRUST_PROXY env
// variable (docs/AUDIT.md item 15: without this, req.ip resolves to the
// reverse proxy's address behind a load balancer, so express-rate-limit's
// default IP-based keying effectively limits by proxy IP instead of per
// client). Unset/empty leaves Express's default (`false` — trust nothing),
// which is the right choice for a deployment with no reverse proxy in front.
//
// TRUST_PROXY must be set to the EXACT number of reverse-proxy hops in
// front of the app, e.g. "1" for the common case of one load balancer/nginx
// terminating TLS — never "true". "true" tells Express to trust every hop
// in the chain, including the leftmost value in a client-supplied
// X-Forwarded-For header, which any client can set to whatever it wants —
// that lets a client spoof req.ip outright, bypassing every IP-keyed rate
// limiter in this app, including login/register brute-force protection.
// "true" is only ever safe if literally every hop between the internet and
// this process is one you control, which is not the normal case even
// behind a real proxy.
function configureTrustProxy(app) {
  const raw = process.env.TRUST_PROXY;
  if (!raw) return;

  if (raw === 'true') {
    logger.warn(
      'TRUST_PROXY=true trusts every hop in X-Forwarded-For, including a value the client itself ' +
        'sent — this lets a client spoof req.ip and bypass IP-keyed rate limits (login brute-force ' +
        'protection included). Set it to the exact number of proxy hops instead, e.g. TRUST_PROXY=1.'
    );
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
