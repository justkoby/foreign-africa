// Start-up that stays alive and explains itself. Hosts such as Hostinger report any app that exits before it listens as a
// bare "503 Service Unavailable" with no reason. So the server binds its port first, then prepares itself, and while it is
// starting (or if it cannot start) it answers every request with a clear 503 that names the problem without revealing
// any value from the environment.

// PORT is usually a number, but some hosts pass a socket path or pipe name. Both are valid to listen on.
export function listenTarget(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return 3000;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

// Translates a database error into a plain explanation. Only the error code and our own wording are ever shown:
// driver messages can contain user names and host names.
const hints = {
  ECONNREFUSED: 'The database server refused the connection. Check DB_HOST and DB_PORT (Hostinger usually uses 127.0.0.1 and 3306).',
  ENOTFOUND: 'The database host name could not be found. Check DB_HOST.',
  ETIMEDOUT: 'The database did not answer in time. Check DB_HOST and DB_PORT.',
  EHOSTUNREACH: 'The database host cannot be reached. Check DB_HOST.',
  ER_ACCESS_DENIED_ERROR: 'The database refused the user name or password. Check DB_USER and DB_PASSWORD (and DB_MIGRATE_USER / DB_MIGRATE_PASSWORD if used).',
  // MariaDB answers this way both for a database that does not exist and for one the user may not use.
  ER_DBACCESS_DENIED_ERROR: 'Either the database named in DB_NAME does not exist, or this database user is not allowed to use it. Check DB_NAME, and in hPanel assign the user to that database.',
  ER_BAD_DB_ERROR: 'The database named in DB_NAME does not exist. Create it in hPanel and check DB_NAME.',
  ER_TABLEACCESS_DENIED_ERROR: 'The database user lacks a privilege it needs (CREATE and ALTER are required to run migrations).',
  ER_SPECIFIC_ACCESS_DENIED_ERROR: 'The database user lacks a privilege it needs.',
  ER_CON_COUNT_ERROR: 'Too many database connections. Lower DB_CONNECTION_LIMIT.',
  ER_USER_LIMIT_REACHED: 'This database user has reached its connection limit. Lower DB_CONNECTION_LIMIT.',
};

export function describeStartupError(error) {
  if (error?.status && error.message) return {code: String(error.code || 'refused'), detail: error.message};
  const code = String(error?.code || error?.name || 'unknown');
  const migration = error?.migration ? ` The failing migration was ${error.migration}.` : '';
  const cause = error?.cause?.code && !error.code ? String(error.cause.code) : code;
  return {code: cause, detail: `${hints[cause] || hints[code] || 'The database could not be prepared.'}${migration} (error code ${cause})`};
}

export function createBoot() {
  const state = {phase: 'starting', problems: []};
  const handler = (request, response) => {
    response.statusCode = 503;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Retry-After', state.phase === 'starting' ? '10' : '60');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const path = String(request.url || '').split('?')[0];
    if (path === '/api/health') {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ok: false, phase: state.phase, problems: state.problems}));
      return;
    }
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const lines = state.phase === 'starting'
      ? ['Foreign Africa is starting. Try again in a few seconds.']
      : ['Foreign Africa could not start.', '', ...state.problems.map(problem => `- ${problem.label}: ${problem.detail}`), '', 'Fix the setting named above in the hosting panel and redeploy. Nothing was changed in the database by this message.'];
    response.end(`${lines.join('\n')}\n`);
  };
  return {state, handler};
}
