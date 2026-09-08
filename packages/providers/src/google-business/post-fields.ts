/*
 * The fields of a Business Profile post, shared by the adapter (posts.ts) and
 * the composer panel. Pure: no HTTP, no node modules, so the client entry can
 * export it. Names are Google's (LocalPostTopicType, ActionType); the labels
 * are the wording Google's own post editor shows.
 */
export const TOPIC_TYPES = ["STANDARD", "EVENT", "OFFER"] as const;
export type TopicType = (typeof TOPIC_TYPES)[number];
export const TOPIC_LABEL: Record<TopicType, string> = { STANDARD: "Update", EVENT: "Event", OFFER: "Offer" };

export const ACTION_TYPES = ["LEARN_MORE", "BOOK", "ORDER", "SHOP", "SIGN_UP", "CALL"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];
export const BUTTON_LABEL: Record<ActionType, string> = { LEARN_MORE: "Learn more", BOOK: "Book", ORDER: "Order online", SHOP: "Buy", SIGN_UP: "Sign up", CALL: "Call now" };

/**
 * What the composer stores on the variant for a location. Dates are the
 * location's own calendar ("YYYY-MM-DD") and times "HH:mm" — Google takes
 * them without a zone. `callToAction.url` falls back to the post link.
 */
export type GbpPostSettings = {
  topicType?: TopicType;
  callToAction?: { actionType: ActionType | "NONE"; url?: string };
  event?: { title?: string; startDate?: string; startTime?: string; endDate?: string; endTime?: string };
  offer?: { couponCode?: string; redeemOnlineUrl?: string; termsConditions?: string };
  /** BCP-47; Google's examples use "en-US". */
  languageCode?: string;
};
