import nodemailer from "nodemailer";
import { afterEach, describe, expect, it } from "vitest";
import { deliverMail, setMailTransport } from "./mail";

const stream = () => nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
const data = { name: "Ada", url: "https://app.rocketease.com/verify?t=abc" };

afterEach(() => setMailTransport(undefined));

describe("deliverMail through nodemailer", () => {
  it("builds a multipart message with the prod options", async () => {
    const t = stream();
    let info: { envelope: { from: string; to: string[] }; message: Buffer } | undefined;
    const send = t.sendMail.bind(t);
    t.sendMail = (async (o: never) => (info = (await send(o)) as never)) as never;
    setMailTransport(t);
    await deliverMail({ to: "ada@example.com", template: "auth.verify", data, replyTo: "help@example.com" });
    const raw = info!.message.toString();
    expect(info!.envelope.to).toEqual(["ada@example.com"]);
    expect(raw).toContain("To: ada@example.com");
    expect(raw).toContain("Reply-To: help@example.com");
    expect(raw).toMatch(/^From: .*no-reply@rocketease\.local/m);
    expect(raw).toContain("Subject: Verify your email for");
    expect(raw).toContain("multipart/alternative");
    expect(raw).toContain("Content-Type: text/plain");
    expect(raw).toContain("Content-Type: text/html");
    expect(raw).toContain("app.rocketease.com/verify");
  });

  it("logs and skips when no transport is configured", async () => {
    setMailTransport(null);
    await expect(deliverMail({ to: "a@b.co", template: "auth.verify", data })).resolves.toBeUndefined();
  });

  it("rejects an unknown template", async () => {
    await expect(deliverMail({ to: "a@b.co", template: "nope", data })).rejects.toThrow("Unknown mail template");
  });
});
