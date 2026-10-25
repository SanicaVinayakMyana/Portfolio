import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { usePrefersReducedMotion } from '@hooks';

const SIZE = 46;
const STROKE = 2;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const StyledButton = styled.button`
  position: fixed;
  right: 100px;
  bottom: 30px;
  z-index: 10;
  width: ${SIZE}px;
  height: ${SIZE}px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background-color: var(--light-navy);
  color: var(--green);
  cursor: pointer;
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  visibility: ${({ visible }) => (visible ? 'visible' : 'hidden')};
  transform: translateY(${({ visible }) => (visible ? '0' : '12px')});

  @media (prefers-reduced-motion: no-preference) {
    transition: opacity 0.3s var(--easing), transform 0.3s var(--easing), visibility 0.3s;

    &:hover,
    &:focus-visible {
      transform: translateY(-3px);
    }
  }

  @media (max-width: 1080px) {
    right: 80px;
  }
  @media (max-width: 768px) {
    right: 20px;
    bottom: 20px;
  }

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .track {
    stroke: var(--lightest-navy);
  }

  .ring {
    stroke: var(--green);
    stroke-linecap: round;
  }

  .arrow {
    position: relative;
    display: block;
    width: 16px;
    height: 16px;
    margin: 0 auto;
    transform: none;
  }
`;

/** Round button that appears after the hero; its ring fills with scroll progress. */
const BackToTop = () => {
  const [visible, setVisible] = useState(false);
  const ring = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    let frame = null;
    const update = () => {
      frame = null;
      const { scrollHeight, clientHeight } = document.documentElement;
      const max = scrollHeight - clientHeight;
      const progress = max > 0 ? Math.min(window.pageYOffset / max, 1) : 0;
      if (ring.current) {
        ring.current.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - progress));
      }
      setVisible(window.pageYOffset > window.innerHeight * 0.6);
    };
    const onScroll = () => {
      if (frame === null) {
        frame = window.requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <StyledButton
      type="button"
      visible={visible}
      onClick={scrollToTop}
      aria-label="Back to top"
      tabIndex={visible ? 0 : -1}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" fill="none" strokeWidth={STROKE}>
        <circle className="track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} />
        <circle
          ref={ring}
          className="ring"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE}
        />
      </svg>
      <svg
        className="arrow"
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </StyledButton>
  );
};

export default BackToTop;
