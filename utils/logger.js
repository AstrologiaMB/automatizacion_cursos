// Simple console logger with levels and timestamps (CommonJS)

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
let currentLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();

function setLevel(level) {
  if (LEVELS[level] === undefined) return;
  currentLevel = level;
}

function shouldLog(level) {
  const target = LEVELS[level];
  const current = LEVELS[currentLevel] ?? LEVELS.info;
  return target <= current;
}

function ts() {
  // e.g., 2025-08-08T19:31:00.123Z
  return new Date().toISOString();
}

// Colors (ANSI)
const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(level, prefix, args) {
  if (!shouldLog(level)) return;

  let color = '';
  switch (level) {
    case 'error':
      color = COLORS.red;
      break;
    case 'warn':
      color = COLORS.yellow;
      break;
    case 'info':
      color = COLORS.cyan;
      break;
    case 'debug':
      color = COLORS.gray;
      break;
  }

  const label = level.toUpperCase().padEnd(5, ' ');
  const time = ts();
  // eslint-disable-next-line no-console
  console.log(`${color}[${time}] [${label}]${COLORS.reset} ${prefix}`, ...args);
}

function createLogger(scope) {
  const prefix = scope ? `[${scope}]` : '';
  return {
    error: (...args) => log('error', prefix, args),
    warn: (...args) => log('warn', prefix, args),
    info: (...args) => log('info', prefix, args),
    debug: (...args) => log('debug', prefix, args),
  };
}

// Default logger without scope
const base = createLogger('');

module.exports = {
  ...base,
  createLogger,
  setLevel,
};
