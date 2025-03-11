import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { relative, resolve } from "@std/path";
import { type ReactNode } from "hono/jsx";

import { type Scheduler } from "../scheduler.ts";
import { type Operator } from "../operator/operator.ts";

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
      <form action="/run" method="post">
        <p>
          <button type="submit" name="task" value="run">Run</button>
          &nbsp;
          <button type="submit" name="task" value="pull">
            Pull Only
          </button>
          &nbsp;
          <button type="submit" name="task" value="consolidate">
            Consolidate Only
          </button>
          &nbsp;
          <button type="submit" name="task" value="abort">
            Abort
          </button>
        </p>
      </form>
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
  { scheduler, operator }: { scheduler: Scheduler; operator: Operator },
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
    const body = await c.req.formData();
    const task = body.get("task");

    if (task === "abort") {
      scheduler.abort();
      return c.redirect("/");
    }

    let success: boolean;
    if (task === "pull") {
      success = await scheduler.run(operator.pull);
    } else if (task === "consolidate") {
      success = await scheduler.run(operator.consolidate);
    } else {
      success = await scheduler.run();
    }

    if (success) {
      return c.render(
        <>
          <p>✅ Operation was successful.</p>
          <Commands />
        </>,
      );
    } else {
      return c.render(
        <>
          <p>❌ Operation was not successful.</p>
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
