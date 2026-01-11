/// <reference no-default-lib="true" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="dom" />

import { html } from "./helpers.ts";

function Spinner() {
  return html`
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      style="vertical-align:middle;display:inline-block;"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g>
        <circle cx="12" cy="3.5" r="2" fill="currentColor">
          <animate
            attributeName="opacity"
            values="1;.3;.3"
            keyTimes="0;0.5;1"
            dur="1s"
            begin="0s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="18.5" cy="5.5" r="2" fill="currentColor">
          <animate
            attributeName="opacity"
            values="1;.3;.3"
            keyTimes="0;0.5;1"
            dur="1s"
            begin="0.125s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="21" cy="12" r="2" fill="currentColor">
          <animate
            attributeName="opacity"
            values="1;.3;.3"
            keyTimes="0;0.5;1"
            dur="1s"
            begin="0.25s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="18.5" cy="18.5" r="2" fill="currentColor">
          <animate
            attributeName="opacity"
            values="1;.3;.3"
            keyTimes="0;0.5;1"
            dur="1s"
            begin="0.375s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="12" cy="20.5" r="2" fill="currentColor">
          <animate
            attributeName="opacity"
            values="1;.3;.3"
            keyTimes="0;0.5;1"
            dur="1s"
            begin="0.5s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="5.5" cy="18.5" r="2" fill="currentColor">
          <animate
            attributeName="opacity"
            values="1;.3;.3"
            keyTimes="0;0.5;1"
            dur="1s"
            begin="0.625s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="3" cy="12" r="2" fill="currentColor">
          <animate
            attributeName="opacity"
            values="1;.3;.3"
            keyTimes="0;0.5;1"
            dur="1s"
            begin="0.75s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="5.5" cy="5.5" r="2" fill="currentColor">
          <animate
            attributeName="opacity"
            values="1;.3;.3"
            keyTimes="0;0.5;1"
            dur="1s"
            begin="0.875s"
            repeatCount="indefinite"
          />
        </circle>
      </g>
    </svg>
  `;
}

function script() {
  customElements.define(
    "status-message",
    class extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: "open" });
        const tpl = document.getElementById(
          "status-message",
        ) as HTMLTemplateElement;
        this.shadowRoot!.appendChild(tpl!.content.cloneNode(true));
      }
    },
  );

  const sourceSelector = document.getElementById(
    "source-select",
  ) as HTMLSelectElement;
  const form = document.querySelector("form") as HTMLFormElement;
  const sourceButton = document.querySelector(
    "button[name=task][value=pullSource]",
  ) as HTMLButtonElement;
  const abortButton = document.querySelector(
    "button[name=task][value=abort]",
  ) as HTMLButtonElement;

  function createSpinner() {
    const template = document.querySelector(
      "template#spinner",
    ) as HTMLTemplateElement;
    return template!.content.cloneNode(true);
  }

  form.onsubmit = (e) => {
    document.querySelector("status-message")?.remove();

    // Unhide abortButton
    abortButton.hidden = false;

    if (e.submitter && !e.submitter.querySelector("svg")) {
      const spinner = createSpinner();
      e.submitter.prepend(spinner);
    }
  };

  sourceSelector.onchange = () => {
    form.requestSubmit(sourceButton);
  };
}

export function Layout(children: string) {
  let scriptBody = script.toString();
  scriptBody = scriptBody.substring(
    scriptBody.indexOf("{") + 1,
    scriptBody.lastIndexOf("}"),
  );

  return html`
    <!DOCTYPE html>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/new.css">
    <link rel="icon" href="/favicon.svg" type="image/svg">
    <title>pesca</title>
    <header>
      <h1>pesca</h1>
    </header>
    ${children}
    <template id="status-message">
      <p>
        <slot name="icon"></slot>
        <slot>Loading...</slot>
      </p>
    </template>
    <template id="spinner">
      ${Spinner()}
    </template>
    <script type="module" src="/relative-time-element.js"></script>
    <script type="module">
    ${scriptBody}
    </script>
  `;
}

export function Commands(sources: { key: string; name: string }[]) {
  const sourceOptions = sources.map((s) =>
    html`
      <option value="${s.key}">${s.key}</option>
    `
  ).join("\n");

  return html`
    <form action="/run" method="post">
      <p>
        <button type="submit" name="task" value="run">Run</button>
        &nbsp;

        <button type="submit" name="task" value="consolidate">
          Consolidate
        </button>
        &nbsp;

        <button type="submit" name="task" value="pull">
          Pull
        </button>
        &nbsp;

        <select name="source" id="source-select">
          <option value="" selected disabled>Pull specific source</option>
          ${sourceOptions}
        </select>
        <button type="submit" name="task" value="pullSource" hidden>
          Pull Source
        </button>
        &nbsp;
        <button type="submit" name="task" value="abort" hidden>
          Abort
        </button>
      </p>
      <p></p>
    </form>
  `;
}
