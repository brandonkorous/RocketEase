# RocketEase — Landing Page Design & Implementation Specification

**Version:** 1.0  
**Status:** Canonical landing-page direction  
**Domain:** `rocketease.com`  
**Primary positioning:** **Effortless Launch. Better by Design.**

---

# 1. Brand Idea

RocketEase is the operating layer behind a business's social presence.

The social platforms already own strong visual identities:

- Instagram
- Facebook
- LinkedIn
- TikTok
- YouTube
- Pinterest
- X
- future networks

RocketEase should not compete with those identities.

The visual system should therefore be primarily:

**Black. White. Structure.**

Platform colors only appear where they communicate platform identity, data, or state.

The result should make RocketEase feel like the neutral system connecting everything together.

---

# 2. Core Brand Principles

## Effortless Launch. Better by Design.

The product connects the complete lifecycle:

**Plan → Publish → Engage → Optimize**

Future product capabilities such as paid media, CRM context, attribution, campaign management, and automation should fit naturally within this model rather than create a collection of disconnected tools.

## RocketEase provides the structure

The interface should remain neutral.

Social networks supply visual color.

Examples:

- Instagram icon uses Instagram colors.
- LinkedIn icon uses LinkedIn blue.
- YouTube icon uses YouTube red.
- Analytics series may use corresponding network colors.
- RocketEase navigation, controls, cards, typography, and surfaces remain monochrome.

## Product before decoration

The primary visual asset should be the actual application.

Avoid decorative illustrations whose only purpose is filling space.

## Quiet confidence

The brand should feel:

- capable
- modern
- clear
- fast
- organized
- sophisticated
- approachable
- product-driven

It should not feel:

- corporate
- futuristic
- playful for the sake of being playful
- overly stylized
- trendy
- decorative

---

# 3. Explicit Design Restrictions

Do not use:

- gradients
- eyebrow headings
- editorial-style compositions
- giant decorative typography fragments
- AI sparkles
- glowing UI
- neon effects
- glassmorphism
- excessive rounded cards
- floating decorative blobs
- 3D objects without product relevance
- fake dashboards
- fake testimonials
- invented statistics
- meaningless icon grids
- generic SaaS illustrations
- decorative background grids
- arbitrary accent colors

The site should look designed, not generated.

---

# 4. Logo System

## Primary Icon

Use the approved **RocketEase rocket mark** (`images/icon.png`; vector source in
`packages/ui/src/icons.tsx` as `Mark`).

Characteristics:

- a single solid form rising left-to-right on a consistent diagonal
- a notched hook cut into the lower left, reading as both rocket fin and motion
- a detached ellipsis-like shard trailing below, echoing the same diagonal
- softly rounded corners on the outer extremities; the inner notch stays crisp
- solid black canonical version
- solid white reversed version

No:

- shadows
- gradients
- outlines around the icon
- extra containers
- decorative backgrounds

## Horizontal Lockup

Preferred:

`[icon] RocketEase`

The wordmark is set in two weights: **Rocket** carries the confidence of the icon,
**Ease** drops back so the name reads as one word rather than two.

Suggested weights:

- `Rocket` — **700–750**
- `Ease` — **400**

Never set the whole wordmark at one weight, and never insert a space, hyphen, or
capital-letter break other than the internal `E`.

## Clear Space

Maintain at least the equivalent of the trailing shard's width around the icon.

For the horizontal lockup, maintain at least that same unit around the complete mark.

## Minimum Digital Size

Icon:

- minimum: 20px
- preferred UI minimum: 24px
- navigation: 28–32px
- application icon: 48px+

---

# 5. Color System

## Core

```css
--rke-black: #0a0a0a;
--rke-white: #ffffff;

--rke-gray-950: #111111;
--rke-gray-900: #181818;
--rke-gray-800: #262626;
--rke-gray-700: #404040;
--rke-gray-600: #595959;
--rke-gray-500: #737373;
--rke-gray-400: #a3a3a3;
--rke-gray-300: #d4d4d4;
--rke-gray-200: #e5e5e5;
--rke-gray-100: #f5f5f5;
--rke-gray-50: #fafafa;
```

## Default Page

Background:

`#FFFFFF`

Primary text:

