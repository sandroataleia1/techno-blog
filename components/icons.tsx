// Linear icon set drawn in-house for Techno Blog. Monochrome, stroke-based, no external icon library.
import type {SVGProps} from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

export function IconBattery(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="7.5" width="16" height="9" rx="1.6" />
      <path d="M21.5 10.5v3" />
      <path d="M6 11v2" strokeWidth="2.2" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2.8 19.5 5.6v5.4c0 5-3.2 8.3-7.5 10.2-4.3-1.9-7.5-5.2-7.5-10.2V5.6L12 2.8Z" />
      <path d="M9 12.2l2.1 2.1L15.4 10" />
    </svg>
  );
}

export function IconWave(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 12h2.4l1.6-6 2.6 12 2.2-9 1.8 6.4 1.8-9.4 1.9 6h4.7" />
    </svg>
  );
}

export function IconDrop(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.2s6 6.6 6 11.1a6 6 0 1 1-12 0c0-4.5 6-11.1 6-11.1Z" />
    </svg>
  );
}

export function IconLink(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="8.5" cy="12" r="4" />
      <circle cx="15.5" cy="12" r="4" />
    </svg>
  );
}

export function IconType(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 8.5c0-2 1.6-3.5 3.6-3.5H15c2 0 3.6 1.5 3.6 3.5v7c0 2-1.6 3.5-3.6 3.5H8.6C6.6 19 5 17.5 5 15.5v-7Z" />
      <path d="M9 9.2h6M9 12h6M9 14.8h3.4" />
    </svg>
  );
}

export function IconDumbbell(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 10v4M6 8.5v7M18 8.5v7M20.5 10v4" />
      <path d="M6 12h12" strokeWidth="2.4" />
    </svg>
  );
}

export function IconBriefcase(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="8" width="18" height="11" rx="1.6" />
      <path d="M8.5 8V6.4c0-.9.7-1.6 1.6-1.6h3.8c.9 0 1.6.7 1.6 1.6V8" />
      <path d="M3 13h18" />
    </svg>
  );
}

export function IconPlane(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M13 3.5 21 11l-3 .7-3-3-1.6.4 1.3 4.4-2 .5-2.4-3.9-4 .9-1-1.3 3.6-2-3-1.4 2-1L13 3.5Z" />
    </svg>
  );
}

export function IconTag(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12.3 3.5h5c1.2 0 2.2 1 2.2 2.2v5c0 .5-.2 1-.6 1.4l-8 8a2 2 0 0 1-2.8 0l-5-5a2 2 0 0 1 0-2.8l8-8c.4-.4.9-.6 1.4-.6Z" />
      <circle cx="16.5" cy="7.5" r="1.3" />
    </svg>
  );
}

export function IconDiamond(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 9.5 9 4h6l4 5.5L12 20.5 5 9.5Z" />
      <path d="M5 9.5h14M9 4l-1.6 5.5L12 20.5M15 4l1.6 5.5L12 20.5" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  );
}

export function IconFlag(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3.5v17" />
      <path d="M6 4.5h10.5l-2.3 3.4 2.3 3.4H6" />
    </svg>
  );
}

export function IconHeadphone(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 13.5v-1.8a8 8 0 0 1 16 0v1.8" />
      <rect x="3" y="13" width="4.4" height="6.4" rx="1.6" />
      <rect x="16.6" y="13" width="4.4" height="6.4" rx="1.6" />
    </svg>
  );
}

export function IconImage(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="1.8" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M4 16.5l5-5 3.5 3.5 2.5-2.5 5 5" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="M20 20l-4.4-4.4" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12h15.5" />
      <path d="M13.5 6.2 19.5 12l-6 5.8" />
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9.5h12V10" />
    </svg>
  );
}

export function IconBox(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8 12 4l8 4-8 4-8-4Z" />
      <path d="M4 8v8l8 4 8-4V8" />
      <path d="M12 12v8" />
    </svg>
  );
}

export function IconGrid(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="4" width="7" height="7" rx="1.3" />
      <rect x="13" y="4" width="7" height="7" rx="1.3" />
      <rect x="4" y="13" width="7" height="7" rx="1.3" />
      <rect x="13" y="13" width="7" height="7" rx="1.3" />
    </svg>
  );
}

export function IconLayout(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="4" width="17" height="16" rx="1.5" />
      <path d="M3.5 9.5h17" />
      <path d="M9 9.5V20" />
    </svg>
  );
}

export function IconList(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="17.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconArchive(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="4.5" width="17" height="4.5" rx="1" />
      <path d="M4.5 9v9a1.5 1.5 0 0 0 1.5 1.5h12A1.5 1.5 0 0 0 19.5 18V9" />
      <path d="M10 13.2h4" />
    </svg>
  );
}

export function IconPodium(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 19.5v-6h5.5v6" />
      <path d="M9 19.5V4.5h6v15" />
      <path d="M15 19.5v-9h5.5v9" />
    </svg>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 6H6.5A1.5 1.5 0 0 0 5 7.5v10A1.5 1.5 0 0 0 6.5 19h10a1.5 1.5 0 0 0 1.5-1.5V15" />
      <path d="M14 5h5v5" />
      <path d="M19 5 11 13" />
    </svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M15 5.5 8 12l7 6.5" />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 5.5 16 12l-7 6.5" />
    </svg>
  );
}

export function IconScale(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v18" />
      <path d="M6.5 6h11" />
      <path d="M3 15 6.5 6 10 15" />
      <path d="M3 15c0 1.4 1.6 2.5 3.5 2.5S10 16.4 10 15" />
      <path d="M14 15 17.5 6 21 15" />
      <path d="M14 15c0 1.4 1.6 2.5 3.5 2.5S21 16.4 21 15" />
    </svg>
  );
}
