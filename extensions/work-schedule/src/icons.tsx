import type { ReactNode } from 'react';

// Lucide-style 24px stroke icons, sized by the caller via CSS.
function Svg({ children }: { children: ReactNode }) {
    return <svg className="fws-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

export const ChevronLeft = () => <Svg><path d="m15 18-6-6 6-6"/></Svg>;
export const ChevronRight = () => <Svg><path d="m9 18 6-6-6-6"/></Svg>;
export const Calendar = () => <Svg><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></Svg>;
export const Plus = () => <Svg><path d="M12 5v14M5 12h14"/></Svg>;
export const Sliders = () => <Svg><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></Svg>;
export const Trash = () => <Svg><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></Svg>;
export const Pencil = () => <Svg><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/><path d="m15 5 4 4"/></Svg>;
export const Check = () => <Svg><path d="M20 6 9 17l-5-5"/></Svg>;
export const X = () => <Svg><path d="M18 6 6 18M6 6l12 12"/></Svg>;
export const FileText = () => <Svg><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M8 13h8M8 17h6"/></Svg>;
export const FileCheck = () => <Svg><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M9 15l2 2 4-4"/></Svg>;
