import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  isValidEmailList,
  parseEmailList,
  validateOptionalEmailList,
  validateOutgoingRecipients,
  validateRequiredEmail,
} from "./email-validation";

describe("email-validation", () => {
  it("accepts common valid addresses", () => {
    expect(isValidEmail("naam@voorbeeld.nl")).toBe(true);
    expect(isValidEmail("  user.name+tag@example.com  ")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("@missing.local")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("user@domain")).toBe(false);
  });

  it("parses comma and semicolon recipient lists", () => {
    expect(parseEmailList("a@x.nl, b@y.nl; c@z.nl")).toEqual([
      "a@x.nl",
      "b@y.nl",
      "c@z.nl",
    ]);
  });

  it("validates optional cc/bcc lists", () => {
    expect(validateOptionalEmailList("")).toBeNull();
    expect(validateOptionalEmailList("a@x.nl, b@y.nl")).toBeNull();
    expect(validateOptionalEmailList("bad-address")).toBe(
      "Ongeldig e-mailadres in CC/BCC"
    );
  });

  it("validates outgoing recipient fields", () => {
    expect(validateOutgoingRecipients({ to: "user@example.com" })).toBeNull();
    expect(validateOutgoingRecipients({ to: "invalid", cc: "a@b.nl" })).toBe(
      "Geldig e-mailadres verplicht"
    );
    expect(
      validateOutgoingRecipients({ cc: "a@b.nl", bcc: "oops" }, { requireTo: false })
    ).toBe("Ongeldig e-mailadres in CC/BCC");
    expect(validateRequiredEmail("x@y.nl")).toBeNull();
    expect(isValidEmailList("a@b.nl, broken")).toBe(false);
  });
});
