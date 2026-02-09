"use client";

import React from "react";
import { useState, useRef, type DragEvent, type ChangeEvent } from "react";
import { Upload, X, CheckCircle2 } from "lucide-react";
import { AvailabilityTracker } from "@/components/availability-tracker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const materials = [
  { value: "pla", label: "PLA" },
  { value: "petg", label: "PETG" },
  { value: "abs", label: "ABS" },
  { value: "tpu", label: "TPU" },
];

const colors = [
  { value: "black", label: "Black", swatch: "#1a1a1a" },
  { value: "white", label: "White", swatch: "#e8e8e8" },
  { value: "orange", label: "Orange", swatch: "#f97316" },
  { value: "red", label: "Red", swatch: "#dc2626" },
  { value: "blue", label: "Blue", swatch: "#2563eb" },
  { value: "green", label: "Green", swatch: "#16a34a" },
  { value: "gray", label: "Gray", swatch: "#6b7280" },
];

const infillOptions = [
  { value: "15", label: "15% — Light" },
  { value: "25", label: "25% — Standard" },
  { value: "50", label: "50% — Strong" },
  { value: "100", label: "100% — Solid" },
];

const layerOptions = [
  { value: "0.3", label: "0.3 mm — Draft" },
  { value: "0.2", label: "0.2 mm — Standard" },
  { value: "0.12", label: "0.12 mm — Fine" },
];


export function OrderForm() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedColor, setSelectedColor] = useState("black");
  const [queueCount, setQueueCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setQueueCount((prev) => prev + 1);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex-1 flex flex-col px-6 py-12 md:py-20">
        <div className="flex justify-end mb-10">
          <AvailabilityTracker queueCount={queueCount} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight mb-3 text-balance">
              Order received
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              {"We'll review your file and send you a quote via email. Typical turnaround is 2 — 5 business days depending on size and complexity."}
            </p>
            <Button
              className="mt-8 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                setSubmitted(false);
                setFile(null);
              }}
            >
              Submit another
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center px-6 py-12 md:py-20">
      <div className="w-full max-w-2xl">
        <div className="flex items-start justify-between gap-6 mb-10">
          <div>
            <p className="font-mono text-xs tracking-[0.3em] uppercase text-primary mb-2">
              Ender 5 Max
            </p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 text-balance">
              Submit a print
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Upload your model, pick your options, and we handle the rest.
            </p>
          </div>
          <div className="hidden sm:block shrink-0 pt-1">
            <AvailabilityTracker queueCount={queueCount} />
          </div>
        </div>
        <div className="sm:hidden mb-6">
          <AvailabilityTracker queueCount={queueCount} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-10">
          {/* File Upload */}
          <div>
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground block mb-3">
              01 — Upload File
            </span>
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload your 3D model file"
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  fileRef.current?.click();
              }}
              className={`
                relative flex flex-col items-center justify-center gap-3
                rounded-lg border-2 border-dashed p-10 cursor-pointer
                transition-colors duration-200
                ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : file
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:border-muted-foreground"
                }
              `}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".stl,.obj,.3mf"
                onChange={handleFileChange}
                className="sr-only"
              />

              {file ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
                    <Upload className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Remove file"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="ml-4 p-1 rounded hover:bg-secondary"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground text-center">
                    {"Drop your "}
                    <span className="text-foreground font-medium">
                      .STL, .OBJ, .3MF
                    </span>
                    {" file here or click to browse"}
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    Max 50 MB
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Print Options */}
          <div>
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground block mb-4">
              02 — Print Options
            </span>

            <div className="grid sm:grid-cols-2 gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="material" className="text-sm">
                  Material
                </Label>
                <Select defaultValue="pla">
                  <SelectTrigger id="material" className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-sm">Color</Label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {colors.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      aria-label={c.label}
                      onClick={() => setSelectedColor(c.value)}
                      className={`
                        w-8 h-8 rounded-full border-2 transition-all duration-200
                        ${
                          selectedColor === c.value
                            ? "border-primary scale-110 ring-2 ring-primary/30"
                            : "border-border hover:border-muted-foreground"
                        }
                      `}
                      style={{ backgroundColor: c.swatch }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="infill" className="text-sm">
                  Infill
                </Label>
                <Select defaultValue="25">
                  <SelectTrigger id="infill" className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {infillOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="layer" className="text-sm">
                  Layer Height
                </Label>
                <Select defaultValue="0.2">
                  <SelectTrigger id="layer" className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {layerOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="quantity" className="text-sm">
                  Quantity
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={1}
                  className="bg-card border-border"
                />
              </div>
            </div>
          </div>

          {/* Contact Details */}
          <div>
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground block mb-4">
              03 — Your Details
            </span>

            <div className="grid sm:grid-cols-2 gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name" className="text-sm">
                  Name
                </Label>
                <Input
                  id="name"
                  required
                  placeholder="Your name"
                  className="bg-card border-border"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-sm">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  className="bg-card border-border"
                />
              </div>
              <div className="sm:col-span-2 flex flex-col gap-2">
                <Label htmlFor="notes" className="text-sm">
                  {"Notes "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Special requirements, finish preferences, orientation notes..."
                  rows={3}
                  className="bg-card border-border resize-none"
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold tracking-wide"
          >
            Submit Print Order
          </Button>
        </form>
      </div>
    </div>
  );
}
