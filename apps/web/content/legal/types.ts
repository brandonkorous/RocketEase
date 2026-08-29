/** Block vocabulary for legal documents. Strings accept `**bold**` and `[label](href)`. */
export type Block =
  | string
  | { list: string[]; ordered?: boolean }
  | { table: { head: string[]; rows: string[][] } }
  | { note: string };

export type LegalSection = { id: string; heading: string; blocks: Block[] };

export type LegalDoc = {
  slug: string;
  /** Footer/menu label. */
  title: string;
  /** <h1> and <title>; may be longer than `title`. */
  heading: string;
  lede: string;
  updated: string;
  sections: LegalSection[];
};
