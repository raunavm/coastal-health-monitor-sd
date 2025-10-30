"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, RefreshCw } from "lucide-react";

type Metrics = {
  service: string;
  model: {
    path?: string;
    hash?: string;
    rows?: number;
    va_r2?: number;
    features?: string[];
    geoms?: string[];
  };
  runtime: {
    request_count: number;
    last_request_at?: string;
    started_at: string;
  };
};

export default function StatusPage() {
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState<boolean | null>(null);

  async function fetchAll() {
    setLoading(true);
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      const j = await r.json();
      setM(j.metrics ?? null);
      setOk(Boolean(j.health?.ok && j.health?.onnx));
    } catch {
      setOk(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        {ok ? <CheckCircle className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
        <h1 className="text-2xl font-semibold">Service Status</h1>
        <button
          onClick={fetchAll}
          className="ml-auto inline-flex items-center gap-2 rounded-2xl px-3 py-1 border"
          disabled={loading}
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border p-4">
          <h2 className="font-semibold mb-2">Model</h2>
          <p className="text-sm">Path: {m?.model.path ?? "—"}</p>
          <p className="text-sm">Hash: {m?.model.hash ?? "—"}</p>
          <p className="text-sm">Rows: {m?.model.rows ?? "—"}</p>
          <p className="text-sm">Val R²: {m?.model.va_r2 != null ? m.model.va_r2.toFixed(3) : "—"}</p>
          <p className="text-sm">Features: {m?.model.features?.join(", ") ?? "—"}</p>
          <p className="text-sm">Geoms: {m?.model.geoms?.join(", ") ?? "—"}</p>
        </div>

        <div className="rounded-2xl border p-4">
          <h2 className="font-semibold mb-2">Runtime</h2>
          <p className="text-sm">Requests: {m?.runtime.request_count ?? 0}</p>
          <p className="text-sm">Started: {m?.runtime.started_at ?? "—"}</p>
          <p className="text-sm">Last request: {m?.runtime.last_request_at ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}
