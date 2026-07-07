import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateSource } from "./validate";

const ex = (name: string) =>
  readFileSync(resolve(__dirname, "../../examples", `${name}.slide`), "utf8");

describe("validateSource", () => {
  it("passes the shipped example deck with zero errors", () => {
    const r = validateSource(ex("migration-plan"));
    expect(r.ok, "migration-plan should be valid").toBe(true);
    expect(r.counts.errors).toBe(0);
  });

  it("flags an unknown theme as a deck-level error", () => {
    const r = validateSource(`theme: nope\n---\n# Hi`);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "unknown-theme" && i.slide === 0)).toBe(true);
  });

  it("flags an unknown layout as an error on the right slide", () => {
    const r = validateSource(
      `theme: minimal\n---\n# A\n---\n\`\`\`layout\nname: threeup\n\`\`\`\n# B`,
    );
    const issue = r.issues.find((i) => i.code === "unknown-layout");
    expect(issue?.slide).toBe(2);
    expect(r.ok).toBe(false);
  });

  it("reports an unknown hint as a (non-fatal) warning, not an error", () => {
    const r = validateSource(`theme: minimal\n---\n# Hi {.gigantic}`);
    expect(r.counts.warnings).toBeGreaterThan(0);
    expect(r.counts.errors).toBe(0);
    expect(r.ok).toBe(true); // warnings don't make a deck invalid
  });

  it("rejects a malformed aspect ratio", () => {
    const r = validateSource(`theme: minimal\naspect: widescreen\n---\n# Hi`);
    expect(r.issues.some((i) => i.code === "bad-aspect")).toBe(true);
    expect(r.ok).toBe(false);
  });

  it("warns on a raw-HTML block", () => {
    const r = validateSource(`theme: minimal\n---\n<div>raw</div>`);
    expect(r.issues.some((i) => i.code === "raw-html")).toBe(true);
  });

  it("returns stable machine codes for every issue", () => {
    const r = validateSource(`theme: x\n---\n\`\`\`layout\nname: y\n\`\`\`\n# Hi {.z}`);
    for (const i of r.issues) {
      expect(typeof i.code).toBe("string");
      expect(i.code.length).toBeGreaterThan(0);
    }
  });
});
