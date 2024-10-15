export enum LogLevel {
  "DEBUG" = "DEBUG",
  "INFO" = "INFO",
  "WARN" = "WARN",
  "ERROR" = "ERROR",
}

export type Logger = {
  logLevel: LogLevel;
  name: string;
};

let maxNameLength = 0;
let DEFAULT_LOGGER: Logger; // Set on first use such that maxNameLength is not affected by default logger until it's actually used

export function getLogger(logLevel: LogLevel, name: string): Logger {
  if (name.length > maxNameLength) {
    maxNameLength = name.length;
  }
  return { logLevel, name };
}

export function log(message: string, logger?: Logger) {
  if (!logger) {
    if (!DEFAULT_LOGGER) {
      DEFAULT_LOGGER = getLogger(LogLevel.INFO, "default");
    }
    logger = DEFAULT_LOGGER;
  }
  const output = `${logger.logLevel}\t [${logger.name.padStart(
    maxNameLength
  )}]: ${message}`;
  switch (logger.logLevel) {
    case LogLevel.DEBUG:
      console.debug(output);
      break;
    case LogLevel.INFO:
      console.info(output);
      break;
    case LogLevel.WARN:
      console.warn(output);
      break;
    case LogLevel.ERROR:
      console.error(output);
      break;
  }
}
