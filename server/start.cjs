// Optional alternate entry file for hosts that load the entry with require() on a Node version that cannot require() an
// ES module (older than 22.12). Dynamic import() works on every supported Node, so this always starts the real server.
// Use `server/start.cjs` as the entry file only if the log shows ERR_REQUIRE_ESM for `server/index.js`.
import('./index.js').catch(error => {
  console.error(`The server failed to load: ${error && (error.code || error.name) || 'unknown'}`);
  process.exit(1);
});
