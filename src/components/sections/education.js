import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { srConfig } from '@config';
import sr from '@utils/sr';
import { usePrefersReducedMotion } from '@hooks';

const StyledEducationSection = styled.section`
  max-width: 700px;

  .inner {
    display: flex;
    @media (max-width: 600px) {
      display: block;
    }
    @media (min-width: 700px) {
      min-height: 240px;
    }
  }
`;

const StyledTabList = styled.div`
  position: relative;
  z-index: 3;
  width: max-content;
  padding: 0;
  margin: 0;
  list-style: none;

  @media (max-width: 600px) {
    display: flex;
    overflow-x: auto;
    width: calc(100% + 100px);
    padding-left: 50px;
    margin-left: -50px;
    margin-bottom: 30px;
  }
  @media (max-width: 480px) {
    width: calc(100% + 50px);
    padding-left: 25px;
    margin-left: -25px;
  }

  li {
    &:first-of-type {
      @media (max-width: 600px) {
        margin-left: 50px;
      }
      @media (max-width: 480px) {
        margin-left: 25px;
      }
    }
    &:last-of-type {
      @media (max-width: 600px) {
        padding-right: 50px;
      }
      @media (max-width: 480px) {
        padding-right: 25px;
      }
    }
  }
`;

const StyledTabButton = styled.button`
  ${({ theme }) => theme.mixins.link};
  display: flex;
  align-items: center;
  width: 100%;
  height: var(--tab-height);
  padding: 0 20px 2px;
  border-left: 2px solid var(--lightest-navy);
  background-color: transparent;
  color: ${({ isActive }) => (isActive ? 'var(--green)' : 'var(--slate)')};
  font-family: var(--font-mono);
  font-size: var(--fz-xs);
  text-align: left;
  white-space: nowrap;

  @media (max-width: 768px) {
    padding: 0 15px 2px;
  }
  @media (max-width: 600px) {
    ${({ theme }) => theme.mixins.flexCenter};
    min-width: 120px;
    padding: 0 15px;
    border-left: 0;
    border-bottom: 2px solid var(--lightest-navy);
    text-align: center;
  }

  &:hover,
  &:focus {
    background-color: var(--light-navy);
  }
`;

const StyledHighlight = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  width: 2px;
  height: var(--tab-height);
  border-radius: var(--border-radius);
  background: var(--green);
  transform: translateY(calc(${({ activeTabId }) => activeTabId} * var(--tab-height)));
  transition: transform 0.25s cubic-bezier(0.645, 0.045, 0.355, 1);
  transition-delay: 0.1s;

  @media (max-width: 600px) {
    top: auto;
    bottom: 0;
    width: 100%;
    max-width: var(--tab-width);
    height: 2px;
    margin-left: 50px;
    transform: translateX(calc(${({ activeTabId }) => activeTabId} * var(--tab-width)));
  }
  @media (max-width: 480px) {
    margin-left: 25px;
  }
`;

const StyledTabPanels = styled.div`
  position: relative;
  width: 100%;
  margin-left: 20px;

  @media (max-width: 600px) {
    margin-left: 0;
  }
`;

const StyledTabPanel = styled.div`
  width: 100%;
  height: auto;
  padding: 10px 5px;

  @media (prefers-reduced-motion: no-preference) {
    &:not([hidden]) {
      animation: panelIn 0.45s var(--easing) both;
    }
  }

  ul {
    ${({ theme }) => theme.mixins.fancyList};
  }

  h3 {
    margin-bottom: 2px;
    font-size: var(--fz-xxl);
    font-weight: 500;
    line-height: 1.3;

    .school {
      color: var(--green);
    }
  }

  .range {
    margin-bottom: 25px;
    color: var(--light-slate);
    font-family: var(--font-mono);
    font-size: var(--fz-xs);
  }
`;

const educationData = [
  {
    school: 'Savitribai Phule Pune University',
    degree: 'B.E. in Computer Engineering',
    range: '2022 - 2026',
    details: [
      'CGPA: 8.81 / 10 (First Class with Distinction)',
      'Coursework: Data Structures & Algorithms, DBMS, Operating Systems, Computer Networks',
      '1st Prize, B.E. Project Competition (UEBA)',
      'Top 3 at Avishkar (college level), selected for SPPU-level representation',
    ],
  },
  {
    school: 'Yashshree Academy',
    degree: '11th & 12th',
    range: '2020 - 2022',
    details: ['Marks: 75%'],
  },
  {
    school: 'Takshila School, Ahmednagar',
    degree: '10th Grade',
    range: 'Completed 2020',
    details: ['Marks: 93%'],
  },
];

const Education = () => {
  const [activeTabId, setActiveTabId] = useState(0);
  const revealContainer = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }
    sr.reveal(revealContainer.current, srConfig());
  }, []);

  return (
    <StyledEducationSection id="education" ref={revealContainer}>
      <h2 className="numbered-heading">Education</h2>
      <div className="inner">
        <StyledTabList as="ul">
          {educationData.map((edu, i) => (
            <li key={edu.school}>
              <StyledTabButton
                isActive={activeTabId === i}
                onClick={() => setActiveTabId(i)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') setActiveTabId(i);
                }}
                tabIndex={0}
                type="button"
                role="tab"
                aria-selected={activeTabId === i ? 'true' : 'false'}
                aria-controls={`panel-${i}`}
                id={`tab-${i}`}
              >
                {edu.school}
              </StyledTabButton>
            </li>
          ))}
          <StyledHighlight activeTabId={activeTabId} />
        </StyledTabList>
        <StyledTabPanels>
          {educationData.map((edu, i) => (
            <StyledTabPanel
              key={edu.school}
              id={`panel-${i}`}
              role="tabpanel"
              tabIndex={0}
              aria-labelledby={`tab-${i}`}
              hidden={activeTabId !== i}
            >
              <h3>
                <span className="degree">{edu.degree}</span> <span className="school">@ {edu.school}</span>
              </h3>
              <p className="range">{edu.range}</p>
              <ul>
                {edu.details.map(detail => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </StyledTabPanel>
          ))}
        </StyledTabPanels>
      </div>
    </StyledEducationSection>
  );
};

export default Education; 