`#0A0A0A`

Secondary text:

`#595959`

Borders:

`#E5E5E5`

Subtle surfaces:

`#FAFAFA`

Dark sections:

`#0A0A0A`

Dark-section text:

`#FFFFFF`

## Platform Colors

Platform colors should only appear when representing that network.

Examples:

- network icons
- calendar post indicators
- charts
- channel badges
- campaign origin
- inbox source
- content previews

Never use Instagram pink, Facebook blue, TikTok cyan, etc. as general RocketEase branding.

---

# 6. Typography

Recommended primary family:

**Inter**

Alternative:

**Geist Sans**

Use one family throughout the marketing site unless a future brand decision establishes a proprietary display face.

## Weight System

- 400 — normal copy
- 500 — controls / secondary emphasis
- 600 — labels / navigation
- 700 — headings
- 800 — hero emphasis where necessary

Avoid excessive weight variation.

## Desktop Scale

### Hero

```text
font-size: 72px
line-height: 0.97
letter-spacing: -0.045em
font-weight: 700
```

The phrase should visually break:

**Effortless**  
**Launch.**  
Better by Design.

The first statement may use bold weight while **Better by Design.** may use a slightly lighter weight.

### H2

```text
48px
line-height: 1.05
letter-spacing: -0.035em
font-weight: 700
```

### H3

```text
24–28px
line-height: 1.15
letter-spacing: -0.02em
font-weight: 700
```

### Body Large

```text
18px
line-height: 1.6
```

### Body

```text
16px
line-height: 1.6
```

### Small

```text
14px
line-height: 1.45
```

Never make body copy excessively small simply to make the page look cleaner.

---

# 7. Layout System

## Maximum Content Width

Primary container:

```text
max-width: 1280px
```

Large product-showcase sections may extend to:

```text
max-width: 1360px
```

Page gutter:

Desktop:

```text
32px
```

Large desktop:

```text
40px
```

Tablet:

```text
24px
```

Mobile:

```text
20px
```

## Grid

Desktop:

**12 columns**

Recommended hero:

```text
Left: 5 columns
Gap: 1 column
Right: 6 columns
```

Product sections may use:

```text
4 / 8
5 / 7
6 / 6
```

depending on content.

---

# 8. Vertical Rhythm

Large sections should breathe.

Desktop section padding:

```text
112px 0
```

Major visual transitions:

```text
128px 0
```

Tablet:

```text
88px 0
```

Mobile:

```text
64px 0
```

Section heading to supporting copy:

```text
16–20px
```

Heading block to major visual:

```text
48–64px
```

Card internal padding:

```text
24–32px
```

Avoid compressing the page to fit more information above the fold.

---

# 9. Border Radius

The design should feel modern without becoming soft or toy-like.

Recommended:

```css
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 14px;
--radius-xl: 18px;
```

Buttons:

```text
8–10px
```

Product windows:

```text
12–16px
```

Large CTA containers:

```text
16px
```

Avoid pill-shaped buttons unless the specific control requires one.

---

# 10. Borders and Shadows

Prefer borders over shadows.

Default card:

```css
border: 1px solid #e5e5e5;
```

Product screenshot:

```css
border: 1px solid #dedede;
box-shadow:
    0 12px 30px rgba(0, 0, 0, 0.05),
    0 2px 6px rgba(0, 0, 0, 0.03);
```

Do not use:

- heavy drop shadows
- colored shadows
- glowing shadows
- floating card stacks everywhere

---

# 11. Navigation

## Desktop

Height:

```text
72–80px
```

Container:

```text
1280px
```

Left:

**RocketEase logo**

Center/right navigation:

- Product
- Solutions
- Pricing
- Resources

Utility:

- Log in
- Start free trial

Primary CTA:

Black background  
White text

## Navigation Button

```text
height: 44px
padding: 0 20px
radius: 8px
font-weight: 600
```

Navigation should remain visually quiet.

The hero must dominate the first viewport.

---

# 12. Hero Section

This is the defining section of the site.

## Layout

Desktop:

Left:

- headline
- supporting copy
- CTAs
- trial reassurance

Right:

- primary product surface

Approximate split:

```text
42% / 58%
```

Hero top spacing:

```text
80–96px
```

