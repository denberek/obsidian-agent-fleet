# Creative Arsenal & Bento Paradigm

## THE CREATIVE ARSENAL (High-End Inspiration)

Do not default to generic UI. Pull from this library of advanced concepts to ensure the output is visually striking and memorable. When appropriate, leverage **GSAP (ScrollTrigger/Parallax)** for complex scrolltelling or **ThreeJS/WebGL** for 3D/Canvas animations, rather than basic CSS motion. **CRITICAL:** Never mix GSAP/ThreeJS with Framer Motion in the same component tree. Default to Framer Motion for UI/Bento interactions. Use GSAP/ThreeJS EXCLUSIVELY for isolated full-page scrolltelling or canvas backgrounds, wrapped in strict useEffect cleanup blocks.

### The Standard Hero Paradigm

- Stop doing centered text over a dark image. Try asymmetric Hero sections: Text cleanly aligned to the left or right. The background should feature a high-quality, relevant image with a subtle stylistic fade (darkening or lightening gracefully into the background color depending on if it is Light or Dark mode).

### Navigation & Menus

- **Mac OS Dock Magnification:** Nav-bar at the edge; icons scale fluidly on hover.
- **Magnetic Button:** Buttons that physically pull toward the cursor.
- **Gooey Menu:** Sub-items detach from the main button like a viscous liquid.
- **Dynamic Island:** A pill-shaped UI component that morphs to show status/alerts.
- **Contextual Radial Menu:** A circular menu expanding exactly at the click coordinates.
- **Floating Speed Dial:** A FAB that springs out into a curved line of secondary actions.
- **Mega Menu Reveal:** Full-screen dropdowns that stagger-fade complex content.

### Layout & Grids

- **Bento Grid:** Asymmetric, tile-based grouping (e.g., Apple Control Center).
- **Masonry Layout:** Staggered grid without fixed row heights (e.g., Pinterest).
- **Chroma Grid:** Grid borders or tiles showing subtle, continuously animating color gradients.
- **Split Screen Scroll:** Two screen halves sliding in opposite directions on scroll.
- **Curtain Reveal:** A Hero section parting in the middle like a curtain on scroll.

### Cards & Containers

- **Parallax Tilt Card:** A 3D-tilting card tracking the mouse coordinates.
- **Spotlight Border Card:** Card borders that illuminate dynamically under the cursor.
- **Glassmorphism Panel:** True frosted glass with inner refraction borders.
- **Holographic Foil Card:** Iridescent, rainbow light reflections shifting on hover.
- **Tinder Swipe Stack:** A physical stack of cards the user can swipe away.
- **Morphing Modal:** A button that seamlessly expands into its own full-screen dialog container.

### Scroll-Animations

- **Sticky Scroll Stack:** Cards that stick to the top and physically stack over each other.
- **Horizontal Scroll Hijack:** Vertical scroll translates into a smooth horizontal gallery pan.
- **Locomotive Scroll Sequence:** Video/3D sequences where framerate is tied directly to the scrollbar.
- **Zoom Parallax:** A central background image zooming in/out seamlessly as you scroll.
- **Scroll Progress Path:** SVG vector lines or routes that draw themselves as the user scrolls.
- **Liquid Swipe Transition:** Page transitions that wipe the screen like a viscous liquid.

### Galleries & Media

- **Dome Gallery:** A 3D gallery feeling like a panoramic dome.
- **Coverflow Carousel:** 3D carousel with the center focused and edges angled back.
- **Drag-to-Pan Grid:** A boundless grid you can freely drag in any compass direction.
- **Accordion Image Slider:** Narrow vertical/horizontal image strips that expand fully on hover.
- **Hover Image Trail:** The mouse leaves a trail of popping/fading images behind it.
- **Glitch Effect Image:** Brief RGB-channel shifting digital distortion on hover.

### Typography & Text

