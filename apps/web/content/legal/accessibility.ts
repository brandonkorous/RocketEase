import type { LegalDoc } from "./types";
import { CONTACT, LEGAL_EFFECTIVE } from "@/lib/site";

export const ACCESSIBILITY: LegalDoc = {
  slug: "accessibility",
  title: "Accessibility",
  heading: "Accessibility statement",
  lede: "Our conformance target, what we have built for it, what we know is not there yet, and how to tell us when we get it wrong.",
  updated: LEGAL_EFFECTIVE,
  sections: [
    {
      id: "commitment",
      heading: "Our target",
      blocks: [
        "RocketEase targets **WCAG 2.2 Level AA**. That target is written into our design system and into the acceptance criteria for every page: a page is not finished until its primary task works with a keyboard alone and at 320 pixels wide.",
        {
          note: "**Conformance status: partially conformant.** Most of the product meets Level AA. The known gaps in section 4 do not. We would rather list them than claim a conformance we have not verified end to end.",
        },
      ],
    },
    {
      id: "what-we-do",
      heading: "What we have built",
      blocks: [
        {
          list: [
            "**Status is never colour alone.** Every state — published, failed, needs approval, connection unhealthy — carries an icon and a text label as well as a colour.",
            "**Contrast.** The interface is monochrome by design, which puts text contrast well above the 4.5:1 minimum. Colour appears only on social network marks and per-network chart series.",
            "**Keyboard.** Every interactive control is reachable and operable by keyboard, with a visible focus indicator and a skip-to-content link on every page.",
            "**Structure.** Semantic headings, landmarks, lists and tables; form fields with real labels; errors announced and tied to the field they belong to.",
            "**Media.** Alt text is a first-class field on every asset and every post variant, in the composer where you are already working rather than buried in a settings panel.",
            "**Motion.** Animation is 150–350ms, used only to explain a change, and is disabled entirely under `prefers-reduced-motion`.",
            "**Zoom and reflow.** Content reflows to 320 pixels wide without horizontal scrolling and supports 200% text zoom.",
          ],
        },
      ],
    },
    {
      id: "testing",
      heading: "How we test",
      blocks: [
        "Automated checks run in our end-to-end browser suite on every change. Beyond that we test manually with keyboard-only navigation, with the browser zoomed to 200%, and with VoiceOver on macOS and NVDA on Windows.",
        "We have **not** commissioned an independent third-party accessibility audit. When we do, we will publish the report and this statement will link to it.",
      ],
    },
    {
      id: "known-gaps",
      heading: "Known gaps",
      blocks: [
        {
          list: [
            "**Dense analytics charts.** Trend and breakdown charts are difficult with a screen reader. Every chart has an accessible data table behind it, but the charts themselves are not yet fully described. Use the table view or export to CSV.",
            "**Calendar drag-and-drop.** Rescheduling by dragging has a keyboard equivalent in the post's own menu, but the drag interaction itself is pointer-only.",
            "**Third-party content.** Network authorisation screens, and the Stripe checkout and billing portal, are operated by those companies. We cannot fix their accessibility, and we do not claim conformance for them.",
            "**Customer-supplied content.** Alt text on media, and the readability of copy you write, are yours to get right. We prompt for alt text; we do not invent it for you.",
          ],
        },
        "We are working on these. This list is updated as gaps close and as new ones are found.",
      ],
    },
    {
      id: "feedback",
      heading: "Tell us when we get it wrong",
      blocks: [
        `Email [${CONTACT.support}](mailto:${CONTACT.support}) with the page, what you were trying to do, and the assistive technology and browser you were using. **We treat accessibility reports as bugs, not feature requests**, and we aim to acknowledge within 3 business days.`,
        "If you need information from RocketEase in an alternative format, ask and we will provide it.",
      ],
    },
  ],
};