Hero bottom spacing:

```text
96–120px
```

## Headline

Canonical:

# Effortless Launch.

# Better by Design.

Do not place a label above it.

No eyebrow.

## Supporting Copy

Recommended direction:

> Plan, publish, engage, and grow across every platform from one powerful, easy-to-use social marketing platform.

Target line length:

```text
440–520px
```

## CTA

Primary:

**Start your free trial**

Secondary:

**Book a demo →**

Primary is filled black.

Secondary should generally be text-based or lightly bordered.

## Reassurance

Examples:

- No credit card
- 14-day free trial
- Cancel anytime

Use compact check icons.

Do not place reassurance inside separate cards.

---

# 13. Hero Product Surface

The hero should immediately prove that the product exists.

Preferred initial view:

**Calendar / planning interface**

Show:

- sidebar
- month or week calendar
- scheduled content
- network source icons
- post thumbnails
- create-post surface
- clear schedule action

The interface should feel like production software, not a marketing illustration.

## Product UI Palette

Core UI:

- white
- gray
- black

Network colors:

only where platform identity matters.

This is one of the most important visual expressions of the brand system.

---

# 14. Trust Strip

Place immediately after hero.

Spacing:

```text
64px top
80px bottom
```

Copy:

> Trusted by businesses and agencies

Eventually replace with real customer proof.

Until genuine customer logos are available, use:

- platform integrations
- press logos
- partner logos
- or omit the row

Do not invent customers.

Logo treatment:

- monochrome
- 60–70% opacity
- consistent visual height
- generous horizontal spacing

---

# 15. Workflow Section

## Headline

# One platform. Every step.

Supporting idea:

> RocketEase brings your entire social marketing workflow together so nothing falls through the cracks.

## Four Stages

### Plan

Content ideas  
Campaigns  
Calendar  
Approvals

### Publish

Cross-network posting  
Scheduling  
Content variants  
Automation

### Engage

Comments  
Mentions  
Messages  
Assignments

### Optimize

Analytics  
Ads  
Attribution  
Recommendations

## Visual Treatment

Avoid four floating rounded cards.

Preferred:

- four equal columns
- thin separators
- minimal icon
- strong label
- compact explanation
- small action link

Desktop:

```text
4 columns
```

Tablet:

```text
2 × 2
```

Mobile:

```text
1 column
```

Future enhancement:

Create a subtle continuous line or interaction between stages.

This should reinforce:

**Plan → Publish → Engage → Optimize**

rather than communicate four unrelated features.

---

# 16. Product Proof Section

## Layout

Desktop:

```text
Text: 4 columns
Product UI: 8 columns
```

Headline:

# See everything.

# Do anything.

Supporting copy should describe visibility and control.

Example capability list:

- Visual content calendar
- Cross-platform publishing
- Unified social inbox
- Paid ads management
- Advanced analytics & reporting
- Team collaboration & approvals

Use check icons.

Do not place every feature inside its own card.

## Product Visual

Recommended surface:

**Overview / performance dashboard**

Should combine:

- organic performance
- audience growth
- clicks
- conversions
- top content
- paid performance when available

The UI should reinforce the all-in-one positioning.

---

# 17. Results Band

Use a full-width black section to change page rhythm.

Background:

`#0A0A0A`

Text:

`#FFFFFF`

Desktop padding:

```text
56–72px
```

Headline:

# Real results from real marketers

Possible metrics once verified:

- posts published
- accounts managed
- engagements
- ad spend managed
- time saved
- response improvement

## Critical Rule

**Never invent statistics.**

Before real metrics exist, replace the metric row with:

- product capability proof
- platform coverage
- supported networks
- workflow outcomes
- real beta-user feedback

The visual section can remain part of the design system without fake numbers.

---

# 18. Testimonials

Background returns to white.

Headline:

# Loved by marketers who live social

Desktop:

```text
3 columns
```

Card treatment:

- white
- 1px gray border
- 14px radius
- approximately 28px padding
- no heavy shadows

Each testimonial should contain:

- rating if genuine
- quote
- user name
- role
- company
- small avatar when available

Do not publish fictional testimonials.

During development, clearly mark placeholders.

---

# 19. Final CTA

