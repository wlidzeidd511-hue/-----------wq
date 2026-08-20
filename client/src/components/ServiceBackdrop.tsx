import { useEffect } from "react";
import {
  CircuitBoard,
  Code2,
  Cog,
  Cpu,
  Drill,
  Laptop,
  Smartphone,
  Wrench,
} from "lucide-react";

const slowDecorations = [
  { Icon: Smartphone, className: "-right-8 top-20 h-40 w-40 -rotate-12 sm:right-5 sm:h-52 sm:w-52" },
  { Icon: Laptop, className: "right-2 top-[52%] h-36 w-36 rotate-6 sm:right-10 sm:h-48 sm:w-48" },
  { Icon: CircuitBoard, className: "left-[16%] top-10 hidden h-36 w-36 rotate-12 md:block" },
  { Icon: Cpu, className: "right-[22%] bottom-8 hidden h-40 w-40 -rotate-12 md:block" },
];

const fastDecorations = [
  { Icon: Wrench, className: "-left-10 top-52 h-44 w-44 rotate-[24deg] sm:left-3 sm:h-56 sm:w-56" },
  { Icon: Cog, className: "-left-12 top-[58%] h-48 w-48 -rotate-12 sm:left-5 sm:h-60 sm:w-60" },
  { Icon: Drill, className: "-right-10 bottom-[12%] h-40 w-40 rotate-12 sm:right-8 sm:h-52 sm:w-52" },
  { Icon: Code2, className: "-left-8 bottom-[4%] h-40 w-40 -rotate-6 sm:left-10 sm:h-48 sm:w-48" },
];

export function ServiceBackdrop() {
  useEffect(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const update = () => {
      frame = 0;
      const scroll = reducedMotion.matches ? 0 : window.scrollY;
      root.style.setProperty("--brand-shift-slow", `${scroll * -0.045}px`);
      root.style.setProperty("--brand-shift-fast", `${scroll * -0.085}px`);
      root.style.setProperty("--brand-shift-text", `${scroll * -0.025}px`);
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    reducedMotion.addEventListener("change", requestUpdate);

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      reducedMotion.removeEventListener("change", requestUpdate);
      if (frame) window.cancelAnimationFrame(frame);
      root.style.removeProperty("--brand-shift-slow");
      root.style.removeProperty("--brand-shift-fast");
      root.style.removeProperty("--brand-shift-text");
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(255,237,213,0.75),transparent_34%),radial-gradient(circle_at_85%_18%,rgba(186,230,253,0.72),transparent_38%),linear-gradient(145deg,#fffaf5_0%,#eefaff_48%,#ecfeff_100%)]" />

      <div
        className="absolute inset-x-0 top-[14%] will-change-transform"
        style={{ transform: "translate3d(0,var(--brand-shift-text,0px),0)" }}
      >
        <p className="select-none whitespace-nowrap text-center text-[clamp(3.2rem,9vw,9rem)] font-black leading-none tracking-tight text-sky-600/[0.105]">
          هاتف التميز للاتصالات
        </p>
        <p className="mt-[34vh] select-none whitespace-nowrap text-center text-[clamp(2.8rem,8vw,8rem)] font-black leading-none tracking-tight text-cyan-700/[0.09]">
          هاتف التميز للاتصالات
        </p>
        <p className="mt-[36vh] select-none whitespace-nowrap text-center text-[clamp(3rem,8.5vw,8.5rem)] font-black leading-none tracking-tight text-sky-700/[0.095]">
          هاتف التميز للاتصالات
        </p>
      </div>

      <div
        className="absolute inset-0 text-sky-700/[0.09] will-change-transform"
        style={{ transform: "translate3d(0,var(--brand-shift-slow,0px),0)" }}
      >
        {slowDecorations.map(({ Icon, className }, index) => (
          <Icon key={`${Icon.displayName ?? Icon.name}-slow-${index}`} className={`absolute ${className}`} strokeWidth={1.2} />
        ))}
      </div>

      <div
        className="absolute inset-0 text-cyan-800/[0.075] will-change-transform"
        style={{ transform: "translate3d(0,var(--brand-shift-fast,0px),0)" }}
      >
        {fastDecorations.map(({ Icon, className }, index) => (
          <Icon key={`${Icon.displayName ?? Icon.name}-fast-${index}`} className={`absolute ${className}`} strokeWidth={1.15} />
        ))}
      </div>
    </div>
  );
}
