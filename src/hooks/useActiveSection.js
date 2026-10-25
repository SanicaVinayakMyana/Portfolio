import { useEffect, useState } from 'react';

// Returns the id of the section currently in the middle of the viewport, so the nav
// can highlight where the reader is. `ids` are section element ids, e.g. ['about', 'jobs'].
const useActiveSection = ids => {
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    if (!('IntersectionObserver' in window)) {
      return;
    }

    const sections = ids.map(id => document.getElementById(id)).filter(Boolean);
    if (sections.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      // Only the band around the middle of the screen counts, so one section is active at a time
      { rootMargin: '-45% 0px -50% 0px' },
    );

    sections.forEach(section => observer.observe(section));

    const onScroll = () => {
      if (window.pageYOffset < 200) {
        setActiveId(null);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [ids.join(',')]);

  return activeId;
};

export default useActiveSection;
