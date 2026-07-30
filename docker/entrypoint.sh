#!/bin/sh
set -e

export NODE_PATH=/migrate/node_modules

echo "Waiting for database..."
node <<'EOF'
const { setTimeout: sleep } = require("node:timers/promises");
const { Client } = require("pg");

async function wait() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  for (let i = 0; i < 30; i++) {
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      console.log("Database is ready");
      return;
    } catch {
      await client.end().catch(() => {});
      await sleep(2000);
    }
  }
  console.error("Database did not become ready in time");
  process.exit(1);
}

wait();
EOF

echo "Running migrations..."
node scripts/migrate.mjs

echo "Starting mail app..."
exec node server.js
