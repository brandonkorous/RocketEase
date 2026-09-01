/*
 * Frame one of the video. Getting this wrong is visible to every viewer.
 */
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { fitReference, padColour, FALLBACK_PAD } from "./reference-fit";

const square = (size = 400, colour = { r: 200, g: 30, b: 30 }) =>
  sharp({ create: { width: size, height: size, channels: 3, background: colour } }).png().toBuffer();

describe("padColour", () => {
  it("reads a brand hex, with or without the hash", () => {
    expect(padColour("#6a39ff")).toMatchObject({ r: 106, g: 57, b: 255 });
    expect(padColour("6a39ff")).toMatchObject({ r: 106, g: 57, b: 255 });
  });

  it("falls back rather than throwing on junk, because a bad hex must not fail a paid job", () => {
    expect(padColour("not-a-colour")).toEqual(padColour(FALLBACK_PAD));
    expect(padColour(undefined)).toEqual(padColour(FALLBACK_PAD));
  });
});

describe("fitReference", () => {
  it("produces EXACTLY the requested size — Sora refuses anything else", async () => {
    const out = await fitReference({ bytes: await square(), width: 720, height: 1280 });
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([720, 1280]);
  });

  it("contains rather than crops, so a product never loses its edges", async () => {
    // A square fitted to portrait must letterbox: the middle row keeps the
    // product, the top row is padding. Cover would fill and cut the sides off.
    const out = await fitReference({ bytes: await square(), width: 720, height: 1280, padHex: "#6a39ff" });
    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => [data[(y * 720 + x) * 3], data[(y * 720 + x) * 3 + 1], data[(y * 720 + x) * 3 + 2]];
    expect(at(360, 10)).toEqual([106, 57, 255]);   // brand pad at the top
    expect(at(360, 640)).toEqual([200, 30, 30]);   // product through the middle
  });

  it("pads in the brand colour, not black", async () => {
    const out = await fitReference({ bytes: await square(), width: 720, height: 1280, padHex: "#00c2a8" });
    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([0, 194, 168]);
  });
});
