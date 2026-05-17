import { X } from "lucide-react";
import ComboCard from "./ComboCard";

export default function ComboDetailModal({ combo, relatedCombos = [], onClose, onSelect }) {
  if (!combo) return null;

  return (
    <div className="combo-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="combo-modal" role="dialog" aria-modal="true" aria-label={combo.name} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="combo-modal-close" onClick={onClose} aria-label="Đóng chi tiết combo">
          <X size={20} />
        </button>
        <ComboCard combo={combo} onSelect={onSelect} />
        {relatedCombos.length ? (
          <div className="combo-modal-related">
            <p className="eyebrow">Combo liên quan</p>
            <div className="combo-related-row">
              {relatedCombos.map((item) => (
                <ComboCard key={item.id} combo={item} compact />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
