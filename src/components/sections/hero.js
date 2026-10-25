import React from 'react';
import styled from 'styled-components';

const StyledHeroSection = styled.section`
  ${({ theme }) => theme.mixins.flexCenter};
  flex-direction: column;
  align-items: flex-start;
  min-height: 100vh;
  padding: 0;

  @media (max-width: 480px) and (min-height: 700px) {
    padding-bottom: 10vh;
  }

  h1 {
    margin: 0 0 12px 2px;
    color: var(--slate);
    font-size: clamp(24px, 4vw, 36px);
    font-weight: 600;
    line-height: 1.1;
  }

  h2 {
    margin: 0;
    color: var(--lightest-slate);
    line-height: 1;
  }

  .principle {
    margin: 40px 0 0;
    max-width: 640px;
  }

  .principle-label {
    margin: 0 0 12px;
    color: var(--green);
    font-family: var(--font-mono);
    font-size: var(--fz-sm);
  }

  .principle-lead {
    margin: 0;
    color: var(--slate);
    font-size: clamp(var(--fz-lg), 2.4vw, var(--fz-xxl));
    line-height: 1.4;
  }

  .principle-words {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
    color: var(--lightest-slate);
    font-size: clamp(22px, 3.6vw, 34px);
    font-weight: 600;
    line-height: 1.3;

    li + li:before {
      content: '/';
      margin: 0 14px;
      color: var(--green);
      font-family: var(--font-mono);
      font-weight: 400;
    }
  }

  .email-link {
    ${({ theme }) => theme.mixins.bigButton};
    margin-top: 50px;
  }

  @media (prefers-reduced-motion: no-preference) {
    .hero-item {
      animation: fadeUp 0.7s var(--easing) both;
      animation-delay: calc(var(--i) * 120ms + 100ms);
    }

    .principle-words li {
      animation: fadeUp 0.6s var(--easing) both;
      animation-delay: calc(var(--w) * 180ms + 650ms);
    }
  }
`;

const principles = ['Clear.', 'Tested.', 'Hard to break quietly.'];

const Hero = () => {
  const two = <h1>Sanica Vinayak Myana</h1>;
  const three = <h2 className="big-heading">Java Backend Engineer.</h2>;
  const four = (
    <div className="principle">
      <p className="principle-label">{'// how I build'}</p>
      <p className="principle-lead">I build systems the way I&apos;d want to inherit them:</p>
      <ul className="principle-words">
        {principles.map((word, i) => (
          <li key={word} style={{ '--w': i }}>
            {word}
          </li>
        ))}
      </ul>
    </div>
  );
  const five = (
    <a
      className="email-link"
      href="/Resume_SanicaVinayakMyana.pdf"
      target="_blank"
      rel="noopener noreferrer">
      Resume
    </a>
  );

  const items = [two, three, four, five];

  return (
    <StyledHeroSection>
      {items.map((item, i) => (
        <div key={i} className="hero-item" style={{ '--i': i }}>
          {item}
        </div>
      ))}
    </StyledHeroSection>
  );
};

export default Hero;
