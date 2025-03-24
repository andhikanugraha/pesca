import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { relative, resolve } from "@std/path";
import { type ReactNode } from "hono/jsx";
import task from "tasuku";

import { type Scheduler } from "../scheduler/scheduler.ts";
import { type Operator } from "../operator/operator.ts";
import { Config } from "../config.ts";
import { forwardServer, type NgrokConfig } from "./ngrok.ts";

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
      <script src="/relative-time-element.js" type="module" />
      <script
        dangerouslySetInnerHTML={{
          __html:
            `function showLoadingIndicator() { document.querySelector("progress").style.display = "block" }`,
        }}
      />
      <h1>pesca</h1>
      {children}
    </>
  );
}

function Commands() {
  return (
    <>
      <form action="/run" method="post" onsubmit="showLoadingIndicator()">
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
        <progress style="display: none"></progress>
      </form>
    </>
  );
}

function Time(
  { children, tense = "auto" }: {
    children: Temporal.ZonedDateTime | null | undefined;
    tense: string;
  },
) {
  if (!children) {
    return <>&mdash;</>;
  }

  const datetime = children.toString({ timeZoneName: "never" });
  const text = children.toLocaleString();
  return (
    <relative-time
      datetime={datetime}
      threshold="PT6H"
      hour="numeric"
      minute="2-digit"
      time-zone-name="shortGeneric"
      prefix=""
      tense={tense}
    >
      {text}
    </relative-time>
  );
}

export default function startServer(
  { config, scheduler, operator }: {
    config: Config;
    scheduler: Scheduler;
    operator: Operator;
  },
): Deno.HttpServer<Deno.NetAddr> | null {
  const app = new Hono();

  app.get("/sakura.css", serveFile("sakura.css"));
  app.get("/relative-time-element.js", serveFile("relative-time-element.js"));
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
        <table>
          <tr>
            <th width="40%">Next occurrence:</th>
            <td>
              <Time tense="future">{scheduler.nextOccurrence}</Time>
            </td>
          </tr>
          <tr>
            <th width="40%">Last successful occurrence:</th>
            <td>
              <Time tense="past">{scheduler.lastSuccessfulOccurrence}</Time>
            </td>
          </tr>
          <tr>
            <th width="40%">Last failed occurrence:</th>
            <td>
              <Time tense="past">{scheduler.lastFailedOccurrence}</Time>
            </td>
          </tr>
        </table>
        <Commands />
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

  let server: Deno.HttpServer<Deno.NetAddr> | null = null;
  task("Initiating server", async ({ setTitle, task }) => {
    server = Deno.serve(app.fetch);
    setTitle(`Listening to ${server.addr.hostname}:${server.addr.port}`);
    if (server && config.ngrok) {
      await task(
        "Forwarding to ngrok",
        () =>
          forwardServer({
            server: server as Deno.HttpServer<Deno.NetAddr>,
            config: config.ngrok as NgrokConfig,
          }),
      );
    }
  });

  return server;
}
