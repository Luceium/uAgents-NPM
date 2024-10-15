import { jest, describe, expect, it } from "@jest/globals";
import { getLogger, log, LogLevel } from "../src/utils";

describe("log", () => {
  // const getLoggerSpy = jest.spyOn(getLogger);
  const infoLogSpy = jest.spyOn(console, "info");

  it("should log formatted logs given Loggers", () => {
    const bobLogger = getLogger(LogLevel.INFO, "bob");

    log("Hello, world!", bobLogger);
    expect(infoLogSpy).toHaveBeenCalledWith("INFO\t [bob]: Hello, world!");

    const aliceLogger = getLogger(LogLevel.INFO, "alice");

    log("Hello, world!", aliceLogger);
    expect(infoLogSpy).toHaveBeenCalledWith("INFO\t [alice]: Hello, world!");
    log("Hello, world!", bobLogger);
    expect(infoLogSpy).toHaveBeenCalledWith("INFO\t [  bob]: Hello, world!");
  });
});
