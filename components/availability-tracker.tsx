"use client";

import { Printer } from "lucide-react";

interface AvailabilityTrackerProps {
  queueCount: number;
}

export function AvailabilityTracker({ queueCount }: AvailabilityTrackerProps) {
  const isAvailable = queueCount === 0;
  const estimatedDays = queueCount * 2;

  function getAvailabilityDate() {
    const date = new Date();
    date.setDate(date.getDate() + Math.max(estimatedDays, 2));
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Printer className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Status
        </span>
      </div>

      <div className="h-4 w-px bg-border" />

      <div className="flex items-center gap-2">
        <span
          className={`relative flex h-2.5 w-2.5 ${isAvailable ? "" : "animate-pulse"}`}
        >
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-40 ${
              isAvailable ? "bg-emerald-400" : queueCount <= 2 ? "bg-amber-400" : "bg-red-400"
            }`}
          />
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
              isAvailable ? "bg-emerald-500" : queueCount <= 2 ? "bg-amber-500" : "bg-red-500"
            }`}
          />
        </span>

        {isAvailable ? (
          <span className="text-sm font-medium text-emerald-500">
            Available now
          </span>
        ) : (
          <span className="text-sm text-foreground">
            <span className="font-medium">
              {queueCount} in queue
            </span>
            <span className="text-muted-foreground">
              {" — est. "}
              {getAvailabilityDate()}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
