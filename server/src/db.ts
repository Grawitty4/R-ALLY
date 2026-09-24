import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is required');
}

const schema = process.env.PG_SCHEMA ?? 'rally';

function sslFor(connectionString: string) {
  if (connectionString.includes('railway.internal') || connectionString.includes('localhost')) {
    return false;
  }
  return { rejectUnauthorized: false };
}

export const pool = new pg.Pool({
  connectionString: url,
  ssl: sslFor(url),
  max: 8,
  options: `-c search_path=${schema},public`,
});

export async function pingDb() {
  const result = await pool.query('SELECT 1 AS ok FROM roles LIMIT 1');
  return result.rowCount === 1;
}
