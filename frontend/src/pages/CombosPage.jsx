import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ComboFilterBar from "../components/ComboFilterBar";
import ComboGrid from "../components/ComboGrid";
import ComboCard from "../components/ComboCard";
import LoadingGrid from "../components/LoadingGrid";
import { useComboDetail, useCombos } from "../hooks/useCombos";

export default function CombosPage() {
  const { slug } = useParams();
  const [filters, setFilters] = useState({ suitableFor: "", nights: "", sort: "displayOrder" });
  const { combos, loading, error } = useCombos(filters);
  const { combo, relatedCombos, loading: detailLoading, error: detailError } = useComboDetail(slug);

  useEffect(() => {
    document.title = slug ? "Chi tiết combo Bella | Bella Hotel Phú Quốc" : "Combo & Ưu đãi | Bella Hotel Phú Quốc";
  }, [slug]);

  if (slug) {
    return (
      <section className="page-section combo-page">
        <div className="shell-container section-stack">
          {detailLoading ? (
            <LoadingGrid count={1} />
          ) : detailError || !combo ? (
            <div className="empty-state">
              <div className="empty-state-stack">
                <p>{detailError || "Không tìm thấy combo này."}</p>
                <Link to="/combos" className="button button-primary">Xem tất cả combo</Link>
              </div>
            </div>
          ) : (
            <>
              <section className="combo-detail-hero">
                <div className="combo-detail-banner">
                  <img src={combo.imageUrl} alt={combo.name} />
                </div>
                <div className="combo-detail-copy">
                  <p className="eyebrow">{combo.badgeLabel || "Combo Bella"}</p>
                  <h1 className="section-title">{combo.name}</h1>
                  <p className="section-copy">{combo.description}</p>
                  <div className="combo-detail-actions">
                    <Link to="/rooms" className="button button-primary">Chọn phòng để đặt combo</Link>
                    <Link to="/combos" className="button button-secondary">Xem combo khác</Link>
                  </div>
                </div>
              </section>

              <section className="combo-detail-grid">
                <article className="panel combo-detail-panel">
                  <p className="eyebrow">Bao gồm</p>
                  <div className="combo-service-list combo-service-list-large">
                    {combo.includedServices.map((service) => <span key={service}>{service}</span>)}
                  </div>
                </article>
                <article className="panel combo-detail-panel">
                  <p className="eyebrow">Điều kiện áp dụng</p>
                  <div className="info-list">
                    <div><span>Thời gian</span><strong>{combo.durationLabel}</strong></div>
                    <div><span>Phù hợp</span><strong>{combo.suitableFor}</strong></div>
                    <div><span>Loại phòng</span><strong>{combo.roomTypesAllowed.join(", ") || "Linh hoạt"}</strong></div>
                  </div>
                  <ul className="combo-terms-list">
                    {combo.termsAndConditions.map((term) => <li key={term}>{term}</li>)}
                  </ul>
                </article>
              </section>

              {relatedCombos.length ? (
                <section className="page-subsection">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Gợi ý thêm</p>
                      <h2 className="section-title section-title-small">Combo liên quan</h2>
                    </div>
                  </div>
                  <div className="combo-grid">
                    {relatedCombos.map((item) => <ComboCard key={item.id} combo={item} />)}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="page-section combo-page">
      <div className="shell-container section-stack section-stack-large">
        <section className="combo-page-hero panel panel-hero">
          <p className="eyebrow">Combo & Ưu đãi Bella</p>
          <h1 className="section-title">Chọn một combo để chuyến đi Phú Quốc trọn vẹn hơn.</h1>
          <p className="section-copy">
            Tận hưởng phòng nghỉ, di chuyển và trải nghiệm trong một gói tiện lợi. Bạn vẫn có thể đặt phòng mà không chọn combo.
          </p>
        </section>

        <section className="page-subsection">
          <ComboFilterBar filters={filters} onChange={setFilters} />
          <ComboGrid combos={combos} loading={loading} error={error} />
        </section>
      </div>
    </section>
  );
}
