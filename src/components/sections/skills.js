import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { srConfig } from '@config';
import sr from '@utils/sr';
import { usePrefersReducedMotion } from '@hooks';

const StyledSkillsSection = styled.section`
  max-width: 700px;
`;

const StyledText = styled.div`
  ul.skills-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(140px, 200px));
    grid-gap: 0 10px;
    padding: 0;
    margin: 20px 0 0 0;
    overflow: hidden;
    list-style: none;

    li {
      position: relative;
      margin-bottom: 10px;
      padding-left: 28px;
      font-family: var(--font-mono);
      font-size: var(--fz-xs);

      &:before {
        content: '▹';
        position: absolute;
        left: 0;
        color: var(--green);
        font-size: var(--fz-sm);
        line-height: 12px;
        transition: transform 0.25s var(--easing);
      }

      &:hover {
        color: var(--lightest-slate);

        &:before {
          transform: translateX(4px);
        }
      }
    }
  }
`;

const Skills = () => {
  const revealContainer = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    sr.reveal(revealContainer.current, srConfig());
  }, []);

  const skills = [
    'Java 17 / 21',
    'SQL',
    'Python',
    'Solidity',
    'Spring Boot',
    'REST APIs',
    'Microservices',
    'PostgreSQL',
    'Redis',
    'MySQL',
    'Docker',
    'Kubernetes (basics)',
    'GitHub Actions CI',
    'Linux',
    'JUnit 5',
    'Anomaly Detection',
    'Risk Scoring & RBAC',
    'SIEM (Wazuh)',
  ];

  return (
    <StyledSkillsSection id="skills" ref={revealContainer}>
      <h2 className="numbered-heading">Skills</h2>

      <StyledText>
        {/* <div>
          <p>Here are a few technologies I've been working with recently:</p>
        </div> */}

        <ul className="skills-list stagger">
          {skills &&
            skills.map((skill, i) => (
              <li key={i} style={{ '--i': i }}>
                {skill}
              </li>
            ))}
        </ul>
      </StyledText>
    </StyledSkillsSection>
  );
};

export default Skills;
