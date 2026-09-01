/*
 * Where each overlay lands. Pure geometry over MEASURED sizes — the renderer
 * measures type with Pango first, then asks this file where to put it.
 *
 * Overlays sharing an anchor stack in plan order rather than piling on top of
 * each other, so "headline then subhead, both centred" is what a person means
 * by it and not two blocks in the same place.
 */
import { placeIn, type Anchor, type Rect, type Size } from "@/lib/media/canvas/geometry";

export type LayoutItem = { id: string; anchor: Anchor; size: Size };
export type PlacedItem = { id: string; anchor: Anchor; rect: Rect };

const horizontalOf = (a: Anchor) => (a.endsWith("_left") ? "left" : a.endsWith("_right") ? "right" : "center");

/** Stacked height of a group, including the gaps between its members. */
const blockSize = (items: LayoutItem[], gutter: number): Size => ({
  width: Math.max(...items.map((i) => i.size.width), 0),
  height: items.reduce((sum, i) => sum + i.size.height, 0) + gutter * Math.max(0, items.length - 1),
});

/** Offset within the block, so a right-anchored group stays flush right. */
function offsetIn(blockWidth: number, itemWidth: number, anchor: Anchor): number {
  const h = horizontalOf(anchor);
  if (h === "left") return 0;
  if (h === "right") return blockWidth - itemWidth;
  return Math.round((blockWidth - itemWidth) / 2);
}

/**
 * Place every item inside `area`. Order is preserved within an anchor group;
 * groups are independent, so a bottom-centre CTA never moves because a headline
 * grew. Items are returned in the input order, which is the paint order.
 */
export function layoutOverlays(items: LayoutItem[], area: Rect, gutter: number): PlacedItem[] {
  const groups = new Map<Anchor, LayoutItem[]>();
  for (const item of items) {
    const list = groups.get(item.anchor);
    if (list) list.push(item);
    else groups.set(item.anchor, [item]);
  }

  const placed = new Map<string, PlacedItem>();
  for (const [anchor, members] of groups) {
    const block = placeIn(area, anchor, blockSize(members, gutter));
    let y = block.y;
    for (const member of members) {
      placed.set(member.id, {
        id: member.id,
        anchor,
        rect: {
          x: block.x + offsetIn(block.width, member.size.width, anchor),
          y,
          width: member.size.width,
          height: member.size.height,
        },
      });
      y += member.size.height + gutter;
    }
  }

  return items.map((i) => placed.get(i.id)!).filter(Boolean);
}
