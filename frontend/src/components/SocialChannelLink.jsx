import { ExternalLink, Facebook } from "lucide-react";
import { bellaContent } from "../content/bellaContent";

function joinClassNames(...values) {
  return values.filter(Boolean).join(" ");
}

export default function SocialChannelLink({
  className = "",
  channel = "facebook",
  title,
  description,
  compact = false,
}) {
  const socialChannel = bellaContent.social[channel] || bellaContent.social.facebook;
  const isFacebook = channel === "facebook";
  const nextTitle = title || (isFacebook ? "Xem fanpage Facebook" : "Xem TikTok Bella");
  const nextDescription = description || socialChannel.supportingCopy;

  return (
    <a
      href={socialChannel.url}
      target="_blank"
      rel="noopener noreferrer"
      className={joinClassNames(
        "social-channel-link",
        compact ? "social-channel-link-compact" : "",
        className,
      )}
      aria-label={`Mở ${socialChannel.label} trong tab mới`}
    >
      <span className="social-channel-icon" aria-hidden="true">
        {isFacebook ? <Facebook size={compact ? 16 : 18} /> : <strong>TikTok</strong>}
      </span>
      <span className="social-channel-copy">
        <strong>{nextTitle}</strong>
        <span>{nextDescription}</span>
      </span>
      <ExternalLink size={16} className="social-channel-arrow" aria-hidden="true" />
    </a>
  );
}
