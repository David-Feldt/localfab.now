/**
 * Utility functions for 3D file processing and print estimation
 */

interface PrintSettings {
  material: string;
  infill: number; // percentage (0-100)
  layerHeight: number; // mm
  quantity: number;
  speed?: string; // 'instant', 'fast', 'regular'
  delivery?: string; // 'pickup', 'delivery'
  deliveryDistance?: number | null; // distance in km
}

export interface PrintEstimate {
  volume: number; // cm³
  filamentGrams: number; // grams
  filamentMeters: number; // meters
  estimatedTime: number; // minutes
  price: number; // CAD (total)
  manufacturingPrice: number; // CAD
  deliveryPrice: number; // CAD
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

// Standard print settings (typical FDM printer defaults)
const STANDARD_LINE_WIDTH = 0.4; // mm (standard nozzle size)
const STANDARD_PERIMETERS = 2; // number of wall perimeters
const STANDARD_TOP_BOTTOM_LAYERS = 3; // top and bottom solid layers

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
  
  console.log(`Binary STL: ${numTriangles} triangles`);
  
  // First pass: calculate centroid to use as reference point
  let sumX = 0, sumY = 0, sumZ = 0;
  let vertexCount = 0;
  let offset = 84;
  
  for (let i = 0; i < numTriangles && offset + 50 <= data.length; i++) {
    offset += 12; // Skip normal
    
    sumX += view.getFloat32(offset, true);
    sumY += view.getFloat32(offset + 4, true);
    sumZ += view.getFloat32(offset + 8, true);
    vertexCount++;
    offset += 12;
    
    sumX += view.getFloat32(offset, true);
    sumY += view.getFloat32(offset + 4, true);
    sumZ += view.getFloat32(offset + 8, true);
    vertexCount++;
    offset += 12;
    
    sumX += view.getFloat32(offset, true);
    sumY += view.getFloat32(offset + 4, true);
    sumZ += view.getFloat32(offset + 8, true);
    vertexCount++;
    offset += 12;
    
    offset += 2; // Skip attribute
  }
  
  const referencePoint = vertexCount > 0 
    ? { x: sumX / vertexCount, y: sumY / vertexCount, z: sumZ / vertexCount }
    : { x: 0, y: 0, z: 0 };
  
  // Second pass: calculate volume using reference point
  let totalVolume = 0;
  offset = 84;
  let validTriangles = 0;
  
  for (let i = 0; i < numTriangles; i++) {
    if (offset + 50 > data.length) {
      console.warn(`STL parsing stopped early: offset ${offset} + 50 > ${data.length}`);
      break;
    }
    
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
    
    // Calculate signed volume of tetrahedron using reference point
    const volume = calculateTetrahedronVolume(v1, v2, v3, referencePoint);
    if (isFinite(volume)) {
      totalVolume += volume;
      validTriangles++;
    }
  }
  
  console.log(`STL volume calculation: ${validTriangles}/${numTriangles} valid triangles, raw volume: ${totalVolume} mm³`);
  
  // Convert from mm³ to cm³ and take absolute value
  const finalVolume = Math.abs(totalVolume) / 1000;
  console.log(`STL final volume: ${finalVolume} cm³`);
  
  if (finalVolume === 0 && validTriangles > 0) {
    console.warn("Volume is 0 despite valid triangles - this should not happen with reference point method");
  }
  
  return finalVolume;
}

/**
 * Parse ASCII STL file
 */
function parseASCIISTL(data: Uint8Array): number {
  const text = new TextDecoder().decode(data);
  const lines = text.split('\n');
  
  // First pass: collect all vertices to calculate centroid
  const allVertices: Array<{ x: number; y: number; z: number }> = [];
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
          const vertex = { x, y, z };
          currentVertices.push(vertex);
          allVertices.push(vertex);
          
          // When we have 3 vertices, reset for next triangle
          if (currentVertices.length === 3) {
            currentVertices = [];
          }
        }
      }
    } else if (trimmed.startsWith('endfacet') || trimmed.startsWith('endsolid')) {
      currentVertices = [];
    }
  }
  
  // Calculate centroid as reference point
  let sumX = 0, sumY = 0, sumZ = 0;
  for (const v of allVertices) {
    sumX += v.x;
    sumY += v.y;
    sumZ += v.z;
  }
  const referencePoint = allVertices.length > 0
    ? { x: sumX / allVertices.length, y: sumY / allVertices.length, z: sumZ / allVertices.length }
    : { x: 0, y: 0, z: 0 };
  
  // Second pass: calculate volume using reference point
  let totalVolume = 0;
  currentVertices = [];
  
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
              currentVertices[2],
              referencePoint
            );
            if (isFinite(volume)) {
              totalVolume += volume;
            }
            currentVertices = [];
          }
        }
      }
    } else if (trimmed.startsWith('endfacet') || trimmed.startsWith('endsolid')) {
      currentVertices = [];
    }
  }
  
  console.log(`ASCII STL: ${allVertices.length / 3} triangles, volume: ${Math.abs(totalVolume) / 1000} cm³`);
  
  // Convert from mm³ to cm³ and take absolute value
  return Math.abs(totalVolume) / 1000;
}

