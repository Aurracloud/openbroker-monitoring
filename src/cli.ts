import { startMonitoringServer } from './server.js';

function getArg(name: string, fallback?: string): string | undefined {
  const long = `--${name}`;
  const idx = process.argv.indexOf(long);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  const prefixed = process.argv.find((arg) => arg.startsWith(`${long}=`));
  if (prefixed) return prefixed.slice(long.length + 1);
  return fallback;
}

function printHelp(): void {
  console.log(`
openbroker-monitoring

Usage:
  openbroker-monitoring serve [--port 3001] [--host 127.0.0.1] [--db ~/.openbroker/automation-audit.sqlite]

Environment:
  OB_MONITOR_PORT          Default port
  OB_MONITOR_HOST          Default host
  OPENBROKER_AUDIT_DB_PATH Audit database path
`);
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'serve';
  if (command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }
  if (command !== 'serve') {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }

  const port = Number(getArg('port', process.env.OB_MONITOR_PORT ?? '3001'));
  const host = getArg('host', process.env.OB_MONITOR_HOST ?? '127.0.0.1');
  const dbPath = getArg('db', process.env.OPENBROKER_AUDIT_DB_PATH);

  const server = await startMonitoringServer({
    port: Number.isFinite(port) ? port : 3001,
    host,
    dbPath,
  });

  console.log(`[openbroker-monitoring] dashboard: ${server.url}`);
  console.log(`[openbroker-monitoring] audit db:  ${server.dbPath}`);

  const shutdown = () => {
    console.log('\n[openbroker-monitoring] shutting down');
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
