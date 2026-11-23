import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "../lib/apiError";
import { formatApiErrorForUi } from "../lib/formatApiError";
import { getPublishedForecast, publishForecast } from "../services/dashboardService";
import { isForecastRow, isSnapshot, type ForecastRow, type PublicationSnapshot } from "../types/publication";
import { BusinessAnalyticsPage } from "../pages/BusinessAnalyticsPage";
import { ForecastActions } from "../pages/ForecastActions";

const button = "rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 disabled:opacity-50";
const draftPrefix = (id: string) => `xocompass:pending:${encodeURIComponent(id)}:`;

function readDrafts(userId: string): PublicationSnapshot[] {
  const prefix = draftPrefix(userId);
  const drafts: PublicationSnapshot[] = [];
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(prefix)) continue;
    const snapshot: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!isSnapshot(snapshot) || key !== prefix + snapshot.run_id) throw new Error("A saved report could not be read.");
    drafts.push(snapshot);
  }
  return drafts;
}

export function BrowserTraining({ userId }: { userId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState("");
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [snapshot, setSnapshot] = useState<PublicationSnapshot | null>(null);
  const [drafts, setDrafts] = useState<PublicationSnapshot[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [retry, setRetry] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState<"business" | "forecast">("business");
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const busy = running || publishing;

  useEffect(() => {
    try {
      const saved = readDrafts(userId);
      setDrafts(saved);
      setSnapshot(saved[0] ?? null);
      setRetry(saved.length > 0);
    } catch (error) {
      setNotice(formatApiErrorForUi(error));
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      requestRef.current?.abort();
    };
  }, [userId]);

  function stop() {
    workerRef.current?.terminate();
    workerRef.current = null;
    setRunning(false);
  }

  function saveDraft(report: PublicationSnapshot) {
    localStorage.setItem(draftPrefix(userId) + report.run_id, JSON.stringify(report));
    setDrafts(current => [...current.filter(d => d.run_id !== report.run_id), report]);
  }

  function removeDraft(report: PublicationSnapshot) {
    localStorage.removeItem(draftPrefix(userId) + report.run_id);
    setDrafts(current => current.filter(d => d.run_id !== report.run_id));
  }

  async function train() {
    if (!file || workerRef.current || requestRef.current) return;
    setNotice("");
    setStage("Opening training worker…");
    setRunning(true);
    let worker: Worker;
    try {
      worker = new Worker("/training/worker.mjs", { type: "module" });
    } catch (error) {
      stop();
      setStage(formatApiErrorForUi(error));
      return;
    }
    workerRef.current = worker;
    function fail(message: string) {
      if (workerRef.current !== worker) return;
      stop();
      setStage(message);
    }
    worker.onerror = () => fail("Training failed. Check that the reviewed worker and runtime are installed.");
    worker.onmessageerror = () => fail("The training worker returned an unreadable message.");
    worker.onmessage = ({ data }) => {
      if (workerRef.current !== worker) return;
      if (data?.type === "progress") {
        setStage(String(data.stage));
      } else if (data?.type === "error") {
        fail([data.code, data.message].filter(Boolean).join(" · ") || "Training failed.");
      } else if (data?.type === "result") {
        const result = data.result;
        if (!Array.isArray(result?.forecast) || !result.forecast.length || !result.forecast.every(isForecastRow) ||
            !(result.publication_snapshot === null || isSnapshot(result.publication_snapshot))) {
          fail("The training worker returned an incomplete report.");
          return;
        }
        stop();
        setRows(result.forecast);
        setSnapshot(result.publication_snapshot);
        setReceipt("");
        setRetry(false);
        setStage(result.publication_snapshot ? "Training complete. Review the report before publishing." :
          "Training complete. This fit has no publishable snapshot.");
        if (result.publication_snapshot) {
          try { saveDraft(result.publication_snapshot); }
          catch { setNotice("The report is available in this tab. Browser storage must be writable to publish."); }
        }
      }
    };
    try {
      const bytes = await file.arrayBuffer();
      if (workerRef.current === worker) worker.postMessage({ type: "train", bytes }, [bytes]);
    } catch (error) {
      fail(formatApiErrorForUi(error));
    }
  }

  async function publish() {
    if (!snapshot || receipt || requestRef.current || workerRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPublishing(true);
    setNotice("");
    try {
      saveDraft(snapshot);
      const response = await publishForecast(snapshot, controller.signal);
      if (controller.signal.aborted) return;
      if (response?.run_id !== snapshot.run_id || !response.published_at || !Number.isFinite(Date.parse(response.published_at))) {
        throw new Error("The receiver did not confirm this run. The pending report is available for retry.");
      }
      setReceipt(response.published_at);
      removeDraft(snapshot);
    } catch (error) {
      if (controller.signal.aborted) return;
      setRetry(true);
      if (error instanceof ApiClientError && error.status === 409) {
        setNotice("Publish conflict. Checking the current published report…");
        try {
          const online = await getPublishedForecast(controller.signal);
          if (!controller.signal.aborted) setNotice(online ?
            `Publish conflict. The current published run is ${online.run_id}. Review it in Business Analytics.` :
            "Publish conflict. The viewer currently reports no published forecast.");
        } catch (readError) {
          if (!controller.signal.aborted) setNotice(`Publish conflict. Could not check the current report. ${formatApiErrorForUi(readError)}`);
        }
      } else {
        setNotice(formatApiErrorForUi(error));
      }
    } finally {
      requestRef.current = null;
      if (!controller.signal.aborted) setPublishing(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-6">
      <Link className="text-sm font-medium text-teal-700 underline" to="/business-analytics">Back to Business Analytics</Link>
      <h1 className="text-2xl font-semibold">Train on this PC</h1>
      <section className="space-y-3 rounded-xl border bg-white p-5">
        <p>Select a bookings CSV. Training runs on this computer.</p>
        <input aria-label="Bookings CSV" type="file" accept=".csv,text/csv" disabled={busy}
          onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <div className="flex gap-3">
          <button className={button} disabled={!file || busy} onClick={train}>Train on this PC</button>
          {running && <button className={button} onClick={() => { stop(); setStage("Training cancelled."); }}>Cancel</button>}
        </div>
        <p role="status">{stage}</p>
      </section>
      {drafts.length > 0 && <label className="block">Pending reports
        <select className="ml-3 rounded border p-2" disabled={busy} value={drafts.find(d => d.run_id === snapshot?.run_id)?.run_id ?? ""}
          onChange={e => {
            const pending = drafts.find(d => d.run_id === e.target.value);
            if (!pending) return;
            setSnapshot(pending); setRows([]); setReceipt(""); setStage(""); setNotice(""); setRetry(true);
          }}>
          <option value="" disabled>Select a saved report</option>
          {drafts.map(d => <option key={d.run_id}>{d.run_id}</option>)}
        </select>
      </label>}
      {rows.length > 0 && <section className="overflow-x-auto rounded-xl border bg-white p-5">
        <table className="w-full text-left text-sm">
          <caption className="mb-3 text-left text-lg font-semibold">Local weekly forecast</caption>
          <thead><tr>{["Week start", "Week end", "Forecast bookings", "Lower 95%", "Upper 95%"].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.week_start} className="border-t">
            {[row.week_start, row.week_end, row.forecast_bookings, row.confidence_lower_95, row.confidence_upper_95].map((value, i) => <td key={i} className="p-2">{value}</td>)}
          </tr>)}</tbody>
        </table>
      </section>}
      {snapshot && <section className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-semibold">Review report</h2>
        <div className="my-3 flex gap-2">
          <button className={button} aria-pressed={review === "business"} onClick={() => setReview("business")}>Business Analytics</button>
          <button className={button} aria-pressed={review === "forecast"} onClick={() => setReview("forecast")}>Forecast &amp; Actions</button>
        </div>
        <div key={snapshot.run_id} className="overflow-hidden p-8">
          {review === "business" ? <BusinessAnalyticsPage snapshot={snapshot} /> : <ForecastActions snapshot={snapshot} />}
        </div>
      </section>}
      {(rows.length > 0 || snapshot) && <div className="flex gap-3">
        <button className={button} disabled={!snapshot || busy || !!receipt} onClick={publish}>
          {publishing ? "Publishing…" : retry ? "Retry publish" : "Publish"}
        </button>
        {snapshot && !receipt && <button className={button} disabled={busy} onClick={() => {
          try {
            removeDraft(snapshot); setSnapshot(null); setNotice("Pending report discarded."); setStage("");
          } catch (error) { setNotice(formatApiErrorForUi(error)); }
        }}>Discard pending report</button>}
      </div>}
      {receipt && <p role="status">Published at <time dateTime={receipt}>{receipt}</time></p>}
      {notice && <p role="status">{notice}</p>}
    </main>
  );
}