/**
 * Calculate volume of tetrahedron formed by triangle and origin
 * Uses the signed volume method
 * Note: If model is centered at origin, use a reference point offset
 */
function calculateTetrahedronVolume(
  v1: { x: number; y: number; z: number },
  v2: { x: number; y: number; z: number },
  v3: { x: number; y: number; z: number },
  referencePoint?: { x: number; y: number; z: number }
): number {
  // Use reference point if provided (to avoid cancellation when model is centered at origin)
  const ref = referencePoint || { x: 0, y: 0, z: 0 };
  
  // Translate vertices relative to reference point
  const p1 = { x: v1.x - ref.x, y: v1.y - ref.y, z: v1.z - ref.z };
  const p2 = { x: v2.x - ref.x, y: v2.y - ref.y, z: v2.z - ref.z };
  const p3 = { x: v3.x - ref.x, y: v3.y - ref.y, z: v3.z - ref.z };
  
  // Signed volume = (1/6) * dot(p1, cross(p2, p3))
  const crossX = p2.y * p3.z - p2.z * p3.y;
  const crossY = p2.z * p3.x - p2.x * p3.z;
  const crossZ = p2.x * p3.y - p2.y * p3.x;
  
  const dot = p1.x * crossX + p1.y * crossY + p1.z * crossZ;
  return dot / 6.0;
}

/**
 * Calculate volume for OBJ files using accurate signed volume method
 * Parses faces and calculates volume from triangles
 */
export async function calculateOBJVolume(file: File): Promise<number> {
  const text = await file.text();
  const lines = text.split('\n');
  
  const vertices: Array<{ x: number; y: number; z: number }> = [];
  const faces: Array<number[]> = [];
  
  // Parse vertices
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
    } else if (trimmed.startsWith('f ')) {
      // Parse face indices (OBJ is 1-indexed)
      const parts = trimmed.split(/\s+/);
      const faceIndices: number[] = [];
      for (let i = 1; i < parts.length; i++) {
        const vertexIndex = parseInt(parts[i].split('/')[0]);
        if (!isNaN(vertexIndex) && vertexIndex > 0) {
          faceIndices.push(vertexIndex - 1); // Convert to 0-indexed
        }
      }
      if (faceIndices.length >= 3) {
        faces.push(faceIndices);
      }
    }
  }
  
  if (vertices.length === 0) {
    throw new Error("No vertices found in OBJ file");
  }
  
  console.log(`OBJ file: Found ${vertices.length} vertices, ${faces.length} faces`);
  
  if (faces.length === 0) {
    console.warn("No faces found in OBJ file, using bounding box estimation");
    // Fallback: if no faces, estimate from bounding box
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
    const boundingVolume = width * height * depth;
    const estimatedVolume = (boundingVolume * 0.6) / 1000; // Rough estimate
    console.log(`Bounding box volume estimate: ${estimatedVolume} cm³`);
    return estimatedVolume;
  }
  
  // Calculate centroid as reference point
  let sumX = 0, sumY = 0, sumZ = 0;
  for (const v of vertices) {
    sumX += v.x;
    sumY += v.y;
    sumZ += v.z;
  }
  const referencePoint = vertices.length > 0
    ? { x: sumX / vertices.length, y: sumY / vertices.length, z: sumZ / vertices.length }
    : { x: 0, y: 0, z: 0 };
  
  // Calculate volume using signed volume method (same as STL)
  let totalVolume = 0;
  let triangleCount = 0;
  
  for (const face of faces) {
    // Triangulate polygon faces (fan triangulation)
    if (face.length >= 3) {
      const v0 = vertices[face[0]];
      if (!v0) continue; // Skip invalid vertex indices
      
      for (let i = 1; i < face.length - 1; i++) {
        const v1 = vertices[face[i]];
        const v2 = vertices[face[i + 1]];
        
        if (!v1 || !v2) continue; // Skip invalid vertex indices
        
        // Calculate signed volume of tetrahedron using reference point
        const volume = calculateTetrahedronVolume(v0, v1, v2, referencePoint);
        if (isFinite(volume)) {
          totalVolume += volume;
          triangleCount++;
        }
      }
    }
  }
  
  console.log(`OBJ volume calculation: ${triangleCount} triangles, raw volume: ${totalVolume} mm³`);
  
  // Convert from mm³ to cm³ and take absolute value
  const finalVolume = Math.abs(totalVolume) / 1000;
  console.log(`OBJ final volume: ${finalVolume} cm³`);
  
  if (finalVolume === 0 && triangleCount > 0) {
    console.warn("Volume is 0 despite valid triangles - this should not happen with reference point method");
  }
  
  return finalVolume;
}

