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
const DEFAULT_LOGGER = getLogger(LogLevel.INFO, "uagents");

export function getLogger(logLevel: LogLevel, name: string): Logger {
  if (name.length > maxNameLength) {
    maxNameLength = name.length;
  }
  return { logLevel, name };
}

export function log(message: string, logger?: Logger) {
  if (!logger) {
    logger = DEFAULT_LOGGER;
  }
  const output = `[${logger.logLevel}\t ${logger.name.padStart(
    maxNameLength,
    " "
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
