import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { relative, resolve } from "@std/path";
import { type ReactNode } from "hono/jsx";

import { Scheduler } from "../scheduler.ts";

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

function Commands() {
  return (
    <>
      <form action="/run" method="post" id="run-form" />
      <form action="/abort" method="post" id="abort-form" />
      <p>
        <button
          type="submit"
          style="font-size: 1.2em; padding-left: 2em; padding-right: 2em; margin-right: 1em"
          form="run-form"
        >
          Run
        </button>
        &nbsp;
        <button
          type="submit"
          style="font-size: 1.2em; padding-left: 2em; padding-right: 2em;"
          form="abort-form"
        >
          Abort
        </button>
      </p>
    </>
  );
}

function Time({ children }: { children?: Temporal.ZonedDateTime }) {
  if (!children) {
    return <time />;
  }

  const datetime = children.toString({ timeZoneName: "never" });
  const text = children.toLocaleString();
  return <time datetime={datetime}>{text}</time>;
}

export default function createServer(
  { scheduler }: { scheduler: Scheduler },
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

  app.get("/", (c) =>
    c.render(
      <>
        <p>
          Next: <Time>{scheduler.nextOccurrence}</Time>
        </p>
        {scheduler.lastSuccessfulOccurrence && (
          <p>
            Last successful occurrence:{" "}
            <Time>{scheduler.lastSuccessfulOccurrence}</Time>
          </p>
        )}
        {scheduler.lastFailedOccurrence && (
          <p>
            Last successful occurrence:{" "}
            <Time>{scheduler.lastFailedOccurrence}</Time>
          </p>
        )}
        <Commands />,
      </>,
    ));

  // Operator commands
  app.post("/run", async (c) => {
    const success = await scheduler.run();
    if (success) {
      return c.render(
        <>
          <p>✅ Pulling was successful.</p>
          <Commands />
        </>,
      );
    } else {
      return c.render(
        <>
          <p>❌ Pulling was not successful.</p>
          <Commands />
        </>,
      );
    }
  });

  app.post("/abort", (c) => {
    scheduler.abort();
    return c.redirect("/");
  });

  return app;
}