/**
 * Calculate volume for 3MF files by parsing mesh data from XML
 * Uses the same accurate signed volume method as STL/OBJ
 */
export async function calculate3MFVolume(file: File): Promise<number> {
  const JSZip = (await import('jszip')).default;
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  // Find model file in 3MF archive
  let modelFile: { async: (format: string) => Promise<string | ArrayBuffer | Blob> } | null = null;
  let modelPath = '';
  
  // Look for .model files (XML format)
  for (const [path, entry] of Object.entries(zip.files)) {
    const entryAny = entry as any;
    if (entryAny.dir) continue;
    const lowerPath = path.toLowerCase();
    if (lowerPath.endsWith('.model')) {
      modelFile = entryAny;
      modelPath = path;
      break;
    }
  }
  
  // If no .model file, look for STL/OBJ files in the archive
  if (!modelFile) {
    for (const [path, entry] of Object.entries(zip.files)) {
      const entryAny = entry as any;
      if (entryAny.dir) continue;
      const lowerPath = path.toLowerCase();
      if (lowerPath.endsWith('.stl')) {
        const stlData = await entryAny.async('arraybuffer');
        const stlFile = new File([stlData], path, { type: 'application/octet-stream' });
        return await calculateSTLVolume(stlFile);
      } else if (lowerPath.endsWith('.obj')) {
        const objData = await entryAny.async('blob');
        const objFile = new File([objData], path, { type: 'text/plain' });
        return await calculateOBJVolume(objFile);
      }
    }
  }
  
  if (!modelFile) {
    throw new Error('No model file found in 3MF archive');
  }
  
  // Parse XML model file
  const modelText = (await (modelFile as any).async('string')) as string;
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(modelText, 'text/xml');
  
  // Get unit from model element (default is millimeter per 3MF spec)
  const root = xmlDoc.documentElement;
  const unit = root.getAttribute('unit') || 'millimeter';
  console.log(`3MF model unit: ${unit}`);
  
  // Find mesh elements
  const meshes = xmlDoc.getElementsByTagName('mesh');
  if (meshes.length === 0) {
    // Try with namespace
    const namespace = root.namespaceURI || 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
    const nsMeshes = xmlDoc.getElementsByTagNameNS(namespace, 'mesh');
    if (nsMeshes.length === 0) {
      throw new Error('No mesh elements found in 3MF model file');
    }
    return calculateVolumeFromMeshes(nsMeshes, unit);
  }
  
  return calculateVolumeFromMeshes(meshes, unit);
}

/**
 * Calculate volume from 3MF mesh elements
 * @param meshes - Mesh elements from 3MF XML
 * @param unit - Unit attribute from model element ('meter', 'millimeter', 'inch', etc.)
 */
