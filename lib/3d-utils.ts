/**
 * Utility functions for 3D file processing and print estimation
 */

interface PrintSettings {
  material: string;
  infill: number; // percentage (0-100)
  layerHeight: number; // mm
  quantity: number;
}

export interface PrintEstimate {
  volume: number; // cm³
  filamentGrams: number; // grams
  filamentMeters: number; // meters
  estimatedTime: number; // minutes
}

// Material densities in g/cm³
const MATERIAL_DENSITIES: Record<string, number> = {
  pla: 1.24,
  petg: 1.27,
  abs: 1.04,
  tpu: 1.20,
};

// Filament diameter (standard 1.75mm)
const FILAMENT_DIAMETER = 1.75; // mm
const FILAMENT_RADIUS = FILAMENT_DIAMETER / 2; // mm

// Average print speeds (mm/s) - conservative estimates
const PRINT_SPEEDS = {
  perimeters: 50, // mm/s
  infill: 60, // mm/s
  firstLayer: 20, // mm/s
};

/**
 * Parse STL file and calculate volume
 * STL format: Binary or ASCII
 */
export async function calculateSTLVolume(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  // Check if binary STL (starts with non-printable characters after header)
  const isBinary = uint8Array[80] !== undefined && 
                   (uint8Array[80] < 32 || uint8Array[80] > 126);
  
  if (isBinary) {
    return parseBinarySTL(uint8Array);
  } else {
    return parseASCIISTL(uint8Array);
  }
}

/**
 * Parse binary STL file
 */
function parseBinarySTL(data: Uint8Array): number {
  // Binary STL format:
  // 80 bytes header
  // 4 bytes: number of triangles (uint32)
  // For each triangle: 12 floats (normal x,y,z) + 9 floats (vertices) + 2 bytes attribute
  
  if (data.length < 84) {
    throw new Error("Invalid STL file: too short");
  }
  
  const view = new DataView(data.buffer);
  const numTriangles = view.getUint32(80, true); // little-endian
  
  let totalVolume = 0;
  let offset = 84;
  
  for (let i = 0; i < numTriangles; i++) {
    if (offset + 50 > data.length) break;
    
    // Skip normal (12 bytes)
    offset += 12;
    
    // Read three vertices (9 floats = 36 bytes)
    const v1 = {
      x: view.getFloat32(offset, true),
      y: view.getFloat32(offset + 4, true),
      z: view.getFloat32(offset + 8, true),
    };
    offset += 12;
    
    const v2 = {
      x: view.getFloat32(offset, true),
      y: view.getFloat32(offset + 4, true),
      z: view.getFloat32(offset + 8, true),
    };
    offset += 12;
    
    const v3 = {
      x: view.getFloat32(offset, true),
      y: view.getFloat32(offset + 4, true),
      z: view.getFloat32(offset + 8, true),
    };
    offset += 12;
    
    // Skip attribute (2 bytes)
    offset += 2;
    
    // Calculate signed volume of tetrahedron
    const volume = calculateTetrahedronVolume(v1, v2, v3);
    totalVolume += volume;
  }
  
  // Convert from mm³ to cm³ and take absolute value
  return Math.abs(totalVolume) / 1000;
}

/**
 * Parse ASCII STL file
 */
function parseASCIISTL(data: Uint8Array): number {
  const text = new TextDecoder().decode(data);
  const lines = text.split('\n');
  
  let totalVolume = 0;
  let currentVertices: Array<{ x: number; y: number; z: number }> = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('vertex')) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 4) {
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        const z = parseFloat(parts[3]);
        
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
          currentVertices.push({ x, y, z });
          
          // When we have 3 vertices, calculate volume
          if (currentVertices.length === 3) {
            const volume = calculateTetrahedronVolume(
              currentVertices[0],
              currentVertices[1],
              currentVertices[2]
            );
            totalVolume += volume;
            currentVertices = [];
          }
        }
      }
    } else if (trimmed.startsWith('endfacet') || trimmed.startsWith('endsolid')) {
      currentVertices = [];
    }
  }
  
  // Convert from mm³ to cm³ and take absolute value
  return Math.abs(totalVolume) / 1000;
}

/**
 * Calculate volume of tetrahedron formed by triangle and origin
 * Uses the signed volume method
 */
function calculateTetrahedronVolume(
  v1: { x: number; y: number; z: number },
  v2: { x: number; y: number; z: number },
  v3: { x: number; y: number; z: number }
): number {
  // Signed volume = (1/6) * dot(v1, cross(v2, v3))
  const crossX = v2.y * v3.z - v2.z * v3.y;
  const crossY = v2.z * v3.x - v2.x * v3.z;
  const crossZ = v2.x * v3.y - v2.y * v3.x;
  
  const dot = v1.x * crossX + v1.y * crossY + v1.z * crossZ;
  return dot / 6.0;
}

/**
 * Calculate volume for OBJ files (simplified - just estimates based on bounding box)
 * For accurate OBJ parsing, a more sophisticated library would be needed
 */
export async function calculateOBJVolume(file: File): Promise<number> {
  const text = await file.text();
  const lines = text.split('\n');
  
  const vertices: Array<{ x: number; y: number; z: number }> = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('v ') && !trimmed.startsWith('vt ') && !trimmed.startsWith('vn ')) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 4) {
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        const z = parseFloat(parts[3]);
        
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
          vertices.push({ x, y, z });
        }
      }
    }
  }
  
  if (vertices.length === 0) {
    throw new Error("No vertices found in OBJ file");
  }
  
  // Calculate bounding box volume as approximation
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  for (const v of vertices) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
    minZ = Math.min(minZ, v.z);
    maxZ = Math.max(maxZ, v.z);
  }
  
  const width = maxX - minX;
  const height = maxY - minY;
  const depth = maxZ - minZ;
  
  // Approximate volume as bounding box * 0.6 (rough estimate for typical models)
  const boundingVolume = width * height * depth;
  return (boundingVolume * 0.6) / 1000; // Convert mm³ to cm³
}

