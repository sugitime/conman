import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { execSync } from "child_process";
import { AppModule } from "./app.module";

function prepareDatabase() {
  if (process.env.SKIP_DB_PREPARE === "1") return;
  try {
    // eslint-disable-next-line no-console
    console.log("Preparing database schema...");
    execSync("npx prisma db push --accept-data-loss", {
      stdio: "inherit",
      env: process.env,
    });
    try {
      execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env: process.env });
    } catch {
      // eslint-disable-next-line no-console
      console.warn("Seed skipped or failed (non-fatal)");
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Database prepare failed:", err);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  const origin = process.env.CORS_ORIGIN || "http://localhost:5173";
  app.enableCors({
    origin: origin.split(",").map((s) => s.trim()),
    credentials: true,
  });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  const port = Number(process.env.PORT || 4000);
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`ConMan API listening on :${port}`);

  setImmediate(() => prepareDatabase());
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal bootstrap error:", err);
  process.exit(1);
});
