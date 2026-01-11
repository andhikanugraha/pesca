import { type BrowserContext, chromium, type Page } from "playwright";

export interface DisposablePage extends Page {
  [Symbol.asyncDispose](): Promise<void>;
}

function launchPersistentContext(profilePath: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(profilePath, {
    channel: "chrome",
    headless: false,
    args: [
      // "--disable-blink-features=AutomationControlled",
      // "--hide-crash-restore-bubble",
    ],
    // ignoreDefaultArgs: ["--enable-automation"],
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
      page[Symbol.asyncDispose] = () => page.close();
      return page as DisposablePage;
    },
    async [Symbol.asyncDispose]() {
      if (context) await context.close();
    },
  };
}
