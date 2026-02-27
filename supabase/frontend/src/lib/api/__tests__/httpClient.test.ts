import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Global setup.ts already mocks @/lib/api/config (external/AWS mode)
// and @/lib/auth/cognito-client. No per-file mocks needed.

import { httpClient } from "../http-client";
import { cognitoAuth } from "@/lib/auth/cognito-client";

// Helper to create a mock Response
function mockResponse(body: unknown, init?: ResponseInit): Response {
  const status = init?.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as unknown as Response;
}

describe("httpClient response envelope unwrapping", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unwraps { data, error } envelope from backend", async () => {
    const envelope = { data: { id: "1", name: "Test" }, error: null };
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(envelope));

    const result = await httpClient.get("/accounts");
    expect(result.data).toEqual({ id: "1", name: "Test" });
    expect(result.error).toBeNull();
  });

  it("returns raw data when response is not an envelope", async () => {
    const raw = [{ id: "1" }, { id: "2" }];
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(raw));

    const result = await httpClient.get("/items");
    expect(result.data).toEqual(raw);
    expect(result.error).toBeNull();
  });

  it("returns { data: null, error: null } for 204 No Content", async () => {
    const resp = {
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error("no body")),
      headers: new Headers(),
    } as unknown as Response;
    vi.mocked(fetch).mockResolvedValueOnce(resp);

    const result = await httpClient.delete("/items/1");
    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });

  it("extracts nested error from backend envelope on failure", async () => {
    const errorBody = { data: null, error: { message: "Not found", code: "NOT_FOUND" } };
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(errorBody, { status: 404 }));

    const result = await httpClient.get("/missing");
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("Not found");
    expect(result.error?.code).toBe("NOT_FOUND");
    expect(result.error?.status).toBe(404);
  });

  it("falls back to generic HTTP error message when body has no error details", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({}, { status: 500 }));

    const result = await httpClient.get("/broken");
    expect(result.error?.message).toBe("HTTP error 500");
    expect(result.error?.status).toBe(500);
  });

  it("handles non-JSON error body gracefully", async () => {
    const resp = {
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error("not json")),
      headers: new Headers(),
    } as unknown as Response;
    vi.mocked(fetch).mockResolvedValueOnce(resp);

    const result = await httpClient.get("/bad-gateway");
    expect(result.error?.message).toBe("HTTP error 502");
  });
});

describe("httpClient 401 retry / token refresh", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(cognitoAuth.getTokens).mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries once after 401 when session refresh succeeds", async () => {
    const unauthorizedResp = mockResponse({ message: "Unauthorized" }, { status: 401 });
    const successResp = mockResponse({ data: { ok: true }, error: null });

    vi.mocked(fetch)
      .mockResolvedValueOnce(unauthorizedResp)
      .mockResolvedValueOnce(successResp);

    vi.mocked(cognitoAuth.getSession).mockResolvedValueOnce({
      data: {
        user: { sub: "u1", email: "a@b.com", emailVerified: true, accountId: null, enterpriseId: null, role: null, groups: [], rawAttributes: {} },
        tokens: { idToken: "new-token", accessToken: "x", refreshToken: "r" },
      },
      error: null,
    });

    const result = await httpClient.get("/protected");
    expect(result.data).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cognitoAuth.getSession).toHaveBeenCalledTimes(1);
  });

  it("does not retry when session refresh fails", async () => {
    const unauthorizedResp = mockResponse({ message: "Unauthorized" }, { status: 401 });
    vi.mocked(fetch).mockResolvedValueOnce(unauthorizedResp);

    vi.mocked(cognitoAuth.getSession).mockResolvedValueOnce({
      data: null,
      error: new Error("Session expired"),
    });

    const result = await httpClient.get("/protected");
    expect(result.error?.message).toBe("Unauthorized");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry 401 when skipAuth is true", async () => {
    const unauthorizedResp = mockResponse({ message: "Unauthorized" }, { status: 401 });
    vi.mocked(fetch).mockResolvedValueOnce(unauthorizedResp);

    const result = await httpClient.get("/public", { skipAuth: true });
    expect(result.error?.status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cognitoAuth.getSession).not.toHaveBeenCalled();
  });
});

describe("httpClient network error handling", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns NETWORK_ERROR on fetch failure", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Failed to fetch"));

    const result = await httpClient.get("/offline");
    expect(result.error?.message).toBe("Failed to fetch");
    expect(result.error?.code).toBe("NETWORK_ERROR");
  });

  it("returns TIMEOUT on AbortError", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    vi.mocked(fetch).mockRejectedValueOnce(abortError);

    const result = await httpClient.get("/slow", { timeout: 100 });
    expect(result.error?.code).toBe("TIMEOUT");
  });
});

// ── Integration: full request flow ──────────────────────────────────────────