function calculateVolumeFromMeshes(meshes: HTMLCollectionOf<Element> | Element[], unit: string = 'millimeter'): number {
  let totalVolume = 0;
  
  // Unit conversion factors to millimeters
  const unitToMm: Record<string, number> = {
    'meter': 1000,
    'millimeter': 1,
    'inch': 25.4,
    'foot': 304.8,
    'micron': 0.001,
  };
  
  const unitFactor = unitToMm[unit.toLowerCase()] || 1;
  console.log(`3MF unit conversion factor: ${unitFactor} (unit: ${unit})`);
  
  // Calculate centroid as reference point
  const allVertices: Array<{ x: number; y: number; z: number }> = [];
  
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    
    // Get vertices
    let verticesElement = mesh.getElementsByTagName('vertices')[0];
    if (!verticesElement) {
      const namespace = mesh.namespaceURI;
      if (namespace) {
        verticesElement = mesh.getElementsByTagNameNS(namespace, 'vertices')[0];
      }
    }
    
    if (!verticesElement) continue;
    
    const vertexElements = verticesElement.getElementsByTagName('vertex');
    
    for (let j = 0; j < vertexElements.length; j++) {
      const vertex = vertexElements[j];
      const x = parseFloat(vertex.getAttribute('x') || '0');
      const y = parseFloat(vertex.getAttribute('y') || '0');
      const z = parseFloat(vertex.getAttribute('z') || '0');
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        // Convert to millimeters
        allVertices.push({ 
          x: x * unitFactor, 
          y: y * unitFactor, 
          z: z * unitFactor 
        });
      }
    }
  }
  
  // Calculate centroid as reference point
  let sumX = 0, sumY = 0, sumZ = 0;
  for (const v of allVertices) {
    sumX += v.x;
    sumY += v.y;
    sumZ += v.z;
  }
  const referencePoint = allVertices.length > 0
    ? { x: sumX / allVertices.length, y: sumY / allVertices.length, z: sumZ / allVertices.length }
    : { x: 0, y: 0, z: 0 };
  
  // Now calculate volume using the vertices we collected
  let vertexIndex = 0;
  let validTriangles = 0;
  
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    
    // Get triangles
    let trianglesElement = mesh.getElementsByTagName('triangles')[0];
    if (!trianglesElement) {
      const namespace = mesh.namespaceURI;
      if (namespace) {
        trianglesElement = mesh.getElementsByTagNameNS(namespace, 'triangles')[0];
      }
    }
    
    if (!trianglesElement) continue;
    
    const triangleElements = trianglesElement.getElementsByTagName('triangle');
    
    // Get vertices for this mesh
    let verticesElement = mesh.getElementsByTagName('vertices')[0];
    if (!verticesElement) {
      const namespace = mesh.namespaceURI;
      if (namespace) {
        verticesElement = mesh.getElementsByTagNameNS(namespace, 'vertices')[0];
      }
    }
    
    if (!verticesElement) continue;
    
    const vertexElements = verticesElement.getElementsByTagName('vertex');
    const meshVertices: Array<{ x: number; y: number; z: number }> = [];
    
    for (let j = 0; j < vertexElements.length; j++) {
      const vertex = vertexElements[j];
      const x = parseFloat(vertex.getAttribute('x') || '0');
      const y = parseFloat(vertex.getAttribute('y') || '0');
      const z = parseFloat(vertex.getAttribute('z') || '0');
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        // Convert to millimeters
        meshVertices.push({ 
          x: x * unitFactor, 
          y: y * unitFactor, 
          z: z * unitFactor 
        });
      }
    }
    
    // Calculate volume from triangles
    for (let j = 0; j < triangleElements.length; j++) {
      const triangle = triangleElements[j];
      const v1Idx = parseInt(triangle.getAttribute('v1') || '-1');
      const v2Idx = parseInt(triangle.getAttribute('v2') || '-1');
      const v3Idx = parseInt(triangle.getAttribute('v3') || '-1');
      
      if (v1Idx >= 0 && v2Idx >= 0 && v3Idx >= 0 &&
          v1Idx < meshVertices.length && v2Idx < meshVertices.length && v3Idx < meshVertices.length) {
        const v1 = meshVertices[v1Idx];
        const v2 = meshVertices[v2Idx];
        const v3 = meshVertices[v3Idx];
        
        const volume = calculateTetrahedronVolume(v1, v2, v3, referencePoint);
        if (isFinite(volume)) {
          totalVolume += volume;
          validTriangles++;
        }
      }
    }
  }
  
  console.log(`3MF volume calculation: ${validTriangles} triangles, raw volume: ${totalVolume} mm³`);
  
  // Convert from mm³ to cm³ and take absolute value
  const finalVolume = Math.abs(totalVolume) / 1000;
  console.log(`3MF final volume: ${finalVolume} cm³`);
  
  return finalVolume;
}

/**
 * Calculate volume from a 3D file
 */
