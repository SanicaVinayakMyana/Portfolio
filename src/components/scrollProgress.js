import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { usePrefersReducedMotion } from '@hooks';

const StyledProgress = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  z-index: 20;
  width: 100%;
  height: 2px;
  background-color: var(--green);
  transform: scaleX(0);
  transform-origin: left;
  pointer-events: none;
`;

const ScrollProgress = () => {
  const bar = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    let frame = null;
    const update = () => {
      frame = null;
      const { scrollHeight, clientHeight } = document.documentElement;
      const max = scrollHeight - clientHeight;
      const progress = max > 0 ? window.pageYOffset / max : 0;
      if (bar.current) {
        bar.current.style.transform = `scaleX(${progress})`;
      }
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
  }, [prefersReducedMotion]);

  if (prefersReducedMotion) {
    return null;
  }

  return <StyledProgress ref={bar} aria-hidden="true" />;
};

export default ScrollProgress;
