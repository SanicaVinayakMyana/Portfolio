import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { srConfig } from '@config';
import sr from '@utils/sr';
import { usePrefersReducedMotion } from '@hooks';

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
    margin: 0 0 30px 4px;
    color: var(--green);
    font-family: var(--font-mono);
    font-size: clamp(var(--fz-sm), 5vw, var(--fz-md));
    font-weight: 400;

    @media (max-width: 480px) {
      margin: 0 0 20px 2px;
    }
  }

  h3 {
    margin-top: 10px;
    color: var(--slate);
    line-height: 0.9;
  }

  p {
    margin: 20px 0 0;
    max-width: 540px;
  }

  .email-link {
    ${({ theme }) => theme.mixins.bigButton};
    margin-top: 50px;
  }
`;

const Hero = () => {
  const revealContainer = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    sr.reveal(revealContainer.current, srConfig());
  }, []);

  const two = <h2 className="big-heading">Sanica Vinayak Myana.</h2>;
  const three = <h3 className="big-heading">Java Developer.</h3>;
  const four = (
    <p>
      Final year Computer Engineering student at MMCOE, Pune, with a strong foundation in Java, Data
      Structures, and Object-Oriented Programming.
      <br />I specialise in backend development and building secure, scalable systems using Spring
      Boot, Blockchain, and cybersecurity research.
    </p>
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
        <div key={i} ref={revealContainer}>
          {item}
        </div>
      ))}
    </StyledHeroSection>
  );
};

export default Hero;
