import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { srConfig } from '@config';
import sr from '@utils/sr';
import { usePrefersReducedMotion } from '@hooks';

const StyledPublicationsSection = styled.section`
  max-width: 800px;

  ul {
    ${({ theme }) => theme.mixins.fancyList};
  }

  li {
    margin-bottom: 25px;
  }

  .paper-title {
    color: var(--lightest-slate);
    font-style: italic;
  }

  .venue {
    display: block;
    margin-top: 5px;
    color: var(--green);
    font-family: var(--font-mono);
    font-size: var(--fz-xs);
  }
`;

const publications = [
  {
    title:
      'Adaptive Behavioral Anomaly Detection: Integrating UEBA and EDR for Real-Time Mitigation of Threats and Insider Risks',
    venue: 'Scopus-indexed journal, 2026 (accepted)',
  },
  {
    title:
      'Privacy-Preserving Blockchain-Based Voting Using Temporal Decorrelation in Ethereum Systems',
    venue: 'IEEE, 2026 (accepted) · smart-contract voting system piloted with 50+ voters',
  },
];

const Publications = () => {
  const revealContainer = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    sr.reveal(revealContainer.current, srConfig());
  }, []);

  return (
    <StyledPublicationsSection id="publications" ref={revealContainer}>
      <h2 className="numbered-heading">Publications</h2>

      <ul className="stagger">
        {publications.map(({ title, venue }, i) => (
          <li key={title} style={{ '--i': i * 2 }}>
            <span className="paper-title">{title}</span>
            <span className="venue">{venue}</span>
          </li>
        ))}
      </ul>
    </StyledPublicationsSection>
  );
};

export default Publications;
