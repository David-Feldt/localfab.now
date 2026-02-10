"use client";

import React from "react";
import { useState, useRef, useEffect, type DragEvent, type ChangeEvent } from "react";
import { Upload, X, CheckCircle2, Loader2 } from "lucide-react";
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
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "@/components/ui/select";
import { calculatePrintEstimate, type PrintEstimate } from "@/lib/3d-utils";
import { Card, CardContent } from "@/components/ui/card";
import { ModelViewer } from "@/components/model-viewer";

const materials = [
  { value: "pla", label: "PLA" },
  { value: "petg", label: "PETG", italic: true, note: "upon request" },
  { value: "tpu", label: "TPU", italic: true, note: "upon request" },
];

const colors = [
  { value: "black", label: "Black", swatch: "#1a1a1a" },
  { value: "white", label: "White", swatch: "#e8e8e8" },
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

const speedOptions = [
  { value: "instant", label: "Instant", description: "Same day" },
  { value: "fast", label: "Fast", description: "1-2 days" },
  { value: "regular", label: "Regular", description: "1-5 days" },
];

const deliveryOptions = [
  { value: "pickup", label: "Pickup", description: "Pick up in Toronto" },
  { value: "delivery", label: "Local Delivery", description: "Toronto area delivery" },
];

// Neighborhoods organized by travel time (approximate distances)
const neighborhoodsByTime = {
  "5min": [
    { name: "Newtonbrook West", coords: { lat: 43.7700, lng: -79.4200 } },
    { name: "Thornhill", coords: { lat: 43.8100, lng: -79.4200 } },
  ],
  "10min": [
    { name: "Bathurst Manor", coords: { lat: 43.7500, lng: -79.4500 } },
    { name: "Willowdale", coords: { lat: 43.7600, lng: -79.4000 } },
    { name: "Langstaff / South Richmond Hill", coords: { lat: 43.8500, lng: -79.4300 } },
  ],
  "15min": [
    { name: "Bayview Village", coords: { lat: 43.7800, lng: -79.3800 } },
    { name: "Armour Heights", coords: { lat: 43.7400, lng: -79.4300 } },
    { name: "Clanton Park", coords: { lat: 43.7300, lng: -79.4500 } },
    { name: "Downsview", coords: { lat: 43.7500, lng: -79.4800 } },
    { name: "York Mills", coords: { lat: 43.7500, lng: -79.3800 } },
    { name: "Don Mills", coords: { lat: 43.7600, lng: -79.3500 } },
    { name: "Concord", coords: { lat: 43.8000, lng: -79.5000 } },
    { name: "Thornhill Woods", coords: { lat: 43.8300, lng: -79.4500 } },
  ],
  "20min": [
    { name: "Lawrence Park", coords: { lat: 43.7200, lng: -79.4000 } },
    { name: "Maple", coords: { lat: 43.8600, lng: -79.5000 } },
    { name: "Woodbridge (southern portions)", coords: { lat: 43.7800, lng: -79.6000 } },
  ],
};

// Flatten neighborhoods for dropdown
const allNeighborhoods = [
  ...neighborhoodsByTime["5min"].map(n => ({ ...n, time: "5min" })),
  ...neighborhoodsByTime["10min"].map(n => ({ ...n, time: "10min" })),
  ...neighborhoodsByTime["15min"].map(n => ({ ...n, time: "15min" })),
  ...neighborhoodsByTime["20min"].map(n => ({ ...n, time: "20min" })),
];


export function OrderForm() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedColor, setSelectedColor] = useState("black");
  const [material, setMaterial] = useState("pla");
  const [infill, setInfill] = useState("25");
  const [layerHeight, setLayerHeight] = useState("0.2");
  const [quantity, setQuantity] = useState("1");
  const [speed, setSpeed] = useState("regular");
  const [delivery, setDelivery] = useState("pickup");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryDistance, setDeliveryDistance] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<PrintEstimate | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const notesInputRef = useRef<HTMLTextAreaElement>(null);
  const captureScreenshotRef = useRef<(() => Promise<string | null>) | null>(null);
  
  // Business location in Toronto (example coordinates - replace with actual location)
  const BUSINESS_LOCATION = {
    lat: 43.7907, // Toronto coordinates (replace with actual business location)
    lng: -79.4558,
  };

  // Calculate distance using Haversine formula
  const calculateDistanceKm = React.useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // Calculate distance when neighborhood or custom address changes
  useEffect(() => {
    if (delivery === 'delivery') {
      if (selectedNeighborhood && selectedNeighborhood !== 'other') {
        // Use predefined neighborhood coordinates
        const neighborhood = allNeighborhoods.find(n => n.name === selectedNeighborhood);
        if (neighborhood && neighborhood.coords) {
          const distance = calculateDistanceKm(
            BUSINESS_LOCATION.lat,
            BUSINESS_LOCATION.lng,
            neighborhood.coords.lat,
            neighborhood.coords.lng
          );
          setDeliveryDistance(distance);
        }
      } else if (selectedNeighborhood === 'other' && deliveryAddress.trim()) {
        // Geocode custom address
        const calculateDistance = async () => {
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(deliveryAddress + ', Toronto, ON, Canada')}&limit=1`,
              {
                headers: {
                  'User-Agent': '3DPrintService'
                }
              }
            );
            const data = await response.json();
            if (data && data.length > 0) {
              const coords = {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
              };
              const distance = calculateDistanceKm(
                BUSINESS_LOCATION.lat,
                BUSINESS_LOCATION.lng,
                coords.lat,
                coords.lng
              );
              setDeliveryDistance(distance);
            } else {
              setDeliveryDistance(null);
            }
          } catch (error) {
            console.error('Error calculating distance:', error);
            setDeliveryDistance(null);
          }
        };
        
        const timeoutId = setTimeout(() => {
          calculateDistance();
        }, 500);
        
        return () => clearTimeout(timeoutId);
      } else {
        setDeliveryDistance(null);
      }
    } else {
      setDeliveryDistance(null);
      setSelectedNeighborhood("");
      setDeliveryAddress("");
    }
  }, [delivery, selectedNeighborhood, deliveryAddress, calculateDistanceKm]);

  // Calculate estimates when file or settings change
  useEffect(() => {
    if (!file) {
      setEstimate(null);
      return;
    }

    const calculateEstimate = async () => {
      setCalculating(true);
      try {
        const result = await calculatePrintEstimate(file, {
          material,
          infill: parseFloat(infill),
          layerHeight: parseFloat(layerHeight),
          quantity: parseInt(quantity) || 1,
          speed,
          delivery,
          deliveryDistance,
        });
        setEstimate(result);
      } catch (error) {
        console.error("Error calculating estimate:", error);
        setEstimate(null);
      } finally {
        setCalculating(false);
      }
    };

    calculateEstimate();
  }, [file, material, infill, layerHeight, quantity, speed, delivery, deliveryDistance]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!file || !estimate || !name || !email) {
      return;
    }

    setSubmitting(true);

    try {
      // Capture screenshot
      let screenshotDataUrl: string | null = null;
      if (captureScreenshotRef.current) {
        screenshotDataUrl = await captureScreenshotRef.current();
      }

      // Prepare form data
      const formData = new FormData();
      formData.append('name', name);
      formData.append('email', email);
      formData.append('notes', notes);
      formData.append('fileName', file.name);
      formData.append('fileSize', `${(file.size / 1024 / 1024).toFixed(2)} MB`);
      formData.append('material', material);
      formData.append('color', selectedColor);
      formData.append('infill', infill);
      formData.append('layerHeight', layerHeight);
      formData.append('quantity', quantity);
      formData.append('speed', speed);
      formData.append('delivery', delivery);
      if (delivery === 'delivery') {
        formData.append('deliveryAddress', selectedNeighborhood === 'other' ? deliveryAddress : selectedNeighborhood);
        if (deliveryDistance !== null) {
          formData.append('deliveryDistance', deliveryDistance.toFixed(1));
        }
      }
      formData.append('volume', estimate.volume.toString());
      formData.append('filamentGrams', estimate.filamentGrams.toString());
      formData.append('estimatedTime', estimate.estimatedTime.toString());
      formData.append('manufacturingPrice', estimate.manufacturingPrice.toFixed(2));
      formData.append('deliveryPrice', estimate.deliveryPrice.toFixed(2));
      formData.append('totalPrice', estimate.price.toFixed(2));

      // Convert screenshot to File if available
      if (screenshotDataUrl) {
        const response = await fetch(screenshotDataUrl);
        const blob = await response.blob();
        const screenshotFile = new File([blob], 'model-preview.png', { type: 'image/png' });
        formData.append('modelImage', screenshotFile);
      }

      // Add the original file
      formData.append('modelFile', file);

      // Send to API
      const response = await fetch('/api/send-order', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to send order');
      }

      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting order:', error);
      alert('Failed to submit order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex-1 flex flex-col px-6 py-12 md:py-20">
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
        <div className="mb-10">
          <div>
            <p className="font-mono text-xs tracking-[0.3em] uppercase text-primary mb-2">
              Local Toronto 3D print
            </p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 text-balance">
              Submit a print
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Upload your model, pick your options, and we handle the rest.
            </p>
          </div>
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
                <div className="w-full">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
                      {calculating ? (
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <div className="flex-1">
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
                        setEstimate(null);
                      }}
                      className="p-1 rounded hover:bg-secondary"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                  
                  {/* 3D Model Preview */}
                  <div className="mt-4">
                    <ModelViewer 
                      file={file} 
                      className="h-64 w-full"
                      onScreenshotReady={(capture) => {
                        captureScreenshotRef.current = capture;
                      }}
                    />
                  </div>
                  
                  {estimate && !calculating && (
                    <Card className="bg-muted/50 border-border">
                      <CardContent className="pt-4">
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Volume</p>
                            <p className="font-semibold">{estimate.volume} cm³</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Filament</p>
                            <p className="font-semibold">{estimate.filamentGrams} g</p>
                            <p className="text-xs text-muted-foreground">
                              {estimate.filamentMeters} m
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Est. Time</p>
                            <p className="font-semibold">
                              {estimate.estimatedTime < 60
                                ? `${estimate.estimatedTime} min`
                                : `${Math.floor(estimate.estimatedTime / 60)}h ${estimate.estimatedTime % 60}m`}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Quantity</p>
                            <p className="font-semibold">{quantity}x</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  {calculating && (
                    <div className="text-xs text-muted-foreground text-center py-2">
                      Calculating estimates...
                    </div>
                  )}
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
                <Select value={material} onValueChange={setMaterial}>
                  <SelectTrigger id="material" className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        <span className={m.italic ? "italic" : ""}>
                          {m.label}
                          {m.note && <span className="text-muted-foreground ml-1">({m.note})</span>}
                        </span>
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
                <Select value={infill} onValueChange={setInfill}>
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
                <Select value={layerHeight} onValueChange={setLayerHeight}>
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
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="bg-card border-border"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="speed" className="text-sm">
                  Speed
                </Label>
                <Select value={speed} onValueChange={setSpeed}>
                  <SelectTrigger id="speed" className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {speedOptions.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <div className="flex flex-col">
                          <span>{s.label}</span>
                          <span className="text-xs text-muted-foreground">{s.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="delivery" className="text-sm">
                  Delivery
                </Label>
                <Select value={delivery} onValueChange={setDelivery}>
                  <SelectTrigger id="delivery" className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {deliveryOptions.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        <div className="flex flex-col">
                          <span>{d.label}</span>
                          <span className="text-xs text-muted-foreground">{d.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {delivery === 'delivery' && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="neighborhood" className="text-sm">
                      Neighborhood
                    </Label>
                    <Select value={selectedNeighborhood} onValueChange={setSelectedNeighborhood}>
                      <SelectTrigger id="neighborhood" className="bg-card border-border">
                        <SelectValue placeholder="Select neighborhood" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>5 minutes</SelectLabel>
                          {neighborhoodsByTime["5min"].map((n) => (
                            <SelectItem key={n.name} value={n.name}>
                              {n.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>10 minutes</SelectLabel>
                          {neighborhoodsByTime["10min"].map((n) => (
                            <SelectItem key={n.name} value={n.name}>
                              {n.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>15 minutes</SelectLabel>
                          {neighborhoodsByTime["15min"].map((n) => (
                            <SelectItem key={n.name} value={n.name}>
                              {n.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>20 minutes</SelectLabel>
                          {neighborhoodsByTime["20min"].map((n) => (
                            <SelectItem key={n.name} value={n.name}>
                              {n.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectSeparator />
                        <SelectItem value="other">
                          Other (custom address)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedNeighborhood === 'other' && (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="deliveryAddress" className="text-sm">
                        Custom Address
                      </Label>
                      <Input
                        id="deliveryAddress"
                        type="text"
                        placeholder="Enter your Toronto address"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        className="bg-card border-border"
                      />
                      {deliveryAddress && deliveryDistance === null && (
                        <p className="text-xs text-muted-foreground">
                          Calculating distance...
                        </p>
                      )}
                    </div>
                  )}

                  {deliveryDistance !== null && (
                    <div className="text-xs text-muted-foreground">
                      Distance: {deliveryDistance.toFixed(1)} km from pickup location
                    </div>
                  )}
                </>
              )}
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
                  ref={nameInputRef}
                  required
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-card border-border"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-sm">
                  Email
                </Label>
                <Input
                  id="email"
                  ref={emailInputRef}
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  ref={notesInputRef}
                  placeholder="Special requirements, finish preferences, orientation notes..."
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-card border-border resize-none"
                />
              </div>
            </div>
          </div>

          {/* Price Breakdown */}
          {estimate && !calculating && (
            <div className="border-t border-border pt-6">
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Manufacturing Price</span>
                  <span className="text-sm font-semibold">~${estimate.manufacturingPrice.toFixed(2)} CAD</span>
                </div>
                {estimate.deliveryPrice > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Delivery Price</span>
                    <span className="text-sm font-semibold">~${estimate.deliveryPrice.toFixed(2)} CAD</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-3 border-t border-border">
                  <span className="text-base font-semibold">Total Price</span>
                  <span className="text-lg font-bold">~${estimate.price.toFixed(2)} CAD</span>
                </div>
              </div>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={submitting || !file || !estimate || !name || !email}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Submit Print Order'}
          </Button>
        </form>
      </div>
    </div>
  );
}
