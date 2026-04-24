import { describe, expect, test } from "bun:test";
import { coderLoginUrl, coderUsernameFromName, deriveEmail, emailOptions } from "../src/domain/email";
import { findNameMatches } from "../src/domain/fuzzy";
import { parsePeopleCsv } from "../src/domain/csv";
import { ipv4Allowed } from "../src/domain/ip";

describe("email derivation", () => {
  test("builds supported group-domain options", () => {
    expect(emailOptions("Ada", "Lovelace", "student.example.com")).toEqual({
      "first.last": "ada.lovelace@student.example.com",
      firstlast: "adalovelace@student.example.com",
      "f.lastname": "a.lovelace@student.example.com"
    });
  });

  test("prefers valid custom personal email when chosen", () => {
    expect(
      deriveEmail({
        firstName: "Ada",
        lastName: "Lovelace",
        domain: "student.example.com",
        mode: "custom",
        customEmail: "Ada@Example.com"
      })
    ).toBe("ada@example.com");
  });

  test("normalizes Coder login URL", () => {
    expect(coderLoginUrl("https://coder.example.com/")).toBe("https://coder.example.com/login");
  });

  test("builds Coder usernames from first and last name", () => {
    expect(coderUsernameFromName("Ada", "Lovelace")).toBe("ada-lovelace");
  });

  test("normalizes Coder usernames from complex names", () => {
    expect(coderUsernameFromName("Mary Jane", "O'Neil-Smith")).toBe("maryjane-oneilsmith");
  });
});

describe("fuzzy matching", () => {
  test("finds capitalization and spelling-near matches", () => {
    const matches = findNameMatches("Ada", "Love lace", [
      { id: "1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", lastLoginAt: null },
      { id: "2", firstName: "Grace", lastName: "Hopper", email: "grace@example.com", lastLoginAt: null }
    ]);

    expect(matches[0]?.id).toBe("1");
    expect(matches[0]?.score).toBeGreaterThanOrEqual(86);
  });
});

describe("csv imports", () => {
  test("parses headered first and last name rows", () => {
    expect(parsePeopleCsv("first,last\nAda,Lovelace\nGrace,Hopper")).toEqual([
      { firstName: "Ada", lastName: "Lovelace" },
      { firstName: "Grace", lastName: "Hopper" }
    ]);
  });
});

describe("IPv4 allowlist", () => {
  test("accepts exact and cidr entries", () => {
    expect(ipv4Allowed("192.168.1.5", ["192.168.1.0/24"])).toBe(true);
    expect(ipv4Allowed("10.0.0.8", ["10.0.0.8"])).toBe(true);
    expect(ipv4Allowed("10.0.0.9", ["10.0.0.8"])).toBe(false);
  });
});
