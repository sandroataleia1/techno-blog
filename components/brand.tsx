// Brand assets: the Techno Blog mark (a signal/circuit node — generic across
// every tech category, not tied to any one product type) and the data-bar
// motif used sparingly across hero, dividers, footer and the OG image.

export function LogoMark({tone = "on-light", size = 32, className}: {tone?: "on-light" | "on-dark"; size?: number; className?: string}) {
  const ledFill = tone === "on-dark" ? "#F5F2EA" : "#0B0F14";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="6" y="6" width="24" height="24" rx="7" fill="none" stroke="#8B5CF6" strokeWidth="3.2" />
      <path d="M10.5 19h3.4l2.3-6.4 2.7 12.8 2.3-6.4h3.9" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="21.6" y="7.4" width="5.6" height="5.6" rx="1.4" fill={ledFill} stroke="#8B5CF6" strokeWidth="1.3" />
    </svg>
  );
}

export function Wordmark({className}: {className?: string}) {
  return (
    <span className={`wordmark${className ? ` ${className}` : ""}`}>
      <em>Techno</em>
      <b>Blog</b>
    </span>
  );
}

const WAVE_HEIGHTS = [22, 48, 30, 66, 40, 82, 55, 34, 70, 46, 90, 58, 26, 74, 42, 60, 20, 50, 36, 64, 28, 78, 44, 32, 68, 24, 52, 38, 56, 30, 72, 20];

export function WaveMotif({className, bars = 32}: {className?: string; bars?: number}) {
  const values = WAVE_HEIGHTS.slice(0, bars);
  const gap = 400 / values.length;
  const barWidth = gap * 0.42;
  return (
    <svg className={className} viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {values.map((h, i) => (
        <rect key={i} x={i * gap + (gap - barWidth) / 2} y={50 - h / 2} width={barWidth} height={h} rx={barWidth / 2} fill="currentColor" />
      ))}
    </svg>
  );
}
