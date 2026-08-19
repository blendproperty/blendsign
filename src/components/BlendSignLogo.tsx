type BlendSignLogoProps = {
  inverse?: boolean;
  className?: string;
};

export function BlendSignLogo({ inverse = false, className = "" }: BlendSignLogoProps) {
  return (
    <span className={`blend-sign-logo ${inverse ? "is-inverse" : ""} ${className}`.trim()}>
      <img src="/brand/blend-property-logo.svg" alt="Blend Property Group" />
      <span>SIGN</span>
    </span>
  );
}
