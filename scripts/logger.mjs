const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function ts() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function truncate(str, max = 120) {
  if (typeof str !== 'string') str = JSON.stringify(str);
  return str.length > max ? str.slice(0, max) + '…' : str;
}

export function createLogger(moduleName) {
  const tag = `${C.cyan}[${moduleName}]${C.reset}`;

  function fmt(level, icon, color, fn, msg) {
    return `${C.dim}${ts()}${C.reset} ${tag} ${color}${icon} ${fn}${C.reset} ${msg}`;
  }

  return {
    info(fn, msg, data) {
      const line = fmt('INFO', 'ℹ', C.blue, fn, msg);
      data !== undefined ? console.log(line, data) : console.log(line);
    },

    success(fn, msg, data) {
      const line = fmt('OK', '✔', C.green, fn, msg);
      data !== undefined ? console.log(line, data) : console.log(line);
    },

    warn(fn, msg, data) {
      const line = fmt('WARN', '⚠', C.yellow, fn, msg);
      data !== undefined ? console.warn(line, data) : console.warn(line);
    },

    error(fn, msg, data) {
      const line = fmt('ERR', '✖', C.red, fn, msg);
      data !== undefined ? console.error(line, data) : console.error(line);
    },

    debug(fn, msg, data) {
      if (!process.env.DEBUG) return;
      const line = `${C.dim}${ts()} [${moduleName}] ${fn} ${msg}${C.reset}`;
      data !== undefined ? console.log(line, data) : console.log(line);
    },

    /** Start a timer — call .end() to log elapsed ms. */
    time(fn) {
      const start = performance.now();
      return {
        end(msg = 'done') {
          const ms = (performance.now() - start).toFixed(0);
          const line = fmt('TIME', '⏱', C.magenta, fn, `${msg} ${C.dim}(${ms}ms)${C.reset}`);
          console.log(line);
          return Number(ms);
        },
      };
    },

    /** Log a separator / section header */
    section(title) {
      console.log(`\n${C.bold}${C.white}${'═'.repeat(60)}${C.reset}`);
      console.log(`${C.bold}${C.white}  ${title}${C.reset}`);
      console.log(`${C.bold}${C.white}${'═'.repeat(60)}${C.reset}\n`);
    },

    /** Convenience: log object keys + truncated values */
    dump(fn, label, obj) {
      const line = fmt('DUMP', '📋', C.blue, fn, label);
      console.log(line);
      for (const [k, v] of Object.entries(obj)) {
        console.log(`  ${C.dim}│${C.reset} ${C.cyan}${k}${C.reset}: ${truncate(v)}`);
      }
    },
  };
}
