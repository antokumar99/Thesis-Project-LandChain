import { app } from "./app";
import { connectDB } from "./config/db";
import { env } from "./config/env";
import { seedAuthority } from "./services/auth.service";
import { logger } from "./utils/logger.util";

async function main() {
  await connectDB();
  await seedAuthority();
  app.listen(env.port, () => logger.info(`LandChain API listening on http://localhost:${env.port}`));
}

main().catch((error) => {
  logger.error("Failed to start API", error);
  process.exit(1);
});
