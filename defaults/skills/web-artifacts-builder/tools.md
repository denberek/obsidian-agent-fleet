# Scripts

Shell scripts for initializing and bundling web artifact projects.

## scripts/init-artifact.sh

Initializes a new React + TypeScript project fully configured for building claude.ai HTML artifacts.

### Usage

```bash
bash scripts/init-artifact.sh <project-name>
```

### What It Does

1. **Detects Node version** - Requires Node 18+; pins Vite 5.4.11 for Node 18, uses latest for Node 20+
2. **Creates Vite project** - Scaffolds a React + TypeScript project via `pnpm create vite`
3. **Installs Tailwind CSS** - Sets up Tailwind CSS 3.4.1 with PostCSS and autoprefixer
4. **Configures shadcn/ui theming** - Creates `tailwind.config.js` with full shadcn/ui color system (CSS variables for background, foreground, primary, secondary, destructive, muted, accent, popover, card) and animation keyframes
5. **Sets up CSS variables** - Creates `src/index.css` with light and dark mode CSS variable definitions
6. **Configures path aliases** - Sets up `@/` alias in `tsconfig.json`, `tsconfig.app.json`, and `vite.config.ts`
7. **Installs Radix UI dependencies** - Installs 27 Radix UI primitive packages (accordion, dialog, dropdown-menu, tabs, tooltip, etc.)
8. **Installs utility packages** - sonner, cmdk, vaul, embla-carousel-react, react-day-picker, react-resizable-panels, date-fns, react-hook-form, zod
9. **Extracts shadcn/ui components** - Unpacks 40+ pre-built components from `shadcn-components.tar.gz` into `src/`
10. **Creates components.json** - Reference config for shadcn/ui CLI compatibility

### Included Components (40+)

accordion, alert, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, label, menubar, navigation-menu, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, skeleton, slider, sonner, switch, table, tabs, textarea, toast, toggle, toggle-group, tooltip

### Import Examples

```typescript
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
```

---

## scripts/bundle-artifact.sh

Bundles a React application into a single self-contained HTML file suitable for use as a claude.ai artifact.

### Usage

```bash
# Run from your project root directory
bash scripts/bundle-artifact.sh
```

### Requirements

- Must be run from the project root (where `package.json` lives)
- Project must have an `index.html` in the root directory

### What It Does

1. **Installs bundling dependencies** - parcel, @parcel/config-default, parcel-resolver-tspaths, html-inline
2. **Creates Parcel configuration** - `.parcelrc` with path alias support via parcel-resolver-tspaths
3. **Cleans previous builds** - Removes `dist/` and `bundle.html`
4. **Builds with Parcel** - Compiles the project with no source maps (`pnpm exec parcel build index.html --dist-dir dist --no-source-maps`)
5. **Inlines all assets** - Uses html-inline to merge all JS, CSS, and assets into a single `bundle.html`

### Output

Creates `bundle.html` in the project root - a self-contained HTML file with all JavaScript, CSS, and dependencies inlined. This file can be:
- Shared directly in Claude conversations as an artifact
- Opened in any browser for local testing
