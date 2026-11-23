import type { components } from "./api";

type Schema = components["schemas"];

/** Fields consumed by the UI. Keep the full worker snapshot intact for publish. */
export interface PublicationSnapshot {
  run_id: string;
  business_analytics: Record<string, Schema["BusinessAnalyticsResponse"]>;
  forecast_graph: Schema["ForecastGraphResponse"];
  forecast_outlook: Schema["ForecastOutlookResponse"];
  strategic_actions: Schema["StrategicActionsResponse"];
}

export function isSnapshot(value: unknown): value is PublicationSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<PublicationSnapshot>;
  return typeof snapshot.run_id === "string" && snapshot.run_id.length > 0 &&
    !!snapshot.business_analytics?.overall && Array.isArray(snapshot.forecast_graph?.data) &&
    Array.isArray(snapshot.forecast_outlook?.critical_weeks) && Array.isArray(snapshot.strategic_actions?.actions);
}

export interface ForecastRow {
  week_start: string;
  week_end: string;
  forecast_bookings: number;
  confidence_lower_95: number;
  confidence_upper_95: number;
}

export function isForecastRow(row: unknown): row is ForecastRow {
  if (!row || typeof row !== "object") return false;
  const r = row as Partial<ForecastRow>;
  return typeof r.week_start === "string" && typeof r.week_end === "string" &&
    Number.isFinite(r.forecast_bookings) && Number.isFinite(r.confidence_lower_95) &&
    Number.isFinite(r.confidence_upper_95);
}
