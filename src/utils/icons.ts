import { setIcon } from "obsidian";

export function createIcon(parent: HTMLElement, iconName: string, cls?: string): HTMLElement {
  const el = parent.createSpan({ cls: cls ?? "af-icon" });
  setIcon(el, iconName);
  return el;
}
