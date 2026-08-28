import "dotenv/config";
import { db } from "@/db";
import { emit } from "@/lib/jobs/outbox";

async function main() {
  await emit(db, "mail.send", {
    to: "owner@example.test",
    template: "auth.verify",
    data: { name: "Test Owner", url: "http://localhost:5001/verify?token=demo" },
  });
  console.log("queued");
  process.exit(0);
}
void main();
