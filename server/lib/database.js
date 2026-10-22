// Inspect driver causes, but return only fixed messages. MongoDB errors can
// contain connection strings, credentials, document contents, or hostnames.
function errorDetails(error) {
  const queue = [error], seen = new Set(), details = [];
  while (queue.length && seen.size < 64) {
    const value = queue.shift();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value); details.push(value);
    for (const key of ['cause', 'reason', 'originalError', 'errorResponse', 'error']) queue.push(value[key]);
    if (value.servers instanceof Map) queue.push(...value.servers.values());
  }
  return details;
}

export function assertDatabaseTopology(hello) {
  if (hello?.setName || hello?.msg === 'isdbgrid') return;
  const error = new Error('MongoDB must be a replica set for atomic authentication and payments.');
  error.code = 'HELIOS_REPLICA_REQUIRED';
  throw error;
}

export function databaseDiagnosis(error) {
  const details = errorDetails(error);
  const codes = new Set(details.map(value => String(value.code || '')));
  const text = details.map(value => `${value.name || ''} ${value.message || ''} ${value.syscall || ''}`).join('\n');
  if (codes.has('HELIOS_MONGO_MISSING')) return { code: 'DB_ENV', message: 'MONGODB_URI is empty. Fill it in the project-root .env, then restart this command.' };
  if (codes.has('HELIOS_URI_PLACEHOLDER')) return { code: 'DB_URI', message: 'The connection string still contains a placeholder. Replace the database username/password placeholders and remove the angle brackets.' };
  if (codes.has('HELIOS_REPLICA_REQUIRED')) return { code: 'DB_REPLICA', message: 'MongoDB is reachable but is a standalone server. Helios requires a replica set for signup and payments. Use Atlas or the included Docker replica-set configuration.' };
  if (codes.has('18') || /bad auth|authentication failed|unable to authenticate|auth error/i.test(text)) return { code: 'DB_AUTH', message: 'MongoDB rejected the database credentials. Check the database user, its password, and authSource. Use database-user credentials, not your Atlas website login; percent-encode special characters in the username/password.' };
  if (codes.has('13') || /not authorized|unauthorized/i.test(text)) return { code: 'DB_PERMISSIONS', message: 'The database user lacks permission for this operation. Grant it readWrite access to the Helios database and check the database name in MONGODB_URI.' };
  if (/querySrv|queryTxt|getaddrinfo|ENOTFOUND|EAI_AGAIN/i.test(text) || codes.has('ENOTFOUND') || codes.has('EAI_AGAIN')) return { code: 'DB_DNS', message: 'The database hostname or SRV/TXT record could not be resolved. Check the exact cluster hostname, cluster availability, and DNS on this computer. For Atlas, copy its standard non-SRV connection string if your network cannot resolve SRV records.' };
  if (/certificate|TLS|SSL|CERT_|self.signed|local issuer/i.test(text)) return { code: 'DB_TLS', message: 'The secure connection to MongoDB failed. Check your system clock, trusted certificates, and any proxy/antivirus HTTPS inspection. Keep TLS verification enabled.' };
  if (codes.has('HELIOS_BAD_URI') || /MongoParseError|MongoInvalidArgumentError|Invalid scheme|Invalid URL/i.test(text)) return { code: 'DB_URI', message: 'MONGODB_URI has an invalid format. Copy the connection string from your database provider; it must start with mongodb:// or mongodb+srv://. Percent-encode special characters in credentials and quote the complete value in .env.' };
  if (codes.has('11000')) return { code: 'DB_INDEX', message: 'A unique index or catalogue write conflicts with existing database records. Inspect duplicate records in the Helios database before retrying; do not delete the database to resolve a connection problem.' };
  if (codes.has('ECONNREFUSED') || /ECONNREFUSED/i.test(text)) return { code: 'DB_REFUSED', message: 'No MongoDB server accepted the connection. For local MongoDB, start the database and check its port. For hosted MongoDB, check the hostname, IP access list, firewall, and cluster availability.' };
  if (/ServerSelection|NetworkError|timed out|timeout|ETIMEDOUT|ECONNRESET/i.test(text) || codes.has('ETIMEDOUT') || codes.has('ECONNRESET')) return { code: 'DB_NETWORK', message: 'MongoDB could not be reached within the connection timeout. For Atlas, allow this computer/server IP in Network Access and confirm the cluster is running. Also check the connection hostname, VPN/firewall, and network access to the database port.' };
  return { code: 'DB_UNKNOWN', message: 'The database operation failed. Run node server/scripts/check-db.js to isolate connection, authentication, replica-set, and read-access checks. No raw driver error is printed because it can contain secrets.' };
}

export function formatDatabaseError(error, phase = 'connecting to MongoDB') {
  const diagnosis = databaseDiagnosis(error);
  return `[${diagnosis.code}] Helios failed while ${phase}. ${diagnosis.message}`;
}
