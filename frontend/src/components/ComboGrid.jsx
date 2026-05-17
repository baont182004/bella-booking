import { Gift } from "lucide-react";
import ComboCard from "./ComboCard";
import LoadingGrid from "./LoadingGrid";

export default function ComboGrid({ combos, loading, error, onSelect, selectedSlug }) {
  if (loading) {
    return <LoadingGrid count={4} className="combo-grid loading-grid" />;
  }

  if (error) {
    return (
      <div className="empty-state combo-empty-state">
        <div className="empty-state-stack">
          <Gift size={28} />
          <p>{error}</p>
          <span>Vui lòng thử lại hoặc đặt phòng không kèm combo.</span>
        </div>
      </div>
    );
  }

  if (!combos.length) {
    return (
      <div className="empty-state combo-empty-state">
        <div className="empty-state-stack">
          <Gift size={28} />
          <p>Chưa có combo phù hợp với bộ lọc này.</p>
          <span>Hãy đổi số đêm hoặc nhóm khách để xem thêm gói ưu đãi Bella.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="combo-grid">
      {combos.map((combo) => (
        <ComboCard
          key={combo.id}
          combo={combo}
          onSelect={onSelect}
          selected={selectedSlug === combo.slug}
        />
      ))}
    </div>
  );
}
