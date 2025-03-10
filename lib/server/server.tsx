import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { relative, resolve } from "@std/path";
import { type ReactNode } from "hono/jsx";

import type { Operator } from "../operator/operator.ts";

function serveFile(path: string) {
  const relativePath = relative(
    Deno.cwd(),
    resolve(import.meta.dirname || "", path),
  );
  return serveStatic({ path: relativePath });
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <title>pesca</title>
      <link rel="stylesheet" href="/sakura.css" />
      <h1>pesca</h1>
      {children}
    </>
  );
}

function PullButton() {
  return (
    <form action="/pull" method="post">
      <p>
        <button
          type="submit"
          style="font-size: 1.2em; padding-left: 2em; padding-right: 2em;"
        >
          Pull
        </button>
      </p>
    </form>
  );
}

export default function createServer(
  { operator }: { operator: Operator },
): Hono {
  const app = new Hono();

  app.get("/sakura.css", serveFile("sakura.css"));
  app.use(async (c, next) => {
    c.setRenderer((content) =>
      c.html(
        "<!doctype html>\n" + <Layout>{content as ReactNode}</Layout>,
      )
    );
    await next();
  });

  app.get("/", (c) => c.render(<PullButton />));

  // Operator commands
  app.post("/pull", async (c) => {
    const success = await operator.pull();
    if (success) {
      return c.render(
        <>
          <p>✅ Pulling was successful.</p>
          <PullButton />
        </>,
      );
    } else {
      return c.render(
        <>
          <p>❌ Pulling was not successful.</p>
          <PullButton />
        </>,
      );
    }
  });

  return app;
}
