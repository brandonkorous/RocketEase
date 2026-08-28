import { describe, expect, it } from "vitest";
import { boolTerm, parsePaging, parseScimFilter, stringTerm } from "./filter";
import { ScimError } from "./errors";

describe("SCIM filter parser", () => {
  it("parses the userName lookup every IdP sends", () => {
    expect(parseScimFilter('userName eq "ada@acme.com"')).toEqual([{ attr: "username", op: "eq", value: "ada@acme.com" }]);
  });

  it("is case-insensitive on attribute and operator", () => {
    expect(parseScimFilter('UserName EQ "a@b.co"')[0]).toEqual({ attr: "username", op: "eq", value: "a@b.co" });
  });

  it("drops a schema URN prefix", () => {
    const [term] = parseScimFilter('urn:ietf:params:scim:schemas:core:2.0:User:userName eq "a@b.co"');
    expect(term.attr).toBe("username");
  });

  it("parses booleans unquoted", () => {
    expect(parseScimFilter("active eq false")).toEqual([{ attr: "active", op: "eq", value: false }]);
  });

  it("joins terms with and", () => {
    const terms = parseScimFilter('userName eq "ada@acme.com" and active eq true');
    expect(terms).toHaveLength(2);
    expect(stringTerm(terms, "userName")).toBe("ada@acme.com");
    expect(boolTerm(terms, "active")).toBe(true);
  });

  it("does not split on `and` inside a quoted value", () => {
    const terms = parseScimFilter('displayName eq "sales and marketing"');
    expect(terms).toEqual([{ attr: "displayname", op: "eq", value: "sales and marketing" }]);
  });

  it("unescapes quotes inside a value", () => {
    expect(parseScimFilter('userName eq "a\\"b"')[0].value).toBe('a"b');
  });

  it("treats an empty or missing filter as no terms", () => {
    expect(parseScimFilter(null)).toEqual([]);
    expect(parseScimFilter("   ")).toEqual([]);
  });

  it("rejects operators it cannot honour rather than returning everything", () => {
    for (const bad of ['userName co "a"', 'userName eq "a" or userName eq "b"', '(userName eq "a")', "userName pr"]) {
      expect(() => parseScimFilter(bad)).toThrow(ScimError);
    }
  });

  it("rejects an unterminated string", () => {
    expect(() => parseScimFilter('userName eq "a')).toThrow(ScimError);
  });

  it("returns 400 invalidFilter on the error", () => {
    try {
      parseScimFilter('userName sw "a"');
      expect.unreachable();
    } catch (e) {
      expect((e as ScimError).status).toBe(400);
      expect((e as ScimError).scimType).toBe("invalidFilter");
    }
  });
});

describe("SCIM paging", () => {
  const paging = (qs: string) => parsePaging(new URLSearchParams(qs), 200, 50);

  it("defaults to the first page", () => {
    expect(paging("")).toEqual({ startIndex: 1, count: 50, offset: 0 });
  });

  it("is 1-based", () => {
    expect(paging("startIndex=51&count=25")).toEqual({ startIndex: 51, count: 25, offset: 50 });
  });

  it("clamps a count above the maximum and a startIndex below 1", () => {
    expect(paging("startIndex=0&count=9999")).toEqual({ startIndex: 1, count: 200, offset: 0 });
  });

  it("allows count=0 for a bare total", () => {
    expect(paging("count=0").count).toBe(0);
  });

  it("ignores junk", () => {
    expect(paging("startIndex=abc&count=xyz")).toEqual({ startIndex: 1, count: 50, offset: 0 });
  });
});