/**
 * Calculate volume for 3MF files (simplified - would need proper XML parsing)
 * For now, estimate similar to OBJ
 */
export async function calculate3MFVolume(file: File): Promise<number> {
  // 3MF is a ZIP archive containing XML
  // For a proper implementation, we'd need to extract and parse the XML
  // For now, use a simplified estimation
  const text = await file.text();
  
  // Try to find volume hints in the XML if it's readable
  // Otherwise, fall back to file size estimation
  const fileSizeMB = file.size / (1024 * 1024);
  
  // Rough estimation: 1MB ≈ 10-50 cm³ depending on complexity
  // This is very approximate
  return fileSizeMB * 20;
}

/**
 * Calculate volume from a 3D file
 */
export async function calculateFileVolume(file: File): Promise<number> {
  const extension = file.name.toLowerCase().split('.').pop();
  
  try {
    switch (extension) {
      case 'stl':
        return await calculateSTLVolume(file);
      case 'obj':
        return await calculateOBJVolume(file);
      case '3mf':
        return await calculate3MFVolume(file);
      default:
        throw new Error(`Unsupported file format: ${extension}`);
    }
  } catch (error) {
    console.error('Error calculating volume:', error);
    // Fallback: estimate based on file size
    const fileSizeMB = file.size / (1024 * 1024);
    return fileSizeMB * 15; // Rough estimate
  }
}

/**
 * Estimate filament usage in grams
 */
function estimateFilamentGrams(
  volumeCm3: number,
  settings: PrintSettings
): number {
  const density = MATERIAL_DENSITIES[settings.material] || MATERIAL_DENSITIES.pla;
  
  // Calculate material volume needed
  // Volume = solid volume * (1 + infill factor)
  // Infill factor: 15% infill means ~15% more material than solid shell
  const infillFactor = settings.infill / 100;
  
  // Account for shell (typically 2-3 perimeters) and infill
  // Rough estimate: shell takes ~20% of volume, infill takes the rest
  const shellVolume = volumeCm3 * 0.2;
  const infillVolume = volumeCm3 * 0.8 * infillFactor;
  const totalVolume = shellVolume + infillVolume;
  
  // Add 10% for support material and waste
  const adjustedVolume = totalVolume * 1.1;
  
  // Convert to grams: volume (cm³) * density (g/cm³)
  return adjustedVolume * density * settings.quantity;
}

/**
 * Estimate filament length in meters
 */
function estimateFilamentMeters(grams: number, material: string): number {
  const density = MATERIAL_DENSITIES[material] || MATERIAL_DENSITIES.pla;
  
  // Filament volume in cm³
  const volumeCm3 = grams / density;
  
  // Filament volume in mm³
  const volumeMm3 = volumeCm3 * 1000;
  
  // Length = volume / (π * r²)
  const crossSectionArea = Math.PI * Math.pow(FILAMENT_RADIUS, 2);
  const lengthMm = volumeMm3 / crossSectionArea;
  
  // Convert to meters
  return lengthMm / 1000;
}

/**
 * Estimate print time in minutes
 */
function estimatePrintTime(
  volumeCm3: number,
  settings: PrintSettings
): number {
  // Estimate layer count
  // Assume average model height of 50mm (this is a rough estimate)
  // In a real implementation, we'd calculate actual model height
  const estimatedHeight = Math.cbrt(volumeCm3 * 1000) * 0.8; // Rough estimate
  const layerCount = Math.max(1, Math.ceil(estimatedHeight / settings.layerHeight));
  
  // Estimate print area per layer
  const baseArea = volumeCm3 * 1000 / estimatedHeight; // mm²
  
  // Time calculations
  // Perimeters: assume 2 perimeters, average perimeter length
  const perimeterLength = Math.sqrt(baseArea) * 4 * 2; // Rough estimate
  const perimeterTime = (perimeterLength * layerCount) / PRINT_SPEEDS.perimeters;
  
  // Infill: based on infill percentage
  const infillArea = baseArea * (settings.infill / 100);
  const infillLength = infillArea / 0.4; // Assume 0.4mm line width
  const infillTime = (infillLength * layerCount) / PRINT_SPEEDS.infill;
  
  // First layer is slower
  const firstLayerTime = (perimeterLength / PRINT_SPEEDS.firstLayer);
  
  // Add time for layer changes (5 seconds per layer)
  const layerChangeTime = layerCount * 5;
  
  // Total time in seconds
  const totalSeconds = perimeterTime + infillTime + firstLayerTime + layerChangeTime;
  
  // Convert to minutes and add 20% buffer for setup, cleanup, etc.
  return (totalSeconds / 60) * 1.2 * settings.quantity;
}

/**
 * Calculate complete print estimate
 */
export async function calculatePrintEstimate(
  file: File,
  settings: PrintSettings
): Promise<PrintEstimate> {
  const volume = await calculateFileVolume(file);
  const filamentGrams = estimateFilamentGrams(volume, settings);
  const filamentMeters = estimateFilamentMeters(filamentGrams, settings.material);
  const estimatedTime = estimatePrintTime(volume, settings);
  
  return {
    volume: Math.round(volume * 10) / 10, // Round to 1 decimal
    filamentGrams: Math.round(filamentGrams * 10) / 10,
    filamentMeters: Math.round(filamentMeters * 10) / 10,
    estimatedTime: Math.round(estimatedTime),
  };
}