- **Kinetic Marquee:** Endless text bands that reverse direction or speed up on scroll.
- **Text Mask Reveal:** Massive typography acting as a transparent window to a video background.
- **Text Scramble Effect:** Matrix-style character decoding on load or hover.
- **Circular Text Path:** Text curved along a spinning circular path.
- **Gradient Stroke Animation:** Outlined text with a gradient continuously running along the stroke.
- **Kinetic Typography Grid:** A grid of letters dodging or rotating away from the cursor.

### Micro-Interactions & Effects

- **Particle Explosion Button:** CTAs that shatter into particles upon success.
- **Liquid Pull-to-Refresh:** Mobile reload indicators acting like detaching water droplets.
- **Skeleton Shimmer:** Shifting light reflections moving across placeholder boxes.
- **Directional Hover Aware Button:** Hover fill entering from the exact side the mouse entered.
- **Ripple Click Effect:** Visual waves rippling precisely from the click coordinates.
- **Animated SVG Line Drawing:** Vectors that draw their own contours in real-time.
- **Mesh Gradient Background:** Organic, lava-lamp-like animated color blobs.
- **Lens Blur Depth:** Dynamic focus blurring background UI layers to highlight a foreground action.

---

## THE "MOTION-ENGINE" BENTO PARADIGM

When generating modern SaaS dashboards or feature sections, you MUST utilize the following "Bento 2.0" architecture and motion philosophy. This goes beyond static cards and enforces a "Vercel-core meets Dribbble-clean" aesthetic heavily reliant on perpetual physics.

### A. Core Design Philosophy

- **Aesthetic:** High-end, minimal, and functional.
- **Palette:** Background in `#f9fafb`. Cards are pure white (`#ffffff`) with a 1px border of `border-slate-200/50`.
- **Surfaces:** Use `rounded-[2.5rem]` for all major containers. Apply a "diffusion shadow" (a very light, wide-spreading shadow, e.g., `shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]`) to create depth without clutter.
- **Typography:** Strict `Geist`, `Satoshi`, or `Cabinet Grotesk` font stack. Use subtle tracking (`tracking-tight`) for headers.
- **Labels:** Titles and descriptions must be placed **outside and below** the cards to maintain a clean, gallery-style presentation.
- **Pixel-Perfection:** Use generous `p-8` or `p-10` padding inside cards.

### B. The Animation Engine Specs (Perpetual Motion)

All cards must contain **"Perpetual Micro-Interactions."** Use the following Framer Motion principles:

- **Spring Physics:** No linear easing. Use `type: "spring", stiffness: 100, damping: 20` for a premium, weighty feel.
- **Layout Transitions:** Heavily utilize the `layout` and `layoutId` props to ensure smooth re-ordering, resizing, and shared element state transitions.
- **Infinite Loops:** Every card must have an "Active State" that loops infinitely (Pulse, Typewriter, Float, or Carousel) to ensure the dashboard feels "alive".
- **Performance:** Wrap dynamic lists in `<AnimatePresence>` and optimize for 60fps. **PERFORMANCE CRITICAL:** Any perpetual motion or infinite loop MUST be memoized (React.memo) and completely isolated in its own microscopic Client Component. Never trigger re-renders in the parent layout.

### C. The 5-Card Archetypes (Micro-Animation Specs)

Implement these specific micro-animations when constructing Bento grids (e.g., Row 1: 3 cols | Row 2: 2 cols split 70/30):

1. **The Intelligent List:** A vertical stack of items with an infinite auto-sorting loop. Items swap positions using `layoutId`, simulating an AI prioritizing tasks in real-time.

2. **The Command Input:** A search/AI bar with a multi-step Typewriter Effect. It cycles through complex prompts, including a blinking cursor and a "processing" state with a shimmering loading gradient.

3. **The Live Status:** A scheduling interface with "breathing" status indicators. Include a pop-up notification badge that emerges with an "Overshoot" spring effect, stays for 3 seconds, and vanishes.

4. **The Wide Data Stream:** A horizontal "Infinite Carousel" of data cards or metrics. Ensure the loop is seamless (using `x: ["0%", "-100%"]`) with a speed that feels effortless.

5. **The Contextual UI (Focus Mode):** A document view that animates a staggered highlight of a text block, followed by a "Float-in" of a floating action toolbar with micro-icons.