The CTA should visually bring the product idea back together.

Recommended container:

```text
max-width: 1200px
background: #FAFAFA
border: 1px solid #E5E5E5
radius: 16px
padding: 48–64px
```

Desktop composition:

Left visual:

RocketEase icon surrounded by connected network icons.

Right:

# Ready to make launching effortless?

Supporting copy:

> Start your free trial and bring planning, publishing, engagement, and performance into one workflow.

Actions:

**Start free trial**

**Book a demo →**

## Important

The network icons provide the color.

The RocketEase icon remains black and white.

This visually communicates the entire product strategy.

---

# 20. Footer

Dark footer.

Background:

`#0A0A0A`

Primary text:

`#FFFFFF`

Secondary:

`#A3A3A3`

Border:

`#262626`

Suggested columns:

## RocketEase

Short product statement.

Social network links.

## Product

- Features
- Integrations
- Pricing
- What's New
- Roadmap

## Solutions

- Agencies
- Small Business
- Ecommerce
- Multi-location
- Enterprise

Only retain audience categories that become real product priorities.

## Resources

- Blog
- Guides
- Templates
- Help Center
- API / Developers

## Company

- About
- Careers
- Partners
- Contact

Bottom row:

- copyright
- privacy
- terms

---

# 21. Buttons

## Primary

```css
background: #0a0a0a;
color: #ffffff;
height: 48px;
padding: 0 24px;
border-radius: 8px;
font-weight: 600;
```

Hover:

```css
background: #262626;
```

## Secondary

Prefer either:

### Text action

`Book a demo →`

or:

### Outline

```css
background: transparent;
border: 1px solid #d4d4d4;
color: #0a0a0a;
```

Avoid having several competing high-contrast button styles.

---

# 22. Iconography

Use simple line or solid icons.

Font Awesome is appropriate if used consistently.

Recommended stroke visual weight:

```text
1.75–2px equivalent
```

Feature icons should generally remain monochrome.

Use platform logos when referring to the platforms themselves.

---

# 23. Responsive Behavior

## Breakpoints

Recommended Tailwind-style targets:

