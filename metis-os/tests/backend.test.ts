import { describe, expect, it, afterEach } from "vitest";
import { resolveExecBackend } from "../src/index.js";

describe("resolveExecBackend", () => {
  const prev = process.env.METIS_EXEC_BACKEND;

  afterEach(() => {
    if (prev === undefined) delete process.env.METIS_EXEC_BACKEND;
    else process.env.METIS_EXEC_BACKEND = prev;
  });

  it("defaults to os", () => {
    delete process.env.METIS_EXEC_BACKEND;
    expect(resolveExecBackend()).toBe("os");
  });

  it("honors local", () => {
    process.env.METIS_EXEC_BACKEND = "local";
    expect(resolveExecBackend()).toBe("local");
  });

  it("maps sandbox to os in open build", () => {
    process.env.METIS_EXEC_BACKEND = "sandbox";
    expect(resolveExecBackend()).toBe("os");
  });
});
