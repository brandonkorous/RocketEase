import { describe, expect, it } from "vitest";
import { SCAN_HEAD_BYTES, SCAN_TAIL_BYTES, credentialForDerived, credentialForOutput, scanForCredential } from "./c2pa";

/** A JUMBF superbox shaped like a real one: jumb → jumd → UUID → toggle → label. */
function jumbf(label = "c2pa"): Buffer {
  const uuid = Buffer.alloc(16, 0x11);
  const name = Buffer.concat([Buffer.from(label, "ascii"), Buffer.from([0])]);
  const jumd = Buffer.concat([Buffer.alloc(4), Buffer.from("jumd"), uuid, Buffer.from([0x03]), name]);
  jumd.writeUInt32BE(jumd.length, 0);
  const jumb = Buffer.concat([Buffer.alloc(4), Buffer.from("jumb"), jumd, Buffer.from("manifest-store-payload")]);
  jumb.writeUInt32BE(jumb.length, 0);
  return jumb;
}

const noise = (n: number) => Buffer.alloc(n, 0x7f);
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("scanForCredential", () => {
  it("finds a manifest and says where it is", () => {
    const buf = Buffer.concat([PNG_HEADER, noise(500), jumbf(), noise(500)]);
    const scan = scanForCredential(buf);
    expect(scan.present).toBe(true);
    expect(scan.at).toBe(512); // the `jumb` marker, four bytes into the box
    expect(scan.bounded).toBe(false);
  });

  it("finds nothing in an ordinary file", () => {
    expect(scanForCredential(Buffer.concat([PNG_HEADER, noise(4096)]))).toMatchObject({ present: false, at: null });
  });

  it("does NOT fire on the word jumb alone — precision is the point", () => {
    expect(scanForCredential(Buffer.concat([noise(50), Buffer.from("jumb"), noise(200)])).present).toBe(false);
  });

  it("does NOT fire on a JUMBF box that is not a C2PA one", () => {
    expect(scanForCredential(Buffer.concat([noise(50), jumbf("cbor"), noise(50)])).present).toBe(false);
  });

  it("keeps looking past a JUMBF box that isn't the one", () => {
    const buf = Buffer.concat([jumbf("cbor"), noise(100), jumbf("c2pa")]);
    expect(scanForCredential(buf).present).toBe(true);
  });

  it("finds a manifest at the END of a large file — MP4 puts it there", () => {
    const buf = Buffer.concat([noise(SCAN_HEAD_BYTES + SCAN_TAIL_BYTES + 1000), jumbf()]);
    const scan = scanForCredential(buf);
    expect(scan.present).toBe(true);
    expect(scan.bounded).toBe(true);
  });

  it("admits when it only read the ends, so 'absent' is not overstated", () => {
    const middle = Buffer.concat([noise(SCAN_HEAD_BYTES + 10), jumbf(), noise(SCAN_TAIL_BYTES + 10)]);
    const scan = scanForCredential(middle);
    expect(scan).toMatchObject({ present: false, bounded: true });
  });
});

describe("credentialForOutput", () => {
  it("records what the FILE has, not what the model claimed", () => {
    expect(credentialForOutput(noise(200), true)).toEqual({
      state: "absent",
      mismatch: "the model claims content credentials, but none is present in the file",
    });
  });

  it("reports the other direction too — an unclaimed credential is still a finding", () => {
    const r = credentialForOutput(Buffer.concat([noise(20), jumbf()]), false);
    expect(r.state).toBe("signed");
    expect(r.mismatch).toContain("doesn't claim");
  });

  it("says nothing when the claim and the file agree", () => {
    expect(credentialForOutput(Buffer.concat([noise(20), jumbf()]), true).mismatch).toBeNull();
    expect(credentialForOutput(noise(200), false).mismatch).toBeNull();
  });

  it("names the bounded scan rather than asserting a bare absence", () => {
    const big = noise(SCAN_HEAD_BYTES + SCAN_TAIL_BYTES + 1000);
    expect(credentialForOutput(big, true).mismatch).toContain("only the start and end");
  });
});

describe("credentialForDerived", () => {
  it("records a signed source that came out bare as STRIPPED", () => {
    expect(credentialForDerived(noise(200), "signed")).toBe("stripped");
  });

  it("keeps stripped once stripped — the credential does not come back", () => {
    expect(credentialForDerived(noise(200), "stripped")).toBe("stripped");
  });

  it("does not invent a loss for a source that never had one", () => {
    expect(credentialForDerived(noise(200), "absent")).toBe("absent");
    expect(credentialForDerived(noise(200), undefined)).toBe("absent");
  });

  it("believes the output when the manifest actually survived", () => {
    expect(credentialForDerived(Buffer.concat([noise(20), jumbf()]), "signed")).toBe("signed");
  });
});
