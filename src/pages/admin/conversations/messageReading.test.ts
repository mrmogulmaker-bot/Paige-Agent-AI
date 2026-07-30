import { describe, expect, it } from "vitest";
import { readableMessageBody, shouldFoldEmail } from "./messageReading";

describe("readableMessageBody", () => {
  it("preserves plain-text paragraphs", () => {
    expect(readableMessageBody({ body_text: "Hello\n\nSecond paragraph" }))
      .toBe("Hello\n\nSecond paragraph");
  });

  it("converts HTML blocks to safe readable text without rendering markup", () => {
    expect(readableMessageBody({
      body_html: '<p>Hello</p><p>Second<br>line</p><script>alert(1)</script>',
    })).toBe("Hello\nSecond\nline\nalert(1)");
  });
});

describe("shouldFoldEmail", () => {
  it("folds long email content", () => {
    expect(shouldFoldEmail("email", "x".repeat(901))).toBe(true);
  });

  it("leaves short email and SMS fully visible", () => {
    expect(shouldFoldEmail("email", "Short email")).toBe(false);
    expect(shouldFoldEmail("sms", "x".repeat(1200))).toBe(false);
  });
});
