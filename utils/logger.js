// Simple console logger with levels and timestamps (CommonJS) using chalk
const chalk = require('chalk');

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

function log(level, prefix, args) {
  if (!shouldLog(level)) return;

  let styledLabel;
  let styledPrefix = chalk.gray(prefix);

  switch (level) {
    case 'error':
      styledLabel = chalk.red.bold('ERROR');
      break;
    case 'warn':
      styledLabel = chalk.yellow.bold('WARN ');
      break;
    case 'info':
      styledLabel = chalk.cyan.bold('INFO ');
      break;
    case 'debug':
      styledLabel = chalk.gray.bold('DEBUG');
      break;
    default:
      styledLabel = level.toUpperCase();
  }

  const time = chalk.dim(`[${ts()}]`);

  // eslint-disable-next-line no-console
  console.log(`${time} ${styledLabel} ${styledPrefix}`, ...args);
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
