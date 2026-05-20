import { Link } from "react-router-dom";
import { Check, Clock3, Sparkles, Users } from "lucide-react";
import { formatCurrency } from "../utils/formatters";

function formatComboPrice(combo) {
  if (!combo) return "Liên hệ";
  const price = formatCurrency(combo.basePrice);
  if (combo.priceType === "per_person") return `${price} / khách`;
  if (combo.priceType === "from_price") return `Từ ${price}`;
  return price;
}

export default function ComboCard({ combo, onSelect, onDeselect, selected = false, compact = false }) {
  const services = (combo.includedServices || []).slice(0, compact ? 3 : 5);

  return (
    <article className={selected ? "combo-card combo-card-selected" : "combo-card"} data-testid="combo-card">
      <div className="combo-card-media">
        {combo.imageUrl ? <img src={combo.imageUrl} alt={combo.name} /> : null}
        <span className="combo-card-badge">{combo.badgeLabel || "Ưu đãi Bella"}</span>
        {selected ? <span className="combo-card-selected-badge">Đang chọn</span> : null}
      </div>
      <div className="combo-card-body">
        <div className="combo-card-head">
          <div>
            <h3>{combo.name}</h3>
            <p>{combo.description}</p>
          </div>
          <strong className="combo-price">{formatComboPrice(combo)}</strong>
        </div>

        <div className="combo-meta-row">
          <span>
            <Clock3 size={15} />
            {combo.durationLabel}
          </span>
          <span>
            <Users size={15} />
            {combo.maxGuests ? `${combo.minGuests}-${combo.maxGuests} khách` : `Từ ${combo.minGuests} khách`}
          </span>
          <span>
            <Sparkles size={15} />
            {combo.suitableFor}
          </span>
        </div>

        <div className="combo-service-list">
          {services.map((service) => (
            <span key={service}>
              <Check size={14} />
              {service}
            </span>
          ))}
        </div>

        <div className="combo-card-actions">
          <Link to={`/combos/${combo.slug}`} className="button button-secondary">
            Xem chi tiết
          </Link>
          {onSelect ? (
            <button
              type="button"
              className={selected ? "button button-secondary" : "button button-primary"}
              onClick={() => (selected && onDeselect ? onDeselect(combo) : onSelect(combo))}
              aria-pressed={selected}
            >
              {selected ? "Bỏ chọn" : "Chọn combo"}
            </button>
          ) : (
            <Link to="/rooms" className="button button-primary">
              Xem hạng phòng
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
