# Design system

## Direction

Make It Social owns **black, white, and structure**. Social networks bring color. The application uses a black sidebar and white workspace so navigation feels like a stable product frame and the work remains visually dominant.

Do not use gradients, eyebrow headings, editorial compositions, decorative giant type, glass effects, neon, arbitrary accent colors, generic SaaS illustration, excessive card grids, or decoration without product meaning.

## Tokens

```css
:root {
  --black: #0a0a0a;
  --gray-950: #111111;
  --gray-900: #181818;
  --gray-800: #262626;
  --gray-700: #404040;
  --gray-600: #595959;
  --gray-500: #737373;
  --gray-400: #a3a3a3;
  --gray-300: #d4d4d4;
  --gray-200: #e5e5e5;
  --gray-100: #f5f5f5;
  --gray-50: #fafafa;
  --white: #ffffff;
  --danger: #b42318;
  --warning: #9a6700;
  --success: #067647;
  --info: #175cd3;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 18px;
  --space-unit: 4px;
  --sidebar-width: 256px;
  --content-max: 1440px;
}
```

Use semantic status colors sparingly and pair them with icon and text. Platform colors are reserved for platform logos, channel badges, platform-specific chart series, calendar indicators, and source identity.

## Typography

Use Inter; Geist Sans is the fallback product family. Default body is 14–16px with 1.45–1.6 line height. Dense tables may use 13px. Page titles are 28–36px, section titles 20–24px, and labels 12–14px. Use weight and spacing for hierarchy; do not use eyebrow labels.

## Layout

- Desktop: fixed black sidebar, optional 240–320px contextual panel, fluid white workspace.
- Main content gutters: 32px desktop, 24px tablet, 16–20px mobile.
- Use 8px rhythm for layout and 4px for compact controls.
- Cards require a semantic grouping reason. Prefer borders and section spacing over containers around everything.
- Dense screens use sticky toolbars, persistent filters, resizable columns where helpful, and clear empty/loading/error states.

## Core components

- Primary action: black fill, white text, 44–48px height.
- Secondary action: white or transparent, gray border, black text.
- Destructive action: restrained red text/border; confirmation names the affected object.
- Inputs: explicit labels, helper/error text, 40–44px controls, visible focus.
- Tables: sticky header where long; selectable rows; sortable headings; pagination or virtualization.
- Status: icon + label; never color alone.
- Platform identity: official mark plus accessible network name.
- Toasts: confirm transient success; persistent failures belong inline and in activity/health views.
- Skeletons: mirror final geometry; no indefinite fake progress.

## Screen patterns

### Dashboard

Show attention first: failed posts, approvals due, disconnected channels, unresolved conversations. Follow with upcoming work and performance. Avoid vanity-metric walls.

### Planner

Month, week, and list views share filters. Posts display state, channel, time, asset preview, campaign, and approval status. Dragging must preserve timezone clarity and require confirmation for consequential bulk moves.

### Composer

Use a focused work surface: content and channel controls, per-channel variants, live preview, validation, and scheduling. Autosave drafts. Clearly distinguish shared text from platform overrides.

### Inbox

Desktop uses three columns: queue, conversation, customer/context panel. Assignment and status remain visible. On narrow screens these become a drill-in sequence with retained scroll and filters.

### Analytics and campaigns

Filters and date comparison remain visible. Every metric exposes definition, source, freshness, and unavailable states. Paid and organic are distinguishable but comparable.

## Mobile

Mobile is task-specific, not a compressed desktop. Use bottom navigation for Home, Calendar, Create, Inbox, and More. Prioritize approval, reply, reschedule, publish-status checks, and quick compose. Use sheets for secondary controls, 44px targets, safe-area padding, and explicit unsaved-change protection.

## Accessibility and motion

Target WCAG 2.2 AA. All actions are keyboard accessible; focus is visible; headings are ordered; dialogs trap and return focus; tables have names and headers; charts include summaries or data tables. Support 200% zoom, reduced motion, non-color cues, and screen-reader announcements for async state. Motion lasts roughly 150–350ms and explains change; avoid endless, bouncing, or decorative motion.

## Content style

Use short, direct labels: “Schedule post,” “Request changes,” “Reconnect Instagram.” State what happened and what the user can do. Preserve platform terminology when it affects meaning. Never claim certainty when provider data is delayed or estimated.
