import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { relative, resolve } from "@std/path";

import { type Scheduler } from "../scheduler/scheduler.ts";
import { type Operator } from "../operator/operator.ts";
import { type Config } from "../config.ts";
import { forwardServer, type NgrokConfig } from "./ngrok.ts";
import { logger } from "../logger.ts";
import { html } from "./helpers.ts";
import { Commands, Layout } from "./layout.ts";
import { EnrichedTransaction } from "../operator/consolidate.ts";

function serveFile(path: string) {
  const relativePath = relative(
    Deno.cwd(),
    resolve(import.meta.dirname || "", path),
  );
  return serveStatic({ path: relativePath });
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

// Utility function to read JSON file from disk
async function readJsonFile<T>(path: string): Promise<T> {
  const text = await Deno.readTextFile(path);
  return JSON.parse(text);
}

// Parses consolidated.json and returns uncategorisedPayees and categories
async function parseConsolidatedJson(consolidatedPath: string): Promise<{
  uncategorisedPayees: string[];
  categories: string[];
}> {
  const { transactions } = await readJsonFile<{
    transactions: EnrichedTransaction[];
  }>(consolidatedPath);

  // Uncategorised payees
  const uncategorisedPayees = Array.from(
    new Set(
      transactions
        .filter((tx) =>
          (!tx.category || tx.category === "") &&
          (!tx.originalCategory || tx.originalCategory === "") &&
          tx.payeeName
        )
        .map((tx) => tx.payeeName)
        .filter((v) => v !== undefined),
    ),
  );
  // All categories and originalCategories, deduped and filtered for non-empty
  const categories = Array.from(
    new Set(
      transactions
        .flatMap((tx) => [tx.category, tx.originalCategory])
        .filter((cat): cat is string => !!cat && cat !== ""),
    ),
  );
  return { uncategorisedPayees, categories };
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
  app.get("/client.js", serveFile("client.js"));
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
      message = html`
        <status-message>
          <span slot="icon">✅</span> Operation was successful.
        </status-message>
      `;
    } else if (status === "failed") {
      message = html`
        <status-message>
          <span slot="icon">❌</span> Operation failed.
        </status-message>
      `;
    }
    // Pass config.sources to Commands
    const sources =
      config.sources?.map((s) => ({ key: s.key, name: String(s.name) })) ?? [];
    return c.render(html`
      ${Commands(sources)} ${message}
      <dl>
        <dt>Next occurrence</dt>
        <dd>${Time(nextOccurrence, "future")}</dd>
        ${lastSuccessfulOccurrence
          ? html`
            <dt>Last successful occurrence</dt>
            <dd>${Time(lastSuccessfulOccurrence, "past")}</dd>
          `
          : ""} ${lastFailedOccurrence
          ? html`
            <dt>Last successful occurrence</dt>
            <dd>${Time(lastSuccessfulOccurrence, "past")}</dd>
          `
          : ""}
      </dl>
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
      success = await scheduler.run(({ signal }) =>
        operator.pullSource({ source, signal })
      );
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

  // GET route for uncategorized payees
  app.get("/consolidated", async (c) => {
    const payees = await parseConsolidatedJson(
      config.consolidatedPath + "/consolidated.json",
    );
    return c.json(payees);
  });

  logger.info("Initiating server");
  const server = Deno.serve({
    onListen({ port, hostname }) {
      logger.info(`Listening on http://${hostname}:${port}`);
    },
  }, app.fetch);

  if (server && config.ngrok) {
    logger.info("Forwarding to ngrok");
    const url = await forwardServer({
      server,
      config: config.ngrok as NgrokConfig,
    });
    logger.info(`Forwarded to ${url}`);
  }

  return server;
}
