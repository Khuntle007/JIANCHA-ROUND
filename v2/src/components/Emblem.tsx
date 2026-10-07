export function Emblem({ size = 34 }: { size?: number }) {
  return (
    <svg className="emblem" width={size} height={size} viewBox="0 0 200 200" aria-label="JIANCHA" style={{ color: 'var(--jc-gold)' }}>
      <g fill="none" stroke="currentColor" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="100" cy="100" r="82" />
        <path d="M52 122 L86 74 L108 104 L124 86 L150 122" />
        <path d="M50 134 q14 -8 26 0 t26 0 t26 0 t22 0" />
        <path d="M56 148 q14 -8 26 0 t26 0 t26 0" />
      </g>
    </svg>
  );
}
