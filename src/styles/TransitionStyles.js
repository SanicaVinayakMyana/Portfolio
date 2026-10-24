import { css } from 'styled-components';

// https://reactcommunity.org/react-transition-group/css-transition

const TransitionStyles = css`
  /* Fade up */
  .fadeup-enter {
    opacity: 0.01;
    transform: translateY(20px);
    transition: opacity 300ms var(--easing), transform 300ms var(--easing);
  }

  .fadeup-enter-active {
    opacity: 1;
    transform: translateY(0px);
    transition: opacity 300ms var(--easing), transform 300ms var(--easing);
  }

  /* Fade down */
  .fadedown-enter {
    opacity: 0.01;
    transform: translateY(-20px);
    transition: opacity 300ms var(--easing), transform 300ms var(--easing);
  }

  .fadedown-enter-active {
    opacity: 1;
    transform: translateY(0px);
    transition: opacity 300ms var(--easing), transform 300ms var(--easing);
  }

  /* Fade */
  .fade-enter {
    opacity: 0;
  }
  .fade-enter-active {
    opacity: 1;
    transition: opacity 300ms var(--easing);
  }
  .fade-exit {
    opacity: 1;
  }
  .fade-exit-active {
    opacity: 0;
    transition: opacity 300ms var(--easing);
  }

  /* Entrance keyframes */
  @keyframes fadeUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes panelIn {
    from {
      opacity: 0;
      transform: translateX(12px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  /* Scroll reveals, driven by useRevealOnScroll (only active when motion is allowed) */
  @media (prefers-reduced-motion: no-preference) {
    .reveal-ready .numbered-heading:after {
      transform: scaleX(0);
      transform-origin: left;
      transition: transform 0.9s var(--easing) 0.2s;
    }

    .reveal-ready .numbered-heading.is-visible:after {
      transform: scaleX(1);
    }

    .reveal-ready .stagger > * {
      opacity: 0;
      transform: translateY(12px);
      transition: opacity 0.5s var(--easing), transform 0.5s var(--easing);
      transition-delay: calc(var(--i, 0) * 50ms + 150ms);
    }

    .reveal-ready .stagger.is-visible > * {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

export default TransitionStyles;