export async function calculateFileVolume(file: File): Promise<number> {
  const extension = file.name.toLowerCase().split('.').pop();
  
  console.log(`Calculating volume for ${file.name} (${extension}), size: ${file.size} bytes`);
  
  try {
    let volume: number;
    switch (extension) {
      case 'stl':
        volume = await calculateSTLVolume(file);
        break;
      case 'obj':
        volume = await calculateOBJVolume(file);
        break;
      case '3mf':
        volume = await calculate3MFVolume(file);
        break;
      default:
        throw new Error(`Unsupported file format: ${extension}`);
    }
    
    console.log(`Calculated volume: ${volume} cm³ for ${file.name}`);
    
    // Validate volume
    if (!volume || volume <= 0 || !isFinite(volume)) {
      console.warn(`Invalid volume ${volume} calculated, using fallback estimation`);
      // Fallback: estimate based on file size
      const fileSizeMB = file.size / (1024 * 1024);
      return Math.max(0.1, fileSizeMB * 15); // Rough estimate, ensure minimum
    }
    
    return volume;
  } catch (error) {
    console.error('Error calculating volume:', error);
    // Fallback: estimate based on file size
    const fileSizeMB = file.size / (1024 * 1024);
    const fallbackVolume = Math.max(0.1, fileSizeMB * 15); // Rough estimate, ensure minimum
    console.log(`Using fallback volume estimate: ${fallbackVolume} cm³`);
    return fallbackVolume;
  }
}

/**
 * Estimate filament usage in grams using industry-standard calculation
 * Based on: shell volume (perimeters + top/bottom) + infill volume
 */
