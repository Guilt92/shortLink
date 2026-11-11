import { describe, expect, it } from "vitest";
import { isValidHttpUrl, passwordStrength, percentChange } from "./utils";

describe("percentChange", () => {
  it("returns null when there is no previous data (never invents a trend)", () => {
    expect(percentChange(10, 0)).toBeNull();
  });
  it("computes relative change", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
  });
});

describe("isValidHttpUrl", () => {
  it("accepts http(s) only", () => {
    expect(isValidHttpUrl("https://example.com/a")).toBe(true);
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isValidHttpUrl("example.com")).toBe(false);
  });
});

describe("passwordStrength", () => {
  it("ranks passwords", () => {
    expect(passwordStrength("abc").score).toBeLessThan(passwordStrength("Abcdefgh12!x").score);
    expect(passwordStrength("Abcdefgh12!x").label).toBe("Strong");
  });
});
