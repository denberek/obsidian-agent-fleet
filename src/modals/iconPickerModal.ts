import { App, Modal, getIconIds, setIcon } from "obsidian";

const POPULAR_ICONS = [
  "bot", "brain", "shield-check", "search", "file-text", "rocket", "wand", "sparkles",
  "zap", "target", "compass", "eye", "code", "terminal", "database", "globe",
  "mail", "message-circle", "book", "pen-tool", "palette", "music", "camera",
  "chart-bar", "clipboard", "cpu", "server", "cloud", "lock", "key",
  "bell", "calendar", "clock", "heart", "star", "flag", "bookmark",
];

export class IconPickerModal extends Modal {
  private searchQuery = "";
  private selectedIcon: string;
  private allIcons: string[] = [];
  private gridContainer!: HTMLElement;

  constructor(
    app: App,
    currentIcon: string,
    private readonly onSelect: (iconName: string) => void,
  ) {
    super(app);
    this.selectedIcon = currentIcon;
  }

  onOpen(): void {
    this.allIcons = getIconIds().sort();
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("af-icon-picker-modal");

    const searchInput = contentEl.createEl("input", {
      cls: "af-icon-picker-search",
      attr: { type: "text", placeholder: "Search icons...", value: this.searchQuery },
    });

    this.gridContainer = contentEl.createDiv({ cls: "af-icon-picker-scroll" });
    this.renderGrid();

    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.renderGrid();
    });

    // Focus after a tick so the modal doesn't steal events
    window.setTimeout(() => searchInput.focus(), 0);
  }

  private renderGrid(): void {
    const container = this.gridContainer;
    container.empty();

    const query = this.searchQuery.toLowerCase().trim();

    if (!query) {
      this.renderSection(container, "Popular", POPULAR_ICONS);
      this.renderSection(container, "All Icons", this.allIcons);
    } else {
      const filtered = this.allIcons.filter((icon) => icon.includes(query));
      const label = filtered.length === 0 ? "No results" : `${filtered.length} result${filtered.length !== 1 ? "s" : ""}`;
      this.renderSection(container, label, filtered);
    }
  }

  private renderSection(container: HTMLElement, label: string, icons: string[]): void {
    const section = container.createDiv({ cls: "af-icon-picker-section" });
    section.createDiv({ cls: "af-icon-picker-section-label", text: label });
    const grid = section.createDiv({ cls: "af-icon-picker-grid" });
    for (const icon of icons) {
      this.renderIconItem(grid, icon);
    }
  }

  private renderIconItem(container: HTMLElement, iconName: string): void {
    const item = container.createDiv({
      cls: `af-icon-picker-item${this.selectedIcon === iconName ? " selected" : ""}`,
    });
    item.setAttribute("title", iconName);
    item.setAttribute("aria-label", iconName);
    setIcon(item, iconName);
    item.addEventListener("click", () => {
      this.selectedIcon = iconName;
      this.onSelect(iconName);
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
