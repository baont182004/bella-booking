import { ArrowRight, BedDouble, Maximize, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { formatRoomCategory } from "../utils/formatters";
import {
  getCapacityLabel,
  getReadableBedSummary,
  getRoomHighlights,
  getViewTags,
} from "../utils/roomPresentation";
import RoomHighlights from "./RoomHighlights";
import RoomPriceBlock from "./RoomPriceBlock";

export default function RoomCard({ room, variant = "listing", className = "" }) {
  const isCompare = variant === "compare";
  const factLine = [room.areaSqm ? `${room.areaSqm} m2` : null, getReadableBedSummary(room.bedConfigs)]
    .filter(Boolean)
    .join(" · ");

  const topHighlights = getRoomHighlights(room, isCompare ? 4 : 3);
  const viewTags = getViewTags(room, 2);
  const occupancyLabel = getCapacityLabel(room);
  const classes = ["room-preview-card", `room-preview-card-${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={classes} data-testid={`room-card-${room.code}`}>
      <div className="room-preview-media">
        <img
          src={room.images?.[0] || "/bella/bella-hero.jpg"}
          alt={room.displayName}
          className="room-preview-image"
        />
        <div className="room-preview-badges">
          <span className="room-preview-badge room-preview-badge-category">
            {formatRoomCategory(room.category)}
          </span>
          <span
            className={
              room.isLive
                ? "room-preview-badge room-preview-badge-live"
                : "room-preview-badge"
            }
          >
            {room.isLive ? "Đặt trực tuyến" : "Xem trước"}
          </span>
        </div>
      </div>

      <div className="room-preview-body">
        <div className="room-preview-header">
          <div>
            <h3 className="room-preview-title">{room.displayName}</h3>
            <p className="room-preview-factline">{factLine}</p>
          </div>
          <RoomPriceBlock room={room} showBadges={!isCompare} />
        </div>

        <p className="room-preview-summary">{room.summary}</p>

        <div className="room-preview-meta">
          <span>
            <Maximize size={16} />
            {room.areaSqm ? `${room.areaSqm} m2` : "Chưa có diện tích"}
          </span>
          <span>
            <BedDouble size={16} />
            {getReadableBedSummary(room.bedConfigs)}
          </span>
          {occupancyLabel ? (
            <span>
              <Users size={16} />
              {occupancyLabel}
            </span>
          ) : null}
        </div>

        <RoomHighlights items={viewTags} className="room-chip-row-tight" />
        <RoomHighlights items={topHighlights} className="room-chip-row-tight" />

        <p className="room-preview-note">
          {room.isLive
            ? "Mở trang chi tiết để kiểm tra ngày ở, sức chứa và tổng tiền trước khi giữ chỗ."
            : "Xem trước toàn bộ thông tin phòng, tiện nghi và bố cục trước khi Bella mở đặt trực tuyến."}
        </p>

        <div className="room-preview-actions">
          <Link
            to={`/rooms/${room.code}`}
            className="button button-secondary"
            data-testid={`view-room-${room.code}`}
          >
            Xem chi tiết
          </Link>
          <Link
            to={`/rooms/${room.code}#book`}
            className="button button-primary"
            data-testid={`book-room-${room.code}`}
          >
            {room.isLive ? "Xem giá và đặt" : "Xem cách đặt"}
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}