```text
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

## Hero

Desktop:

two columns.

Tablet:

approximately 45 / 55.

Mobile:

stack.

Order:

1. headline
2. supporting copy
3. CTA
4. reassurance
5. product interface

Mobile hero headline:

```text
44–52px
line-height: 0.98
```

## Product UI

Do not simply shrink a desktop dashboard until it becomes unreadable.

On mobile:

- crop intelligently
- show important portions
- simplify UI framing
- allow horizontal overflow only when intentional
- create mobile-specific screenshots where appropriate

---

# 24. Mobile Spacing

Page gutter:

```text
20px
```

Section vertical spacing:

```text
64px
```

Hero top:

```text
48px
```

Headline to body:

```text
24px
```

Body to CTA:

```text
28px
```

CTA buttons:

stack when required.

Minimum button height:

```text
48px
```

---

# 25. Motion

Motion should explain the workflow rather than decorate the page.

## Recommended

Hero calendar:

- posts gently appear into scheduled slots
- create-post composer slides into place
- network icons activate as channels are selected

Workflow:

Plan → Publish → Engage → Optimize may activate as the user scrolls.

Product proof:

chart line may draw once.

Final CTA:

network nodes may subtly connect to the RocketEase mark.

## Timing

Typical:

```text
180–350ms
```

Large reveal:

```text
400–600ms
```

## Easing

Use restrained natural easing.

Avoid:

- exaggerated spring physics
- bouncing
- floating elements
- endless motion
- parallax for decoration
- glowing network effects

Respect:

```css
prefers-reduced-motion
```

---

# 26. Application Design Relationship

The marketing site and application should clearly belong to the same product.

Carry into the application:

- black navigation
- white surfaces
- subtle gray borders
- monochrome controls
- platform color only for platform context
- the RocketEase conversation icon
- restrained radius
- strong typography

The landing page should feel like an extension of the application rather than a separate marketing theme.

---

# 27. Image and Screenshot Direction

Use real product screens as soon as they exist.

Screens should:

- contain believable data
- reflect actual features
- match production UI
- use realistic social posts
- show actual network icons
- maintain consistent sizing and shadows

Do not use random stock photography simply because a section needs visual content.

When people appear, they should usually be inside:

- content previews
- profile avatars
- actual campaign examples
- testimonial photography

---

# 28. Accessibility

Minimum target:

**WCAG 2.2 AA**

Requirements:

- semantic HTML
- accessible navigation
- keyboard operability
- focus states
- correct heading hierarchy
- minimum contrast
- meaningful alt text
- reduced-motion support
- 44px+ interactive targets where practical
- non-color status indicators
- accessible forms
- descriptive CTAs

Platform colors must never be the only way information is communicated.

---

# 29. Performance

The visual system should remain lightweight.

Targets:

- optimized WebP/AVIF images
- responsive image sizes
- lazy-load below-fold screenshots
- avoid unnecessary WebGL
- minimize animation libraries
- server-render as much as possible
- preload only critical font resources
- prevent layout shift
- optimize product screenshots

Target:

**90+ Lighthouse performance** for production marketing pages where practical.

---

# 30. Suggested Technical Implementation

Recommended stack:

- Next.js App Router
- React
- Tailwind CSS
- DaisyUI or existing internal component system
- Font Awesome
- Framer Motion only where motion genuinely improves communication

Use CSS variables for brand tokens.

Example:

```css
:root {
    --background: #ffffff;
    --foreground: #0a0a0a;

    --surface: #fafafa;
    --surface-muted: #f5f5f5;

    --border: #e5e5e5;
    --border-strong: #d4d4d4;

    --text-primary: #0a0a0a;
    --text-secondary: #595959;
    --text-muted: #737373;

    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 14px;
    --radius-xl: 18px;

    --container: 1280px;
}
```

---

# 31. Production Page Order

The canonical landing page structure should be:

## 01 — Navigation

Simple and restrained.

## 02 — Hero

**Effortless Launch. Better by Design.**

Full product demonstration.

## 03 — Trust

Real credibility only.

## 04 — Workflow

**One platform. Every step.**

Plan → Publish → Engage → Optimize

## 05 — Product Proof

**See everything. Do anything.**

Show the breadth of the system.

## 06 — Results

Strong dark visual interruption.

Only real proof.

## 07 — Testimonials

Human credibility.

## 08 — Final CTA

**Ready to make launching effortless?**

## 09 — Footer

Full but restrained navigation.

---

# 32. Visual Rhythm

The page should alternate between:

**message → product → explanation → product → proof**

rather than:

**headline → six cards → headline → six cards → headline → six cards**

The product itself should repeatedly reappear throughout the story.

Visitors should gradually understand the system without needing to read a complete feature catalog.

---

# 33. Build Do / Don't

## Do

- use black and white aggressively
- give sections generous breathing room
- keep typography bold and clear
- show the actual product
- let platform colors appear naturally
- make workflow the organizing idea
- keep components restrained
- use meaningful contrast
- make mobile intentional
- favor real proof
- allow whitespace to carry visual weight

## Don't

- add gradients
- add eyebrow headings
- use editorial layouts
- fill every empty area
- turn every feature into a card
- invent metrics
- invent testimonials
- create decorative AI imagery
- overuse shadows
- over-round everything
- introduce a RocketEase accent color merely because SaaS products traditionally have one
- compete visually with the social platforms

---

# 34. Brand Design Test

Every major design choice should answer:

> **Does this make RocketEase feel like the calm operating layer behind every social platform?**

If the design begins competing with the networks, adding unnecessary decoration, or looking more like a marketing template than a product, simplify it.

---

# 35. Canonical Landing-Page Message

The core narrative should remain:

# Effortless Launch.

# Better by Design.

**Plan.**

Know what goes out and when.

**Publish.**

Reach every network from one place.

**Engage.**

Bring conversations together.

**Optimize.**

Understand what works and do more of it.

RocketEase should feel less like another social media tool and more like **the place where social marketing runs.**

---

# 36. Final Production Principle

RocketEase does not need to visually overpower Instagram, Facebook, TikTok, LinkedIn, YouTube, or any other network.

It exists to make all of them manageable.

The landing page should communicate that before the visitor finishes the first screen:

> **All the noise belongs to social media.  
> RocketEase brings the order.**
