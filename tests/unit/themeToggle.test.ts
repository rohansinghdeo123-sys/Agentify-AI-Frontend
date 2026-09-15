import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  effects: [] as Array<() => void>,
  subscribe: null as null | ((onChange: () => void) => () => void),
  serverSnapshot: false,
}));

// Exercise the store, effects, and event handlers without requiring a DOM
// dependency in this Node-only unit suite. Browser integration is covered in e2e.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: (effect: () => void) => { hooks.effects.push(effect); },
  useSyncExternalStore: (
    subscribe: (onChange: () => void) => () => void,
    getSnapshot: () => string,
    getServerSnapshot: () => string,
  ) => {
    hooks.subscribe = subscribe;
    return hooks.serverSnapshot ? getServerSnapshot() : getSnapshot();
  },
}));

import ThemeToggle from "@/components/ThemeToggle";

let stored: Map<string, string>;
let attributes: Map<string, string>;
let browser: EventTarget;
let setItem: ReturnType<typeof vi.fn>;

function flushEffects() {
  hooks.effects.splice(0).forEach((effect) => effect());
}

beforeEach(() => {
  hooks.effects = [];
  hooks.subscribe = null;
  hooks.serverSnapshot = false;
  stored = new Map();
  attributes = new Map();
  browser = new EventTarget();
  setItem = vi.fn((key: string, value: string) => { stored.set(key, value); });
  vi.stubGlobal("window", browser);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem,
  });
  vi.stubGlobal("document", {
    documentElement: {
      setAttribute: (key: string, value: string) => { attributes.set(key, value); },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("ThemeToggle synchronization", () => {
  it("restores a saved dark theme when the document attribute is missing", () => {
    stored.set("agentify-theme", "dark");

    const button = ThemeToggle({});
    flushEffects();

    expect(button.props["aria-pressed"]).toBe(true);
    expect(attributes.get("data-theme")).toBe("dark");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("reads the live preference during initial hydration without persisting the light server snapshot", () => {
    stored.set("agentify-theme", "dark");
    hooks.serverSnapshot = true;

    const button = ThemeToggle({});
    flushEffects();

    expect(button.props["aria-pressed"]).toBe(false);
    expect(attributes.get("data-theme")).toBe("dark");
    expect(stored.get("agentify-theme")).toBe("dark");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("keeps theme changes from another tab and the toggle state in sync", () => {
    ThemeToggle({});
    flushEffects();
    const onChange = vi.fn();
    const unsubscribe = hooks.subscribe!(onChange);

    stored.set("agentify-theme", "dark");
    browser.dispatchEvent(new Event("storage"));
    expect(onChange).toHaveBeenCalledOnce();
    expect(ThemeToggle({}).props["aria-pressed"]).toBe(true);
    flushEffects();
    expect(attributes.get("data-theme")).toBe("dark");
    expect(setItem).not.toHaveBeenCalled();

    unsubscribe();
    browser.dispatchEvent(new Event("storage"));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("persists clicks and notifies other toggle instances in the same tab", () => {
    const button = ThemeToggle({});
    flushEffects();
    const onChange = vi.fn();
    const unsubscribe = hooks.subscribe!(onChange);

    button.props.onClick();
    expect(stored.get("agentify-theme")).toBe("dark");
    expect(attributes.get("data-theme")).toBe("dark");
    expect(onChange).toHaveBeenCalledOnce();
    expect(ThemeToggle({ compact: true }).props["aria-pressed"]).toBe(true);

    unsubscribe();
    browser.dispatchEvent(new Event("agentify-theme-change"));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("defaults an absent or invalid saved preference to light", () => {
    for (const preference of [null, "unexpected"]) {
      if (preference === null) stored.delete("agentify-theme");
      else stored.set("agentify-theme", preference);
      attributes.set("data-theme", "dark");

      expect(ThemeToggle({}).props["aria-pressed"]).toBe(false);
      flushEffects();
      expect(attributes.get("data-theme")).toBe("light");
    }
    expect(setItem).not.toHaveBeenCalled();
  });
});
