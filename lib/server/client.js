customElements.define(
  "status-message",
  class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      const tpl = document.getElementById("status-message");
      this.shadowRoot.appendChild(tpl.content.cloneNode(true));
    }
  },
);

const sourceSelector = document.getElementById("source-select");
const form = document.querySelector("form");
const sourceButton = document.querySelector(
  "button[name=task][value=pullSource]",
);
const abortButton = document.querySelector(
  "button[name=task][value=abort]",
);

function createSpinner() {
  const template = document.querySelector("template#spinner");
  return template.content.cloneNode(true);
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
