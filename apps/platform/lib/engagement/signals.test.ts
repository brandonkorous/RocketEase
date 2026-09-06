import { describe, expect, it } from "vitest";
import { detectLanguage, findLinks, hasLink, linkHosts } from "./signals";

describe("findLinks / linkHosts", () => {
  it("finds full URLs, www hosts and bare domains, and drops the punctuation after them", () => {
    expect(findLinks("check https://bit.ly/abc!")).toEqual(["https://bit.ly/abc"]);
    expect(findLinks("go to www.example.com/deal, now")).toEqual(["www.example.com/deal"]);
    expect(findLinks("see example.com (today).")).toEqual(["example.com"]);
    expect(findLinks("Buy at Shop.Example.COM/sale and shop.example.com/sale")).toHaveLength(2);
  });

  it("does not read decimals, abbreviations or e-mail addresses as links", () => {
    expect(findLinks("e.g. the price is 1.5 today")).toEqual([]);
    expect(findLinks("mail me@example.com about it")).toEqual([]);
    expect(hasLink("Love this! 🔥")).toBe(false);
  });

  it("reports lower-case hosts without www., once each", () => {
    expect(linkHosts("https://www.Example.com/x and bit.ly/z and http://bit.ly/q")).toEqual(["example.com", "bit.ly"]);
  });
});

describe("detectLanguage", () => {
  it("names the language of a sentence and stays blank when there is not enough text", () => {
    expect(detectLanguage("Where is my order? It has been three weeks now and nobody answers.")).toBe("en");
    expect(detectLanguage("Hola, quiero devolver mi pedido porque llegó roto y nadie contesta.")).toBe("es");
    expect(detectLanguage("🔥🔥🔥")).toBe("");
    expect(detectLanguage("ok")).toBe("");
    expect(detectLanguage("https://example.com/only-a-link")).toBe("");
  });
});
