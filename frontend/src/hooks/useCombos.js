import { useEffect, useMemo, useState } from "react";
import { bookingApi } from "../services/api";

export function useCombos(filters = {}) {
  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const filterKey = JSON.stringify(filters);
  const requestFilters = useMemo(() => JSON.parse(filterKey), [filterKey]);

  useEffect(() => {
    let cancelled = false;

    const loadCombos = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await bookingApi.get("/combos", {
          params: Object.fromEntries(
            Object.entries(requestFilters).filter(([, value]) => value !== "" && value !== null && value !== undefined),
          ),
        });
        if (!cancelled) {
          setCombos(response.data.combos || []);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.response?.data?.error || "Không thể tải danh sách combo Bella.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadCombos();
    return () => {
      cancelled = true;
    };
  }, [requestFilters]);

  return { combos, loading, error };
}

export function useComboDetail(slug) {
  const [combo, setCombo] = useState(null);
  const [relatedCombos, setRelatedCombos] = useState([]);
  const [loading, setLoading] = useState(Boolean(slug));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return undefined;
    let cancelled = false;

    const loadCombo = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await bookingApi.get(`/combos/${slug}`);
        if (!cancelled) {
          setCombo(response.data.combo);
          setRelatedCombos(response.data.relatedCombos || []);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.response?.data?.error || "Không thể tải chi tiết combo.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadCombo();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { combo, relatedCombos, loading, error };
}

export function useBookingPricePreview(payload) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadPreview = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await bookingApi.post("/pricing/preview", payload);
      setPreview(response.data);
      return response.data;
    } catch (requestError) {
      const message = requestError.response?.data?.error || "Không thể tính lại tổng tiền.";
      setError(message);
      setPreview(null);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  return { preview, loading, error, loadPreview };
}
