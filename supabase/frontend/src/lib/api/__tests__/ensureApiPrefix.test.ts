import { describe, it, expect } from "vitest";
import { ensureApiPrefix } from "../http-client";

describe("ensureApiPrefix", () => {
  it("adds /api prefix to a plain endpoint", () => {
    expect(ensureApiPrefix("/accounts")).toBe("/api/accounts");
  });

  it("adds /api prefix when endpoint has no leading slash", () => {
    expect(ensureApiPrefix("accounts")).toBe("/api/accounts");
  });

  it("does not double-prefix an endpoint that already starts with /api/", () => {
    expect(ensureApiPrefix("/api/accounts")).toBe("/api/accounts");
  });

  it("handles the bare /api path", () => {
    expect(ensureApiPrefix("/api")).toBe("/api");
  });

  it("prefixes nested paths correctly", () => {
    expect(ensureApiPrefix("/credentials/123/rotate")).toBe("/api/credentials/123/rotate");
  });

  it("does not double-prefix nested paths that already include /api/", () => {
    expect(ensureApiPrefix("/api/credentials/123/rotate")).toBe("/api/credentials/123/rotate");
  });

  it("handles paths that contain 'api' but not as a prefix", () => {
    // e.g. /connectors/api-test should still get prefixed
    expect(ensureApiPrefix("/connectors/api-test")).toBe("/api/connectors/api-test");
  });

  it("handles empty string", () => {
    expect(ensureApiPrefix("")).toBe("/api/");
  });
});
