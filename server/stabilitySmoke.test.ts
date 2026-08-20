import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");
const readProjectFile = (relativePath: string) => readFileSync(resolve(projectRoot, relativePath), "utf8");

describe("repeatable stability smoke", () => {
  it("covers public, staff, customer, owner-entry, contact, and optional invoice routes without writes", () => {
    const script = readProjectFile("scripts/stability-smoke.sh");
    expect(script).toContain('ITERATIONS="${ITERATIONS:-12}"');
    expect(script).toContain('"/track"');
    expect(script).toContain('"/team"');
    expect(script).toContain('"/account"');
    expect(script).toContain('"/dashboard/control"');
    expect(script).toContain('"/contact"');
    expect(script).toContain('routes+=("/invoice/$INVOICE_TOKEN")');
    expect(script).toContain("curl --location --silent --show-error");
    expect(script).not.toMatch(/--request\s+(POST|PUT|PATCH|DELETE)/);
  });

  it("is available as a package command", () => {
    const packageJson = JSON.parse(readProjectFile("package.json")) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.["stability:smoke"]).toBe("bash scripts/stability-smoke.sh");
  });
});
