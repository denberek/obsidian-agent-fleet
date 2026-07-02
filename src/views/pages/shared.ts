import type AgentFleetPlugin from "../../main";

/**
 * View helpers every extracted page borrows from the dashboard so the
 * extracted markup stays byte-identical to what the view used to render
 * inline. Each page module extends this with its own (narrowly typed)
 * `navigate` delegate and any page-specific extras. Shared state (ticker
 * registries, detail context, probe caches) stays on the view and is handed
 * to pages through these deps or as parameters.
 */
export interface DashboardPageDeps {
  plugin: AgentFleetPlugin;
  /** Standard icon + label + optional CTA empty-state block (owned by the view). */
  renderEmptyState: (
    container: HTMLElement,
    iconName: string,
    label: string,
    sublabel: string,
    action?: { label: string; onClick: () => void },
  ) => void;
}
