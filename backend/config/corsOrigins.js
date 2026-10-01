// Origins allowed to make credentialed requests to the API (CORS). In
// production only the frontend itself (CLIENT_URI), as on the old production
// server; elsewhere also the local dev servers and API_URI.
const DEV_ORIGINS = ['http://localhost:3000', 'http://localhost:3001'];

function allowedOrigins(env = process.env) {
  if (env.NODE_ENV === 'production') return [env.CLIENT_URI].filter(Boolean);
  return [...DEV_ORIGINS, env.CLIENT_URI, env.API_URI].filter(Boolean);
}

module.exports = { allowedOrigins };
