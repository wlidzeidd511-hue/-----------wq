import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { apiRateLimit, csrfGuard, resetRequestSecurityForTests } from "./requestSecurity";

function mockResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    headers: new Map<string, string>(),
    setHeader(name: string, value: string) { this.headers.set(name, value); return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  return response as unknown as Response & typeof response;
}

function mockRequest(input: Partial<Request> & { headers?: Request["headers"] } = {}) {
  return {
    method: "POST",
    originalUrl: "/api/trpc/orders.updateDetails",
    headers: { host: "hatfaltmyez.com", origin: "https://hatfaltmyez.com", "content-type": "application/json", ...input.headers },
    socket: { remoteAddress: "127.0.0.44" },
    ...input,
  } as Request;
}

describe("request security middleware", () => {
  beforeEach(() => resetRequestSecurityForTests());

  it("rejects cross-site and mismatched-origin writes", () => {
    const crossSiteResponse = mockResponse();
    csrfGuard(mockRequest({ headers: { host: "hatfaltmyez.com", origin: "https://evil.example", "content-type": "application/json", "sec-fetch-site": "cross-site" } }), crossSiteResponse, vi.fn() as NextFunction);
    expect(crossSiteResponse.statusCode).toBe(403);

    const mismatchedResponse = mockResponse();
    csrfGuard(mockRequest({ headers: { host: "hatfaltmyez.com", origin: "https://evil.example", "content-type": "application/json" } }), mismatchedResponse, vi.fn() as NextFunction);
    expect(mismatchedResponse.statusCode).toBe(403);
  });

  it("allows same-origin JSON writes and rejects form posts", () => {
    const allowedResponse = mockResponse();
    const next = vi.fn();
    csrfGuard(mockRequest(), allowedResponse, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();

    const formResponse = mockResponse();
    csrfGuard(mockRequest({ headers: { host: "hatfaltmyez.com", origin: "https://hatfaltmyez.com", "content-type": "application/x-www-form-urlencoded" } }), formResponse, vi.fn() as NextFunction);
    expect(formResponse.statusCode).toBe(415);
  });

  it("limits repeated write requests from the same network", () => {
    let finalResponse = mockResponse();
    for (let attempt = 0; attempt < 181; attempt += 1) {
      finalResponse = mockResponse();
      apiRateLimit(mockRequest(), finalResponse, vi.fn() as NextFunction);
    }
    expect(finalResponse.statusCode).toBe(429);
    expect(finalResponse.headers.get("Retry-After")).toBeTruthy();
  });
});
