import { ExternalLink, Facebook } from "lucide-react";
import { bellaContent } from "../content/bellaContent";

function joinClassNames(...values) {
  return values.filter(Boolean).join(" ");
}

export default function SocialChannelLink({
  className = "",
  title = "Xem fanpage Facebook",
  description = bellaContent.social.facebook.supportingCopy,
  compact = false,
}) {
  const facebook = bellaContent.social.facebook;

  return (
    <a
      href={facebook.url}
      target="_blank"
      rel="noopener noreferrer"
      className={joinClassNames(
        "social-channel-link",
        compact ? "social-channel-link-compact" : "",
        className,
      )}
      aria-label={`Mở ${facebook.label} trong tab mới`}
    >
      <span className="social-channel-icon" aria-hidden="true">
        <Facebook size={compact ? 16 : 18} />
      </span>
      <span className="social-channel-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <ExternalLink size={16} className="social-channel-arrow" aria-hidden="true" />
    </a>
  );
}
