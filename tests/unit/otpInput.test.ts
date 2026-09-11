import { describe, expect, it } from "vitest";
import { readOtpInputDigits } from "@/lib/otpInput";

describe("segmented OTP input editing", () => {
  it.each(["19", "91", "9"])("uses only the typed replacement digit from raw %s", (raw) => {
    expect(readOtpInputDigits(raw, { inputType: "insertText", data: "9" })).toBe("9");
  });

  it("does not emit an unchanged full code after a nonnumeric keystroke", () => {
    expect(readOtpInputDigits("1x", { inputType: "insertText", data: "x" })).toBeNull();
  });

  it.each([
    { inputType: "insertReplacementText", data: "123456" },
    { inputType: "insertReplacementText", data: null },
    { inputType: "insertText", data: "123456" },
    { inputType: "insertFromPaste", data: null },
    {},
  ])("preserves all six autofilled or pasted digits for %j", (change) => {
    expect(readOtpInputDigits("123456", change)).toBe("123456");
  });

  it("retains deletion and formatted full-code normalization", () => {
    expect(readOtpInputDigits("", { inputType: "deleteContentBackward", data: null })).toBe("");
    expect(readOtpInputDigits("123 456", { inputType: "insertReplacementText", data: null })).toBe("123456");
  });
});
