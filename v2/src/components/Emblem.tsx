/* Official JIAN CHA artwork (public/brand) — never redraw the mark. */
/** Horizontal lockup (brandmark + JIAN CHA wordmark) for dark bars, with an optional product sub-label. */
export function BrandBar({ sub }: { sub: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/jiancha-logo-white.png" alt="JIAN CHA" className="logo" width={1200} height={241} />
      <span className="sub">{sub}</span>
    </>
  );
}
/** Primary (stacked) logo for dark grounds. */
export function BrandStack({ width = 150 }: { width?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/jiancha-stack-white.png" alt="JIAN CHA" className="stack" width={width} height={Math.round(width * 554 / 640)} />;
}
