import type { JobPayloads } from "@/lib/jobs/queues";
import { deliverMail } from "@/lib/mail";
import type { HandlerContext } from "./index";

export async function sendMailJob(data: JobPayloads["mail.send"], ctx: HandlerContext) {
  await deliverMail({ to: data.to, template: data.template, data: data.data, replyTo: data.replyTo });
  ctx.log.info("mail delivered", { template: data.template, organizationId: data.organizationId });
}