function estimateFilamentGrams(
  volumeCm3: number,
  settings: PrintSettings
): number {
  if (!volumeCm3 || volumeCm3 <= 0 || !isFinite(volumeCm3)) {
    console.error('Invalid volume in estimateFilamentGrams:', volumeCm3);
    return 0;
  }
  
  const density = MATERIAL_DENSITIES[settings.material] || MATERIAL_DENSITIES.pla;
  
  // Convert volume to mm³ for calculations
  const volumeMm3 = volumeCm3 * 1000;
  
  // Estimate model dimensions (assuming roughly cubic shape)
  // Height estimate: cube root of volume
  const estimatedHeight = Math.max(0.1, Math.cbrt(volumeMm3)); // Ensure minimum height
  const estimatedBaseArea = Math.max(1, volumeMm3 / estimatedHeight); // mm², ensure minimum
  const estimatedPerimeter = Math.sqrt(estimatedBaseArea) * 4; // approximate perimeter
  
  // Calculate shell volume (perimeters + top/bottom layers)
  // Shell volume = (perimeter * height * line_width * num_perimeters) + (base_area * line_height * num_top_bottom_layers)
  const perimeterVolume = estimatedPerimeter * estimatedHeight * STANDARD_LINE_WIDTH * STANDARD_PERIMETERS;
  const topBottomVolume = estimatedBaseArea * settings.layerHeight * STANDARD_TOP_BOTTOM_LAYERS * 2; // top + bottom
  const shellVolume = Math.max(0, (perimeterVolume + topBottomVolume) / 1000); // Convert to cm³, ensure non-negative
  
  // Calculate infill volume
  // Infill volume = (total_volume - shell_volume) * infill_percentage
  const infillVolume = Math.max(0, (volumeCm3 - shellVolume) * (settings.infill / 100));
  
  // Total material volume needed
  const totalMaterialVolume = shellVolume + infillVolume;
  
  // Add 5% for support material (if needed) and 3% for waste/prime tower
  const adjustedVolume = totalMaterialVolume * 1.08;
  
  // Convert to grams: volume (cm³) * density (g/cm³) * quantity
  const grams = adjustedVolume * density * settings.quantity;
  
  return Math.max(0, grams); // Ensure non-negative
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
 * Calculate price estimate based on print time and speed
 */
function calculatePrice(
  estimatedTime: number,
  settings: PrintSettings
): { totalPrice: number; manufacturingPrice: number; deliveryPrice: number } {
  // Base machine time cost per hour (CAD)
  const baseRatePerHour = 15.0; // $15/hour base rate
  
  // Speed multipliers (rush orders cost more)
  const speedMultipliers: Record<string, number> = {
    instant: 5.0,  // 400% premium for same day
    fast: 2.5,     // 150% premium for 1-2 days
    regular: 1.0,  // Base rate for 1-5 days
  };
  
  // Calculate base time cost
  const timeHours = estimatedTime / 60;
  const baseTimeCost = timeHours * baseRatePerHour;
  
  // Apply speed multiplier
  const speed = settings.speed || 'regular';
  const speedMultiplier = speedMultipliers[speed] || 1.0;
  
  // Calculate price per unit based on time and speed
  const pricePerUnit = baseTimeCost * speedMultiplier;
  
  // Minimum charge (setup fee)
  const minimumCharge = 10.0; // $10 minimum order
  
  // Apply minimum charge
  const priceWithMinimum = Math.max(minimumCharge, pricePerUnit);
  
  // Quantity discount (bulk orders get discount)
  const getQuantityDiscount = (qty: number): number => {
    if (qty >= 10) return 0.15; // 15% off for 10+
    if (qty >= 5) return 0.10;  // 10% off for 5+
    if (qty >= 3) return 0.05;  // 5% off for 3+
    return 0; // No discount for 1-2
  };
  
  // Apply quantity discount
  const quantityDiscount = getQuantityDiscount(settings.quantity);
  const discountedPricePerUnit = priceWithMinimum * (1 - quantityDiscount);
  
  // Total manufacturing price for quantity
  const manufacturingPrice = discountedPricePerUnit * settings.quantity;
  
  // Calculate delivery fee if local delivery is selected
  let deliveryPrice = 0;
  if (settings.delivery === 'delivery' && settings.deliveryDistance !== null && settings.deliveryDistance !== undefined) {
    const distanceKm = settings.deliveryDistance;
    
    // Average driving speed in Toronto (km/h) - accounting for traffic
    const averageSpeedKmh = 40; // Conservative estimate for city driving
    
    // Calculate travel time one way (hours)
    const travelTimeOneWay = distanceKm / averageSpeedKmh;
    
    // Charge for round trip (back and forth)
    const totalTravelTime = travelTimeOneWay * 2;
    
    // Delivery rate per hour
    const deliveryRatePerHour = 25.0; // $25/hour
    
    // Calculate delivery fee based on travel time
    const deliveryFee = totalTravelTime * deliveryRatePerHour;
    
    // Minimum delivery fee
    const minimumDeliveryFee = 10.0; // $10 minimum
    
    deliveryPrice = Math.max(minimumDeliveryFee, deliveryFee);
  }
  
  // Total price is manufacturing + delivery
  const totalPrice = manufacturingPrice + deliveryPrice;
  
  return {
    totalPrice,
    manufacturingPrice,
    deliveryPrice,
  };
}

/**
 * Calculate complete print estimate
 */
export async function calculatePrintEstimate(
  file: File,
  settings: PrintSettings
): Promise<PrintEstimate> {
  const volume = await calculateFileVolume(file);
  
  // Validate volume
  if (!volume || volume <= 0 || !isFinite(volume)) {
    console.error('Invalid volume calculated:', volume, 'for file:', file.name);
    throw new Error(`Failed to calculate volume for ${file.name}. The file may be corrupted or in an unsupported format.`);
  }
  
  const filamentGrams = estimateFilamentGrams(volume, settings);
  const filamentMeters = estimateFilamentMeters(filamentGrams, settings.material);
  const estimatedTime = estimatePrintTime(volume, settings);
  const priceBreakdown = calculatePrice(estimatedTime, settings);
  
  // Validate all results
  if (!isFinite(filamentGrams) || !isFinite(filamentMeters) || !isFinite(estimatedTime) || 
      !isFinite(priceBreakdown.totalPrice) || !isFinite(priceBreakdown.manufacturingPrice) || !isFinite(priceBreakdown.deliveryPrice)) {
    console.error('Invalid calculation results:', { volume, filamentGrams, filamentMeters, estimatedTime, priceBreakdown });
    throw new Error('Failed to calculate print estimate. Please check the file format.');
  }
  
  return {
    volume: Math.round(volume * 10) / 10, // Round to 1 decimal
    filamentGrams: Math.round(filamentGrams * 10) / 10,
    filamentMeters: Math.round(filamentMeters * 10) / 10,
    estimatedTime: Math.round(estimatedTime),
    price: Math.round(priceBreakdown.totalPrice * 100) / 100, // Round to 2 decimals
    manufacturingPrice: Math.round(priceBreakdown.manufacturingPrice * 100) / 100,
    deliveryPrice: Math.round(priceBreakdown.deliveryPrice * 100) / 100,
  };
}
