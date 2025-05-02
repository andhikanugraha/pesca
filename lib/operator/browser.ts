import { type BrowserContext, chromium, type Page } from "playwright";

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

export interface DisposablePage extends Page {
  [Symbol.asyncDispose](): Promise<void>;
}

function launchPersistentContext(profilePath: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(profilePath, {
    channel: "chrome",
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--hide-crash-restore-bubble",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
  });
}

export function createBrowserContext(
  { profilePath }: { profilePath: string },
) {
  let context: BrowserContext | null;
  return {
    async createPage() {
      if (!context) context = await launchPersistentContext(profilePath);
      const page = await context.newPage();
      hideApp("Google Chrome");
      page[Symbol.asyncDispose] = () => page.close();
      return page as DisposablePage;
    },
    async [Symbol.asyncDispose]() {
      if (context) await context.close();
    },
  };
}