describe("httpClient query parameter serialization", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(mockResponse({ data: [], error: null }))));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("appends params as query string", async () => {
    await httpClient.get("/connectors", {
      params: { accountId: "acc-1", enterpriseId: "ent-2" },
    });

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    const parsed = new URL(url);
    expect(parsed.searchParams.get("accountId")).toBe("acc-1");
    expect(parsed.searchParams.get("enterpriseId")).toBe("ent-2");
  });

  it("omits undefined params", async () => {
    await httpClient.get("/credentials", {
      params: { accountId: "acc-1", enterpriseId: undefined },
    });

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    const parsed = new URL(url);
    expect(parsed.searchParams.get("accountId")).toBe("acc-1");
    expect(parsed.searchParams.has("enterpriseId")).toBe(false);
  });

  it("serializes boolean and number params", async () => {
    await httpClient.get("/items", {
      params: { active: true, limit: 50 },
    });

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    const parsed = new URL(url);
    expect(parsed.searchParams.get("active")).toBe("true");
    expect(parsed.searchParams.get("limit")).toBe("50");
  });

  it("includes /api prefix in the URL path", async () => {
    await httpClient.get("/accounts");

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    const parsed = new URL(url);
    expect(parsed.pathname).toContain("/api/accounts");
  });
});

describe("httpClient header merging", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(mockResponse({ data: null, error: null }))));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets Content-Type to application/json by default", async () => {
    await httpClient.get("/test");

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("includes Authorization header when token is available", async () => {
    vi.mocked(cognitoAuth.getTokens).mockReturnValue({
      idToken: "my-jwt-token",
      accessToken: "access",
      refreshToken: "refresh",
    });

    await httpClient.get("/protected");

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer my-jwt-token");

    vi.mocked(cognitoAuth.getTokens).mockReturnValue(null);
  });

  it("omits Authorization header when skipAuth is true", async () => {
    vi.mocked(cognitoAuth.getTokens).mockReturnValue({
      idToken: "my-jwt-token",
      accessToken: "access",
      refreshToken: "refresh",
    });

    await httpClient.get("/public", { skipAuth: true });

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.has("Authorization")).toBe(false);

    vi.mocked(cognitoAuth.getTokens).mockReturnValue(null);
  });

  it("merges custom headers without overriding defaults", async () => {
    await httpClient.get("/custom", {
      headers: { "X-Custom-Header": "custom-value" },
    });

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("X-Custom-Header")).toBe("custom-value");
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});

describe("httpClient request body serialization", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(mockResponse({ data: { id: "1" }, error: null }))));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends JSON-stringified body for POST requests", async () => {
    const payload = { name: "Test", category: "Plan" };
    await httpClient.post("/connectors", payload);

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(init.body).toBe(JSON.stringify(payload));
    expect(init.method).toBe("POST");
  });

  it("sends JSON-stringified body for PUT requests", async () => {
    const payload = { name: "Updated" };
    await httpClient.put("/connectors/123", payload);

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(init.body).toBe(JSON.stringify(payload));
    expect(init.method).toBe("PUT");
  });

  it("sends JSON-stringified body for PATCH requests", async () => {
    const payload = { status: "active" };
    await httpClient.patch("/credentials/456", payload);

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(init.body).toBe(JSON.stringify(payload));
    expect(init.method).toBe("PATCH");
  });

  it("does not send body for GET requests", async () => {
    await httpClient.get("/accounts");

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(init.body).toBeUndefined();
    expect(init.method).toBe("GET");
  });

  it("does not send body for DELETE requests", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, status: 204,
      json: () => Promise.reject(),
      headers: new Headers(),
    } as unknown as Response);

    await httpClient.delete("/items/1");

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(init.body).toBeUndefined();
    expect(init.method).toBe("DELETE");
  });
});

describe("httpClient setAuthToken (manual token override)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(mockResponse({ data: null, error: null }))));
  });
  afterEach(() => {
    httpClient.setAuthToken(null); // reset
    vi.restoreAllMocks();
  });

  it("uses manual token over Cognito token", async () => {
    vi.mocked(cognitoAuth.getTokens).mockReturnValue({
      idToken: "cognito-token",
      accessToken: "access",
      refreshToken: "refresh",
    });

    httpClient.setAuthToken("manual-override-token");
    await httpClient.get("/test");

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer manual-override-token");

    vi.mocked(cognitoAuth.getTokens).mockReturnValue(null);
  });

  it("reverts to Cognito token after setting null", async () => {
    httpClient.setAuthToken("temp-token");
    httpClient.setAuthToken(null);

    vi.mocked(cognitoAuth.getTokens).mockReturnValue({
      idToken: "cognito-token",
      accessToken: "access",
      refreshToken: "refresh",
    });

    await httpClient.get("/test");

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer cognito-token");

    vi.mocked(cognitoAuth.getTokens).mockReturnValue(null);
  });

  it("does not attempt 401 retry when manual token is set", async () => {
    httpClient.setAuthToken("bad-token");
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ message: "Unauthorized" }, { status: 401 }));

    const result = await httpClient.get("/protected");
    expect(result.error?.status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cognitoAuth.getSession).not.toHaveBeenCalled();
  });
});

describe("httpClient setBaseUrl", () => {
  const originalBase = "https://api.test.com";

  afterEach(() => {
    httpClient.setBaseUrl(originalBase); // restore
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(mockResponse({ data: null, error: null }))));
  });

  it("switches request URLs to the new base", async () => {
    httpClient.setBaseUrl("https://staging.example.com/dev");
    await httpClient.get("/accounts");

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain("https://staging.example.com/dev/api/accounts");
  });

  it("preserves stage prefix in base URL", async () => {
    httpClient.setBaseUrl("https://gw.example.com/prod");
    await httpClient.get("/connectors");

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain("/prod/api/connectors");
  });

  it("handles trailing slash in base URL", async () => {
    httpClient.setBaseUrl("https://api.example.com/");
    await httpClient.get("/items");

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toBe("https://api.example.com/api/items");
  });
});
