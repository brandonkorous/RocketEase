/*
 * Signals a rule can read off a message without guessing: the links it
 * carries and the language it is written in. Pure; the worker's evaluation
 * and the builder's dry run share it, so a rule tests the way it runs.
 */
import { detect } from "tinyld";

const TLDS = "com|net|org|io|co|app|shop|store|me|ly|gg|xyz|info|biz|dev|link|to|tv|ai|us|uk|de|fr|es|it|nl|ca|au|in|br|ru|cn|jp|kr|eu|ch|se|no|dk|fi|pl|pt|mx|ar|za|ie|nz";
/** http(s)://…, www.…, or a bare host with a common ending (not the domain of an e-mail address), each with an optional path. */
const LINK_RE = new RegExp(`\\bhttps?://[^\\s<>"']+|\\bwww\\.[^\\s<>"']+|(?<![@\\w.-])(?:[a-z0-9-]+\\.)+(?:${TLDS})\\b(?:/[^\\s<>"']*)?`, "gi");
const TRAILING_PUNCTUATION = /[).,;:!?'"\]]+$/;

/** Every link in the text, as written, without the punctuation that followed it. */
export function findLinks(text: string): string[] {
  const found = (text.match(LINK_RE) ?? []).map((l) => l.replace(TRAILING_PUNCTUATION, "")).filter(Boolean);
  return [...new Set(found)];
}

export const hasLink = (text: string) => findLinks(text).length > 0;

/** Lower-case hosts of the links, without a leading www. — what a "link host is one of" rule compares against. */
export function linkHosts(text: string): string[] {
  const hosts = findLinks(text).map((l) => {
    try {
      return new URL(/^https?:\/\//i.test(l) ? l : `https://${l}`).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return "";
    }
  });
  return [...new Set(hosts.filter(Boolean))];
}

/** Below this many letters the detector is guessing, and a guess is worse than "not sure". */
const MIN_LETTERS = 12;

/** ISO 639-1 code of the language the text is written in, or "" when there is not enough text to say. */
export function detectLanguage(text: string): string {
  const words = text.replace(LINK_RE, " ");
  const letters = words.replace(/[^\p{L}]/gu, "");
  if (letters.length < MIN_LETTERS) return "";
  const code = detect(words);
  return typeof code === "string" ? code : "";
}
