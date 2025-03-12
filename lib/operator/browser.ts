import { chromium, type Page } from "playwright";

export type WithPage = (ffn: (page: Page) => Promise<void>) => Promise<void>;
export type FunctionWithPage = (withPage: WithPage) => Promise<void>;

function hideApp(appName: string) {
  const scpt = `
  tell application "System Events" to \
  set visible of application process "${appName}" to false`;

  try {
    const command = new Deno.Command("osascript", {
      args: ["-e", scpt],
    });
    command.spawn();
  } catch (_e) {
    // do nothing
  }
}

export async function withBrowserContext(
  { profilePath }: { profilePath: string },
  fn: FunctionWithPage,
): Promise<void> {
  const context = await chromium.launchPersistentContext(profilePath, {
    channel: "chrome",
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--hide-crash-restore-bubble",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
  });

  const results = await fn(async function withPage(
    ffn: (page: Page) => Promise<void>,
  ) {
    const page = await context.newPage();
    hideApp("Google Chrome");
    await ffn(page);
    await page.close();
  });

  // Gracefully close
  await context.close();

  return results;
}
