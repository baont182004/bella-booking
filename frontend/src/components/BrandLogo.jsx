export default function BrandLogo({ variant = "header" }) {
  if (variant === "footer") {
    return (
      <>
        <span className="brand-logo brand-logo-footer" aria-hidden="true">
          <img
            src="/assets/logo/bella-logo-full.png"
            alt=""
            className="brand-logo-image brand-logo-footer-image"
            width="180"
            height="188"
            loading="eager"
            decoding="async"
          />
        </span>
        <span className="sr-only">Bella Hotel Phu Quoc</span>
      </>
    );
  }

  if (variant === "mark") {
    return (
      <>
        <span className="brand-logo brand-logo-mark" aria-hidden="true">
          <img
            src="/assets/logo/bella-logo-mark.png"
            alt=""
            className="brand-logo-image brand-logo-mark-image"
            width="72"
            height="48"
            loading="eager"
            decoding="async"
          />
        </span>
        <span className="sr-only">Bella Hotel Phu Quoc</span>
      </>
    );
  }

  return (
    <>
      <span className="brand-logo brand-logo-header" aria-hidden="true">
        <img
          src="/assets/logo/bella-logo-header.png"
          alt=""
          className="brand-logo-image brand-logo-header-image"
          width="140"
          height="129"
          loading="eager"
          decoding="async"
        />
        <img
          src="/assets/logo/bella-logo-mark.png"
          alt=""
          className="brand-logo-image brand-logo-header-mobile-image"
          width="72"
          height="48"
          loading="eager"
          decoding="async"
        />
      </span>
      <span className="sr-only">Bella Hotel Phu Quoc</span>
    </>
  );
}
