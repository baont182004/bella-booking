import { useEffect, useRef } from "react";
import RoomCard from "./RoomCard";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function mapRange(value, inMin, inMax, outMin, outMax) {
  const progress = clamp((value - inMin) / (inMax - inMin), 0, 1);
  return outMin + (outMax - outMin) * progress;
}

export default function FeaturedRoomCompare({ rooms = [] }) {
  const sectionRef = useRef(null);
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const section = sectionRef.current;
    const leftPanel = leftRef.current;
    const rightPanel = rightRef.current;

    if (!section || !leftPanel || !rightPanel) return undefined;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const applyPanelState = (panel, translateX, translateY, opacity, blur, scale) => {
      panel.style.transform =
        translateY !== 0
          ? `translate3d(0, ${translateY.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`
          : `translate3d(${translateX.toFixed(2)}px, 0, 0) scale(${scale.toFixed(4)})`;
      panel.style.opacity = opacity.toFixed(3);
      panel.style.filter = `blur(${blur.toFixed(2)}px)`;
    };

    const updatePanels = () => {
      frameRef.current = 0;

      const rect = section.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 1;
      const viewportCenter = viewportHeight / 2;
      const sectionCenter = rect.top + rect.height / 2;
      const distanceFromCenter = Math.abs(sectionCenter - viewportCenter);
      const isMobile = window.innerWidth <= 900;
      const maxDistance = viewportHeight * (isMobile ? 0.72 : 0.55);
      const focus = 1 - clamp(distanceFromCenter / maxDistance, 0, 1);
      const eased = prefersReducedMotion.matches ? focus : 1 - Math.pow(1 - focus, 3);

      const translate = mapRange(eased, 0, 1, isMobile ? 18 : 60, 0);
      const blur = prefersReducedMotion.matches
        ? 0
        : mapRange(eased, 0, 1, isMobile ? 3.5 : 10, 0);
      const opacity = mapRange(eased, 0, 1, isMobile ? 0.74 : 0.48, 1);
      const scale = mapRange(eased, 0, 1, isMobile ? 0.992 : 0.985, 1);
      const translateY = isMobile ? translate : 0;

      applyPanelState(leftPanel, isMobile ? 0 : -translate, translateY, opacity, blur, scale);
      applyPanelState(rightPanel, isMobile ? 0 : translate, translateY, opacity, blur, scale);
    };

    const requestUpdate = () => {
      if (frameRef.current) return;
      frameRef.current = window.requestAnimationFrame(updatePanels);
    };

    requestUpdate();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

  if (!rooms.length) return null;

  return (
    <div ref={sectionRef} className="compare-section">
      <div className="compare-grid">
        {rooms.map((room, index) => {
          const isLeft = index === 0;
          return (
            <div
              key={room.code}
              ref={isLeft ? leftRef : rightRef}
              className={isLeft ? "compare-panel compare-panel--left" : "compare-panel compare-panel--right"}
            >
              <RoomCard room={room} variant="compare" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
