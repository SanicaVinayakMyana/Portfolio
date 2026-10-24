import { useEffect } from 'react';

// Adds an `is-visible` class to section heading lines and `.stagger` lists
// once they scroll into view, so their CSS entrance animations can play.
const REVEAL_SELECTOR = '.numbered-heading, .stagger';

const useRevealOnScroll = enabled => {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const elements = Array.from(document.querySelectorAll(REVEAL_SELECTOR));
    // Elements only start hidden once this class is set, so the page stays readable without JS
    document.documentElement.classList.add('reveal-ready');

    if (!('IntersectionObserver' in window)) {
      elements.forEach(el => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -40px 0px' },
    );

    elements.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, [enabled]);
};

export default useRevealOnScroll;
