// Shared env-value hygiene. A stray \r, \n, or control character in a credential
// (common after a bad Windows paste in setup) produces "Invalid character in
// header content" when Node builds an HTTP request. This module is the one
// place every component sanitizes secrets before using them.

function cleanEnv(v) {
  return (v || '').replace(/[\x00-\x1F\x7F]/g, '').trim();
}

// Read a variable and return the cleaned string.
function env(name, fallback = '') {
  return cleanEnv(process.env[name]) || cleanEnv(fallback);
}

module.exports = { cleanEnv, env };
