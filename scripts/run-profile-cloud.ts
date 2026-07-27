import { prisma } from "../src/db/prisma/client";
import { runCloudProfileOperation } from "../src/jobs/cloud-profile";
import { executeProfileCli } from "../src/jobs/profile-cli";

async function main(): Promise<void> {
  process.exitCode = await executeProfileCli(process.argv.slice(2), {
    run: runCloudProfileOperation,
    disconnect: () => prisma.$disconnect(),
    writeResult: (result) => console.log(JSON.stringify(result))
  });
}

void main();
