import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { relative, resolve } from "@std/path";

import { type Scheduler } from "../scheduler/scheduler.ts";
import { type Operator } from "../operator/operator.ts";
import { type Config } from "../config.ts";
import { forwardServer, type NgrokConfig } from "./ngrok.ts";
import { logger } from "../logger.ts";

function serveFile(path: string) {
  const relativePath = relative(
    Deno.cwd(),
    resolve(import.meta.dirname || "", path),
  );
  return serveStatic({ path: relativePath });
}

// html tag function to trim and remove preceding whitespace
function html(strings: TemplateStringsArray, ...values: unknown[]) {
  const result = String.raw(strings, ...values);
  // Remove leading/trailing whitespace and preceding whitespace on each line
  return result
    .split("\n")
    .map((line) => line.trimStart())
    .join("\n")
    .trim();
}

function Layout(children: string) {
  return html`
    <!DOCTYPE html>
    <title>pesca</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/new.css">
    <link rel="icon" href="/favicon.svg" type="image/svg" />
    <script src="/relative-time-element.js" type="module"></script>
    <header>
    <h1>pesca</h1>
    </header>
    ${children}
  `;
}

function Commands(sources: { key: string; name: string }[]) {
  return html`
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
      <p>
        <label for="source-select">Pull specific source:</label>
        <select name="source" id="source-select">
          <option value="">--Select source--</option>
          ${sources.map((s) => `<option value="${s.key}">${s.key}</option>`).join("")}
        </select>
        <button type="submit" name="task" value="pullSource">Pull Source</button>
      </p>
      <progress style="display: none"></progress>
    </form>
    <script type="module">
    function showLoadingIndicator() { document.querySelector("progress").style.display = "block" }
    </script>
  `;
}

function Time(
  children: Temporal.ZonedDateTime | null | undefined,
  tense: string = "auto",
) {
  if (!children) {
    return "&mdash;";
  }
  const datetime = children.toString({ timeZoneName: "never" });
  const text = children.toLocaleString();
  return html`
    <relative-time
      datetime="${datetime}"
      threshold="PT6H"
      hour="numeric"
      minute="2-digit"
      time-zone-name="shortGeneric"
      prefix=""
      tense="${tense}"
    >${text}</relative-time>
  `;
}

export default async function startServer(
  { config, scheduler, operator }: {
    config: Config;
    scheduler: Scheduler;
    operator: Operator;
  },
): Promise<Deno.HttpServer<Deno.NetAddr> | null> {
  const app = new Hono();

  app.get("/new.css", serveFile("new.css"));
  app.get("/favicon.svg", serveFile("favicon.svg"));
  app.get("/relative-time-element.js", serveFile("relative-time-element.js"));

  app.use(async (c, next) => {
    c.setRenderer(async (content) => c.html(Layout(await content)));
    await next();
  });

  app.get("/", (c) => {
    const { nextOccurrence, lastSuccessfulOccurrence, lastFailedOccurrence } =
      scheduler;
    const status = c.req.query("status");
    let message = "";
    if (status === "success") {
      message = `<p>✅ Operation was successful.</p>`;
    } else if (status === "failed") {
      message = `<p>❌ Operation was not successful.</p>`;
    }
    // Pass config.sources to Commands
    const sources = config.sources?.map((s) => ({ key: s.key, name: String(s.name) })) ?? [];
    return c.render(html`
      ${message}
      <table>
        <tr>
          <th width="40%">Next occurrence:</th>
          <td>${Time(nextOccurrence, "future")}</td>
        </tr>
        <tr>
          <th width="40%">Last successful occurrence:</th>
          <td>${Time(lastSuccessfulOccurrence, "past")}</td>
        </tr>
        <tr>
          <th width="40%">Last failed occurrence:</th>
          <td>${Time(lastFailedOccurrence, "past")}</td>
        </tr>
      </table>
      ${Commands(sources)}
    `);
  });

  // Operator commands
  app.post("/run", async (c) => {
    const body = await c.req.formData();
    const task = body.get("task");
    const source = body.get("source");

    if (task === "abort") {
      scheduler.abort();
      return c.redirect("/");
    }

    let success: boolean;
    if (task === "pullSource" && typeof source === "string" && source) {
      success = await scheduler.run((opts) => operator.pullSource({ source, signal: opts.signal }));
    } else if (task === "pull") {
      success = await scheduler.run(operator.pull);
    } else if (task === "consolidate") {
      success = await scheduler.run(operator.consolidate);
    } else {
      success = await scheduler.run();
    }

    if (success) {
      return c.redirect("/?status=success");
    } else {
      return c.redirect("/?status=failed");
    }
  });

  app.post("/abort", (c) => {
    scheduler.abort();
    return c.redirect("/");
  });

  logger.info("Initiating server");
  const server = Deno.serve({
    onListen({ port, hostname }) {
      logger.info(`Listening on http://${hostname}:${port}`);
    },
  }, app.fetch);

  if (server && config.ngrok) {
    logger.info("Forwarding to ngrok");
    await forwardServer({ server, config: config.ngrok as NgrokConfig });
  }

  return server;
}
