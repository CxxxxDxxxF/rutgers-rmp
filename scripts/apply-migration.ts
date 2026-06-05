#!/usr/bin/env -S npx tsx

import { Client } from 'pg';
import { readFileSync } from 'fs';
import { parseArgs } from 'util';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const args = parseArgs({
  options: {
    file: {
      type: 'string',
      short: 'f',
      default: 'supabase/migrations/002_teaching_assignments.sql'
    }
  }
});

const migrationFile = args.values.file;
const connectionInfo = {
  host: 'db.lnqauobmiocrmuvjkjet.supabase.co',
  port: 5432,
  user: 'postgres',
  database: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
};

async function getClient() {
  if (connectionInfo.password) {
    return new Client(connectionInfo);
  }

  if (process.env.DATABASE_URL) {
    return new Client({ connectionString: process.env.DATABASE_URL });
  }

  console.error('No database connection available.');
  console.error('Connection info:');
  console.error(`  Host: ${connectionInfo.host}`);
  console.error(`  Port: ${connectionInfo.port}`);
  console.error(`  User: ${connectionInfo.user}`);
  console.error(`  Database: ${connectionInfo.database}`);
  console.error('Set SUPABASE_DB_PASSWORD env var or DATABASE_URL');
  console.error('Example: SUPABASE_DB_PASSWORD=xxx npx tsx scripts/apply-migration.ts');
  process.exit(1);
}

async function applyMigration() {
  const sql = readFileSync(migrationFile, 'utf8');
  const statements = sql.split(';').filter(stmt => stmt.trim());

  const client = await getClient();
  await client.connect();

  try {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;

      try {
        await client.query(stmt + ';');
        console.log(`✓ Statement ${i + 1}: OK`);
      } catch (error) {
        console.error(`✗ Statement ${i + 1}: FAILED`);
        console.error(`  Error: ${errorMessage(error)}`);
        console.error(`  SQL: ${stmt.substring(0, 100)}...`);
        await client.end();
        process.exit(1);
      }
    }

    console.log('Migration completed successfully');
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', errorMessage(error));
    await client.end();
    process.exit(1);
  }
}

applyMigration().catch(error => {
  console.error('Fatal error:', errorMessage(error));
  process.exit(1);
});
