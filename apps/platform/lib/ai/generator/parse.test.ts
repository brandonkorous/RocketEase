import { describe, expect, it } from "vitest";
import { parseJson, parseObjectArray, str, strList } from "./parse";

describe("parseJson", () => {
  it("reads plain JSON", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("reads JSON out of a markdown fence", () => {
    expect(parseJson('Here you go:\n```json\n{"a":1}\n```\nHope that helps')).toEqual({ a: 1 });
  });

  it("reads JSON out of surrounding prose", () => {
    expect(parseJson('Sure! {"a":[1,2]} — let me know.')).toEqual({ a: [1, 2] });
  });

  it("tolerates a trailing comma", () => {
    expect(parseJson('{"a":1,}')).toEqual({ a: 1 });
  });

  it("is not fooled by braces inside strings", () => {
    expect(parseJson('{"a":"} not the end","b":2}')).toEqual({ a: "} not the end", b: 2 });
  });

  it("returns null rather than guessing when there is no JSON", () => {
    expect(parseJson("I can't help with that.")).toBeNull();
  });
});

describe("parseObjectArray", () => {
  it("accepts a bare array", () => {
    expect(parseObjectArray('[{"hook":"a"}]', "concepts")).toEqual([{ hook: "a" }]);
  });

  it("accepts the wrapped shape we asked for", () => {
    expect(parseObjectArray('{"concepts":[{"hook":"a"}]}', "concepts")).toEqual([{ hook: "a" }]);
  });

  it("rejects an array of non-objects", () => {
    expect(parseObjectArray('{"concepts":["just a string"]}', "concepts")).toBeNull();
  });

  it("rejects an empty list", () => {
    expect(parseObjectArray('{"concepts":[]}', "concepts")).toBeNull();
  });
});

describe("field readers", () => {
  it("never lets a non-string leak into copy", () => {
    expect(str({ hook: 42 }, "hook")).toBe("");
    expect(str({ hook: "  hi  " }, "hook")).toBe("hi");
  });

  it("reads hashtags from an array or a loose string, capped", () => {
    expect(strList({ t: ["a", "b", "c"] }, "t", 2)).toEqual(["a", "b"]);
    expect(strList({ t: "#a, #b" }, "t", 5)).toEqual(["#a", "#b"]);
    expect(strList({ t: null }, "t", 5)).toEqual([]);
  });
});
