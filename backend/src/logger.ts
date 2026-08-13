// backend/src/logger.ts
// Minimal structured console logger. Not a queue/file/remote sink - this is
// a local dev tool, so stdout (captured by ts-node-dev / whatever process
// manager runs it) is the only destination that matters.
type Level = 'info' | 'warn' | 'error';

function write(level: Level, scope: string, message: string, meta?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const metaSuffix = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${timestamp}] [${level.toUpperCase()}] [${scope}] ${message}${metaSuffix}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (scope: string, message: string, meta?: Record<string, unknown>) => write('info', scope, message, meta),
  warn: (scope: string, message: string, meta?: Record<string, unknown>) => write('warn', scope, message, meta),
  error: (scope: string, message: string, meta?: Record<string, unknown>) => write('error', scope, message, meta)
};
