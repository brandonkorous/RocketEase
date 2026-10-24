/** Run each job of a batch alone: one failure fails that job, not the batch. */
export async function runBatch<J extends { id: string }>(
  jobs: J[],
  runOne: (job: J) => Promise<void>,
  failJob: (job: J, err: unknown) => Promise<unknown>,
): Promise<void> {
  for (const job of jobs) {
    try {
      await runOne(job);
    } catch (err) {
      await failJob(job, err);
    }
  }
}
