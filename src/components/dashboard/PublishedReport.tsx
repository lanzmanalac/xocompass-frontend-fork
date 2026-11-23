import { useEffect, useState } from "react";
import { formatApiErrorForUi } from "../../lib/formatApiError";
import { getPublishedForecast } from "../../services/dashboardService";
import type { PublicationSnapshot } from "../../types/publication";

export function PublishedReport({ children }: {
  children: (snapshot: PublicationSnapshot) => React.ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<PublicationSnapshot | null>(null);
  const [message, setMessage] = useState("Loading published report…");
  useEffect(() => {
    const controller = new AbortController();
    getPublishedForecast(controller.signal).then(report => {
      if (controller.signal.aborted) return;
      if (report) setSnapshot(report);
      else setMessage("No forecast published yet");
    }).catch(error => {
      if (!controller.signal.aborted) setMessage(formatApiErrorForUi(error));
    });
    return () => controller.abort();
  }, []);
  return snapshot ? children(snapshot) : <p role="status">{message}</p>;
}
