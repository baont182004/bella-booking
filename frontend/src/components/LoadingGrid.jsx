export default function LoadingGrid({ count = 3, className = "", variant = "hotel" }) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={`loading-card loading-card-${variant}`}>
          {variant === "hotel" ? <div className="loading-visual" /> : null}
          <div className="loading-content">
            <span className="loading-line loading-line-title" />
            <span className="loading-line loading-line-wide" />
            <span className="loading-line loading-line-mid" />
            <div className="loading-pill-row">
              <span className="loading-pill" />
              <span className="loading-pill" />
              <span className="loading-pill" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
