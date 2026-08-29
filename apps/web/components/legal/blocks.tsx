import { Table } from "@wizeworks/silicaui-react";
import type { Block } from "@/content/legal/types";
import { Inline } from "./inline";

export function BlockList({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  if (typeof block === "string") {
    return (
      <p className="mt-4 text-base leading-relaxed text-secondary">
        <Inline text={block} />
      </p>
    );
  }
  if ("note" in block) {
    return (
      <p className="mt-5 border-l-2 border-base-content/20 bg-base-200 py-3 pr-4 pl-4 text-base leading-relaxed text-base-content">
        <Inline text={block.note} />
      </p>
    );
  }
  if ("list" in block) return <ListBlock list={block.list} ordered={block.ordered} />;
  return <TableBlock head={block.table.head} rows={block.table.rows} />;
}

function ListBlock({ list, ordered }: { list: string[]; ordered?: boolean }) {
  const className = "mt-4 space-y-2.5 pl-5 text-base leading-relaxed text-secondary";
  const items = list.map((item, i) => (
    <li key={i} className="pl-1.5">
      <Inline text={item} />
    </li>
  ));
  return ordered ? (
    <ol className={`list-decimal ${className}`}>{items}</ol>
  ) : (
    <ul className={`list-disc ${className}`}>{items}</ul>
  );
}

function TableBlock({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-box border border-base-300">
      <Table className="w-full text-sm">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="text-left align-bottom font-semibold text-base-content">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="align-top text-secondary">
                  <Inline text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
