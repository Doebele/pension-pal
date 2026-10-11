import { useEffect, useState } from "react";
import { loadTaxModel, TaxModel } from "../services/taxModel";

type TaxModelState = {
  data: TaxModel | null;
  loading: boolean;
  error: string;
};

export function useTaxModel(cantonCode: string): TaxModelState {
  const [state, setState] = useState<TaxModelState>({
    data: null,
    loading: true,
    error: "",
  });

  useEffect(() => {
    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    const run = async () => {
      try {
        const data = await loadTaxModel(cantonCode);
        if (!active) return;
        setState({ data, loading: false, error: "" });
      } catch (error) {
        if (!active) return;
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : "Tax model could not be loaded.",
        });
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [cantonCode]);

  return state;
}
