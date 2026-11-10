"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.disabled = false; this.checked = false; this.hidden = false; this.classList = { values: new Set(), toggle: (name, enabled) => enabled ? this.classList.values.add(name) : this.classList.values.delete(name) }; }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  async dispatch(type, event = {}) { return this.listeners[type] && this.listeners[type](event); }
  querySelector(selector) { return this.selectors && this.selectors[selector] || null; }
  querySelectorAll(selector) { return selector === "button" ? this.buttons || [] : []; }
}

class Dialog extends Element {
  constructor() {
    super("dialog");
    this.options = new Element("div");
    this.form = new Element("form");
    this.status = new Element("p");
    this.cancel = new Element("button");
    this.reset = new Element("button");
    this.save = new Element("button");
    this.buttons = [this.cancel, this.reset, this.save];
    this.selectors = { ".toolbar-settings-options": this.options, form: this.form, ".toolbar-settings-status": this.status, "[data-cancel]": this.cancel, "[data-reset]": this.reset, "[data-save]": this.save };
  }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

async function main() {
  const trigger = new Element("button");
  const toolbarControls = ["previous", "next", "zoom-in"].map((name) => { const element = new Element("button"); element.dataset = { toolbarControl: name }; return element; });
  const viewer = new Element("section");
  const document = {
    body: new Element("body"),
    getElementById(id) { return id === "customizeToolbarBtn" ? trigger : null; },
    querySelector(selector) { return selector === ".viewer-panel" ? viewer : null; },
    querySelectorAll(selector) { return selector === "[data-toolbar-control]" ? toolbarControls : []; },
    createElement(tag) { return tag === "dialog" ? new Dialog() : new Element(tag); }
  };
  const window = { addEventListener() {}, XinTI18n: { apply() {}, t(key) { return key; } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "frontend", "toolbar-settings.js"), "utf8"), { window, document });
  let writes = 0;
  let failFirst = true;
  window.XinTToolbarSettings.configure({ toolbarHidden: ["next"], save: async (hidden) => {
    writes += 1;
    if (failFirst) { failFirst = false; throw new Error("storage rejected"); }
    return hidden;
  } });
  assert.equal(toolbarControls[1].classList.values.has("toolbar-control-hidden"), true);
  await trigger.dispatch("click");
  const dialog = viewer.children[0];
  const nextCheckbox = dialog.options.children.find((label) => label.children[0].value === "next").children[0];
  assert.equal(nextCheckbox.checked, false);
  nextCheckbox.checked = true;
  await dialog.form.dispatch("submit", { preventDefault() {} });
  assert.equal(dialog.open, true, "failed save keeps the dialog open");
  assert.equal(nextCheckbox.disabled, false, "failed save unlocks controls for retry");
  assert.equal(toolbarControls[1].classList.values.has("toolbar-control-hidden"), true, "failed save keeps current toolbar state");

  await dialog.form.dispatch("submit", { preventDefault() {} });
  assert.equal(dialog.open, false);
  assert.equal(toolbarControls[1].classList.values.has("toolbar-control-hidden"), false);
  assert.equal(nextCheckbox.disabled, false, "successful save also unlocks controls for the next opening");
  await trigger.dispatch("click");
  assert.equal(dialog.open, true);
  assert.equal(nextCheckbox.disabled, false, "dialog can be edited again after a successful save");
  await dialog.reset.dispatch("click");
  assert.equal(writes, 3, "restore defaults is saved immediately");
  assert.equal(dialog.open, false);
  assert.equal(toolbarControls.some((control) => control.classList.values.has("toolbar-control-hidden")), false);
  console.log("Toolbar settings async persistence tests passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
