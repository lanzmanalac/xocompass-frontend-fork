import { ApiClientError } from "../lib/apiError";
import { isSnapshot, type PublicationSnapshot } from "../types/publication";
import { apiRequest } from "../lib/apiClient";
import type { components } from "../types/api";

type ModelDropdownResponse = components["schemas"]["ModelDropdownResponse"];
type DashboardStatsResponse = components["schemas"]["DashboardStatsResponse"];
type BusinessAnalyticsResponse = components["schemas"]["BusinessAnalyticsResponse"];
type ForecastGraphResponse = components["schemas"]["ForecastGraphResponse"];
type ForecastOutlookResponse = components["schemas"]["ForecastOutlookResponse"];
type StrategicActionsResponse = components["schemas"]["StrategicActionsResponse"];
type AdvancedMetricsResponse = components["schemas"]["AdvancedMetricsResponse"];
type ModelRenameRequest = components["schemas"]["ModelRenameRequest"];

export async function getModels(): Promise<ModelDropdownResponse> {
  return apiRequest<ModelDropdownResponse>("/api/models");
}

export async function getDashboardStats(
  modelId: number
): Promise<DashboardStatsResponse> {
  return apiRequest<DashboardStatsResponse>(
    `/api/dashboard-stats/${encodeURIComponent(String(modelId))}`
  );
}

export async function getBusinessAnalytics(
  modelId: number,
  yearView: string
): Promise<BusinessAnalyticsResponse> {
  const params = new URLSearchParams();
  params.set("model_id", String(modelId));
  if (yearView !== "overall") {
    params.set("year", yearView);
  }
  return apiRequest<BusinessAnalyticsResponse>(
    `/api/business-analytics?${params.toString()}`
  );
}

export async function getForecastGraph(
  modelId: number
): Promise<ForecastGraphResponse> {
  return apiRequest<ForecastGraphResponse>(
    `/api/forecast-graph/${encodeURIComponent(String(modelId))}`
  );
}

export async function getForecastOutlook(
  modelId: number
): Promise<ForecastOutlookResponse> {
  return apiRequest<ForecastOutlookResponse>(
    `/api/forecast-outlook/${encodeURIComponent(String(modelId))}`
  );
}

export async function getStrategicActions(
  modelId: number
): Promise<StrategicActionsResponse> {
  return apiRequest<StrategicActionsResponse>(
    `/api/strategic-actions/${encodeURIComponent(String(modelId))}`
  );
}

export async function getAdvancedMetrics(
  modelId: number
): Promise<AdvancedMetricsResponse> {
  return apiRequest<AdvancedMetricsResponse>(
    `/api/advanced-metrics/${encodeURIComponent(String(modelId))}`
  );
}

export async function renameModel(
  modelId: number,
  body: ModelRenameRequest
): Promise<void> {
  await apiRequest<unknown>(`/api/models/${encodeURIComponent(String(modelId))}/rename`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteModel(modelId: number): Promise<void> {
  await apiRequest<unknown>(`/api/models/${encodeURIComponent(String(modelId))}`, {
    method: "DELETE",
  });
}

export async function getPublishedForecast(signal?: AbortSignal): Promise<PublicationSnapshot | null> {
  try {
    const response = await apiRequest<PublicationSnapshot | { snapshot: PublicationSnapshot }>(
      "/api/viewer/published-forecast", { signal, cache: "no-store" }
    );
    const snapshot = response && "snapshot" in response ? response.snapshot : response;
    if (!isSnapshot(snapshot)) throw new Error("The published report is incomplete.");
    return snapshot;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404 && error.code === "no_published_forecast") return null;
    throw error;
  }
}

export function publishForecast(snapshot: PublicationSnapshot, signal: AbortSignal) {
  return apiRequest<{ run_id: string; published_at: string }>("/api/viewer/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
    signal,
  });
}
