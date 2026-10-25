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

  p {
    margin: 20px 0 0;
    max-width: 540px;
  }

  .work-ethic {
    margin: 30px 0 0;
    padding-left: 18px;
    max-width: 540px;
    border-left: 2px solid var(--green);
    color: var(--lightest-slate);
    font-size: var(--fz-xl);
    font-weight: 500;
    line-height: 1.4;
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
  }
`;

const Hero = () => {
  const two = <h1>Sanica Vinayak Myana</h1>;
  const three = <h2 className="big-heading">Java Backend Engineer.</h2>;
  const four = (
    <p>
      I build reliable, secure backend systems for payments and fraud detection with Java 21,
      PostgreSQL, Redis and Docker, writing them test-first. I'm currently a Systems Engineer
      Trainee at{' '}
      <a href="https://www.infosys.com/" target="_blank" rel="noreferrer">
        Infosys
      </a>
      .
    </p>
  );
  const workEthic = (
    <blockquote className="work-ethic">
      I build systems the way I'd want to inherit them: clear, tested, and hard to break quietly.
    </blockquote>
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

  const items = [two, three, four, workEthic, five];

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
