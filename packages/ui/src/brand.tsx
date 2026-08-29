/**
 * The RocketEase wordmark. "Rocket" keeps the inherited (bold) weight and
 * "Ease" drops to regular, matching the logo lockup in images/logo.png.
 * Pair with `Mark` from ./icons for the horizontal lockup.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      Rocket<span className="font-normal">Ease</span>
    </span>
  );
}
