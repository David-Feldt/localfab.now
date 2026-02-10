"use client";

import React, { Suspense, useRef, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import JSZip from "jszip";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";

// Build plate dimensions (mm) - 400x400x400 cube
const BUILD_PLATE_WIDTH = 400;
const BUILD_PLATE_DEPTH = 400;
const BUILD_PLATE_HEIGHT = 400; // Height of the build volume
const BUILD_PLATE_THICKNESS = 2; // Thickness of the walls/floor (not used for grids)

// Extend THREE.js prototypes with BVH acceleration
// This enables frustum culling and faster raycasting for large meshes
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/**
 * Add BVH acceleration structure to geometry for frustum culling
 * This allows the renderer to skip triangles outside the view frustum,
 * dramatically improving performance for large meshes
 */
function addBVHAcceleration(geometry: THREE.BufferGeometry): void {
  try {
    // Compute BVH bounds tree for frustum culling
    // This creates a spatial acceleration structure that allows the renderer
    // to quickly determine which triangles are visible and skip rendering
    // triangles outside the camera's view frustum
    geometry.computeBoundsTree();
  } catch (error) {
    console.warn('Failed to compute BVH tree:', error);
    // Continue without BVH if it fails - geometry will still render
  }
}

interface ModelViewerProps {
  file: File | null;
  className?: string;
}

// STL Loader component - reads file directly
function STLLoader({ file, onLoad }: { file: File; onLoad: (geometry: THREE.BufferGeometry) => void }) {
  useEffect(() => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (!arrayBuffer) {
          console.error('Failed to read file');
          return;
        }
        
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Check if binary STL (first 80 bytes are header, byte 80 is triangle count)
        const isBinary = uint8Array.length > 84 && 
                         (uint8Array[80] < 32 || uint8Array[80] > 126);
        
        if (isBinary) {
          // Binary STL
          const geometry = new THREE.BufferGeometry();
          const view = new DataView(arrayBuffer);
          const numTriangles = view.getUint32(80, true);
          
          const vertices: number[] = [];
          const normals: number[] = [];
          let offset = 84;
          
          for (let i = 0; i < numTriangles; i++) {
            if (offset + 50 > uint8Array.length) break;
            
            // Read normal
            const nx = view.getFloat32(offset, true);
            const ny = view.getFloat32(offset + 4, true);
            const nz = view.getFloat32(offset + 8, true);
            offset += 12;
            
            // Read three vertices
            for (let j = 0; j < 3; j++) {
              const x = view.getFloat32(offset, true);
              const y = view.getFloat32(offset + 4, true);
              const z = view.getFloat32(offset + 8, true);
              offset += 12;
              
              vertices.push(x, y, z);
              normals.push(nx, ny, nz);
            }
            
            offset += 2; // Skip attribute
          }
          
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
          geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
          geometry.computeBoundingBox();
          onLoad(geometry);
        } else {
          // ASCII STL
          const text = new TextDecoder().decode(uint8Array);
          const lines = text.split('\n');
          const vertices: number[] = [];
          const normals: number[] = [];
          let currentNormal = [0, 0, 1];
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('facet normal')) {
              const parts = trimmed.split(/\s+/);
              if (parts.length >= 5) {
                currentNormal = [
                  parseFloat(parts[2]),
                  parseFloat(parts[3]),
                  parseFloat(parts[4])
                ];
              }
            } else if (trimmed.startsWith('vertex')) {
              const parts = trimmed.split(/\s+/);
              if (parts.length >= 4) {
                const x = parseFloat(parts[1]);
                const y = parseFloat(parts[2]);
                const z = parseFloat(parts[3]);
                if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                  vertices.push(x, y, z);
                  normals.push(...currentNormal);
                }
              }
            }
          }
          
          if (vertices.length === 0) {
            console.error('No vertices found in ASCII STL file');
            return;
          }
          
          console.log(`Loaded ASCII STL: ${vertices.length / 3} vertices`);
          
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
          geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
          geometry.computeBoundingBox();
          
          if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) {
            console.error('Invalid geometry bounding box');
            return;
          }
          
          console.log('ASCII STL geometry loaded successfully');
          onLoad(geometry);
        }
      } catch (error) {
        console.error('Error parsing STL:', error);
      }
    };
    
    reader.onerror = () => {
      console.error('Error reading file');
    };
    
    reader.readAsArrayBuffer(file);
  }, [file, onLoad]);
  
  return null;
}

// OBJ Loader component - reads file directly
function OBJLoader({ file, onLoad }: { file: File; onLoad: (geometry: THREE.BufferGeometry) => void }) {
  useEffect(() => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          console.error('Failed to read file');
          return;
        }
        
        const lines = text.split('\n');
        const vertices: number[] = [];
        const faces: number[] = [];
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('v ') && !trimmed.startsWith('vt ') && !trimmed.startsWith('vn ')) {
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 4) {
              const x = parseFloat(parts[1]);
              const y = parseFloat(parts[2]);
              const z = parseFloat(parts[3]);
              if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                vertices.push(x, y, z);
              }
            }
          } else if (trimmed.startsWith('f ')) {
            const parts = trimmed.split(/\s+/);
            for (let i = 1; i < parts.length; i++) {
              const vertexIndex = parseInt(parts[i].split('/')[0]);
              if (!isNaN(vertexIndex)) {
                faces.push(vertexIndex - 1); // OBJ is 1-indexed
              }
            }
          }
        }
        
        if (vertices.length === 0) {
          console.error('No vertices found in OBJ file');
          return;
        }
        
        console.log(`Loaded OBJ: ${vertices.length / 3} vertices, ${faces.length / 3} faces`);
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        if (faces.length > 0) {
          geometry.setIndex(faces);
        }
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        
        if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) {
          console.error('Invalid geometry bounding box');
          return;
        }
        
        console.log('OBJ geometry loaded successfully');
        onLoad(geometry);
      } catch (error) {
        console.error('Error parsing OBJ:', error);
      }
    };
    
    reader.onerror = () => {
      console.error('Error reading file');
    };
    
    reader.readAsText(file);
  }, [file, onLoad]);
  
  return null;
}

// 3MF Loader component - extracts and loads model from 3MF ZIP archive
function ThreeMFLoader({ file, onLoad, onError }: { file: File; onLoad: (geometry: THREE.BufferGeometry) => void; onError?: (err?: Error) => void }) {
  useEffect(() => {
    let cancelled = false;
    
    const load3MF = async () => {
      try {
        console.log('Loading 3MF file...');
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        
        if (cancelled) return;
        
        console.log('3MF archive opened, files:', Object.keys(zip.files));
        
        // 3MF files contain model files, typically in /3D/ directory
        // Look for mesh data files - 3MF can contain STL, OBJ, or XML mesh data
        let modelFile: JSZip.JSZipObject | null = null;
        let modelPath = '';
        
        // First, try to find actual mesh files (STL, OBJ)
        for (const [path, entry] of Object.entries(zip.files)) {
          if (entry.dir) continue;
          const lowerPath = path.toLowerCase();
          if (lowerPath.endsWith('.stl') || lowerPath.endsWith('.obj')) {
            modelFile = entry;
            modelPath = path;
            console.log('Found mesh file:', path);
            break;
          }
        }
        
        // If no mesh file, look for .model files (XML format in 3MF)
        if (!modelFile) {
          for (const [path, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;
            const lowerPath = path.toLowerCase();
            if (lowerPath.endsWith('.model')) {
              modelFile = entry;
              modelPath = path;
              console.log('Found model file:', path);
              break;
            }
          }
        }
        
        // If still nothing, try any file in 3D directory
        if (!modelFile) {
          for (const [path, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;
            const lowerPath = path.toLowerCase();
            if (lowerPath.includes('3d/')) {
              modelFile = entry;
              modelPath = path;
              console.log('Found file in 3D directory:', path);
              break;
            }
          }
        }
        
        // Last resort: find any non-XML, non-image file
        if (!modelFile) {
          for (const [path, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;
            const lowerPath = path.toLowerCase();
            if (!lowerPath.endsWith('.xml') && 
                !lowerPath.endsWith('.rels') && 
                !lowerPath.endsWith('.png') && 
                !lowerPath.endsWith('.jpg') &&
                !lowerPath.endsWith('.jpeg')) {
              modelFile = entry;
              modelPath = path;
              console.log('Found potential model file:', path);
              break;
            }
          }
        }
        
        if (!modelFile) {
          console.error('No model file found in 3MF archive. Available files:', Object.keys(zip.files));
          onError?.();
          return;
        }
        
        if (cancelled) return;
        
        // Read the model file
        console.log('Reading model file:', modelPath);
        const modelData = await modelFile.async('arraybuffer');
        
        if (cancelled) return;
        
        const uint8Array = new Uint8Array(modelData);
        const path = modelPath.toLowerCase();
        
        // Check if it's an XML .model file (3MF format)
        if (path.endsWith('.model')) {
          try {
            const text = new TextDecoder().decode(uint8Array);
            console.log('3MF XML content (first 500 chars):', text.substring(0, 500));
            
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, 'text/xml');
            
            // Check for parsing errors
            const parserError = xmlDoc.querySelector('parsererror');
            if (parserError) {
              const errorMsg = parserError.textContent || 'XML parsing error';
              console.error('XML parsing error:', errorMsg);
              onError?.(new Error(errorMsg));
              return;
            }
            
            // Log the root element and its namespace
            const root = xmlDoc.documentElement;
            console.log('Root element:', root.tagName, 'Namespace:', root.namespaceURI);
            
            // Collect all possible namespaces from the document
            const namespaces = new Set<string>();
            namespaces.add(root.namespaceURI || '');
            const allElements = xmlDoc.getElementsByTagName('*');
            for (let i = 0; i < allElements.length; i++) {
              const ns = allElements[i].namespaceURI;
              if (ns) namespaces.add(ns);
            }
            
            // Common 3MF namespaces
            const commonNamespaces = [
              'http://schemas.microsoft.com/3dmanufacturing/core/2015/02',
              'http://schemas.microsoft.com/3dmanufacturing/core/2015/01',
              'http://schemas.microsoft.com/3dmanufacturing/core/2013/01',
              'http://schemas.microsoft.com/3dmanufacturing/core/2015/02',
              ''
            ];
            
            // Try all namespace variations
            let meshes: HTMLCollectionOf<Element> | Element[] = [] as any;
            
            // Method 1: Try getElementsByTagName without namespace
            meshes = xmlDoc.getElementsByTagName('mesh');
            if (meshes.length > 0) {
              console.log('Found meshes using getElementsByTagName:', meshes.length);
            }
            
            // Method 2: Try with each namespace
            if (meshes.length === 0) {
              for (const ns of Array.from(namespaces).concat(commonNamespaces)) {
                if (!ns) continue;
                try {
                  const nsMeshes = xmlDoc.getElementsByTagNameNS(ns, 'mesh');
                  if (nsMeshes.length > 0) {
                    meshes = nsMeshes;
                    console.log('Found meshes using namespace:', ns, 'count:', meshes.length);
                    break;
                  }
                } catch (e) {
                  // Invalid namespace, continue
                }
              }
            }
            
            // Method 3: Search by local name (handles prefixed tags like m:mesh)
            if (meshes.length === 0) {
              const meshArray: Element[] = [];
              for (let i = 0; i < allElements.length; i++) {
                const el = allElements[i];
                const localName = el.localName || el.tagName.split(':').pop() || el.tagName;
                const tagLower = el.tagName.toLowerCase();
                if (localName === 'mesh' || localName.toLowerCase() === 'mesh' || 
                    tagLower.endsWith(':mesh') || tagLower === 'mesh') {
                  meshArray.push(el);
                }
              }
              if (meshArray.length > 0) {
                meshes = meshArray as any;
                console.log('Found meshes by local name search:', meshes.length);
              }
            }
            
            // Method 4: Look for objects/resources that might contain meshes
            if (meshes.length === 0) {
              // Try to find <object> or <resource> elements that contain mesh data
              let objects: HTMLCollectionOf<Element> = xmlDoc.getElementsByTagName('object') as any;
              if (objects.length === 0) {
                for (const ns of Array.from(namespaces).concat(commonNamespaces)) {
                  if (!ns) continue;
                  try {
                    objects = xmlDoc.getElementsByTagNameNS(ns, 'object') as any;
                    if (objects.length > 0) break;
                  } catch (e) {}
                }
              }
              
              // Also try resources
              let resources: HTMLCollectionOf<Element> = xmlDoc.getElementsByTagName('resource') as any;
              if (resources.length === 0) {
                for (const ns of Array.from(namespaces).concat(commonNamespaces)) {
                  if (!ns) continue;
                  try {
                    resources = xmlDoc.getElementsByTagNameNS(ns, 'resource') as any;
                    if (resources.length > 0) break;
                  } catch (e) {}
                }
              }
              
              // Search within objects for meshes
              const meshArray: Element[] = [];
              
              // Search in objects
              for (let i = 0; i < objects.length; i++) {
                const obj = objects[i];
                // Look for mesh children recursively
                const searchForMeshes = (element: Element) => {
                  for (let j = 0; j < element.children.length; j++) {
                    const child = element.children[j];
                    const localName = child.localName || child.tagName.split(':').pop() || child.tagName;
                    const tagLower = child.tagName.toLowerCase();
                    if (localName === 'mesh' || localName.toLowerCase() === 'mesh' || 
                        tagLower.endsWith(':mesh') || tagLower === 'mesh') {
                      if (!meshArray.includes(child as Element)) {
                        meshArray.push(child as Element);
                      }
                    }
                    // Recursively search children
                    if (child.children.length > 0) {
                      searchForMeshes(child);
                    }
                  }
                  // Also try getElementsByTagName
                  const childMeshes = element.getElementsByTagName('mesh');
                  for (let j = 0; j < childMeshes.length; j++) {
                    if (!meshArray.includes(childMeshes[j])) {
                      meshArray.push(childMeshes[j]);
                    }
                  }
                };
                searchForMeshes(obj);
              }
              
              // Search in resources
              for (let i = 0; i < resources.length; i++) {
                const res = resources[i];
                const searchForMeshes = (element: Element) => {
                  for (let j = 0; j < element.children.length; j++) {
                    const child = element.children[j];
                    const localName = child.localName || child.tagName.split(':').pop() || child.tagName;
                    const tagLower = child.tagName.toLowerCase();
                    if (localName === 'mesh' || localName.toLowerCase() === 'mesh' || 
                        tagLower.endsWith(':mesh') || tagLower === 'mesh') {
                      if (!meshArray.includes(child as Element)) {
                        meshArray.push(child as Element);
                      }
                    }
                    if (child.children.length > 0) {
                      searchForMeshes(child);
                    }
                  }
                  const childMeshes = element.getElementsByTagName('mesh');
                  for (let j = 0; j < childMeshes.length; j++) {
                    if (!meshArray.includes(childMeshes[j])) {
                      meshArray.push(childMeshes[j]);
                    }
                  }
                };
                searchForMeshes(res);
              }
              
              if (meshArray.length > 0) {
                meshes = meshArray as any;
                console.log('Found meshes within objects/resources:', meshes.length);
              }
            }
            
            // Method 5: Deep recursive search through entire document
            if (meshes.length === 0) {
              console.log('Attempting deep recursive search for mesh elements...');
              const meshArray: Element[] = [];
              const searchRecursive = (element: Element) => {
                const tagName = element.tagName.toLowerCase();
                const localName = element.localName || tagName.split(':').pop() || tagName;
                
                // Check if this element is a mesh
                if (localName === 'mesh' || tagName.endsWith(':mesh') || tagName === 'mesh') {
                  if (!meshArray.includes(element)) {
                    meshArray.push(element);
                  }
                }
                
                // Recursively search all children
                for (let i = 0; i < element.children.length; i++) {
                  searchRecursive(element.children[i] as Element);
                }
              };
              
              searchRecursive(root);
              
              if (meshArray.length > 0) {
                meshes = meshArray as any;
                console.log('Found meshes via deep recursive search:', meshes.length);
              }
            }
            
            // Log all element names for debugging
            const allTags = new Set<string>();
            for (let i = 0; i < allElements.length; i++) {
              const tag = allElements[i].tagName;
              allTags.add(tag);
            }
            console.log('All XML tags found:', Array.from(allTags));
            console.log('Namespaces found:', Array.from(namespaces));
            
            if (meshes.length === 0) {
              const errorMsg = 'No mesh elements found in 3MF XML model file';
              console.warn(errorMsg);
              console.log('Available elements:', Array.from(allTags));
              console.log('Namespaces found:', Array.from(namespaces));
              console.log('Root element:', root.tagName, 'Namespace:', root.namespaceURI);
              
              // Try to find any elements that might contain geometry data
              const potentialGeometryElements: string[] = [];
              for (let i = 0; i < allElements.length; i++) {
                const el = allElements[i];
                const tagName = el.tagName.toLowerCase();
                if (tagName.includes('vertex') || tagName.includes('triangle') || 
                    tagName.includes('face') || tagName.includes('geometry') ||
                    tagName.includes('model') || tagName.includes('object') ||
                    tagName.includes('resource') || tagName.includes('component')) {
                  potentialGeometryElements.push(`${el.tagName} (${el.namespaceURI || 'no namespace'})`);
                }
              }
              
              if (potentialGeometryElements.length > 0) {
                console.log('Potential geometry-related elements found:', potentialGeometryElements);
              }
              
              // Log XML structure (first 2000 chars) for debugging
              console.log('XML structure (first 2000 chars):', text.substring(0, 2000));
              
              // Instead of erroring immediately, try to fall through to STL/OBJ parsing
              // The file might contain binary STL/OBJ data even if it's a .model file
              console.log('Attempting to parse as STL/OBJ as fallback...');
              // Skip XML mesh processing and fall through to try STL/OBJ parsing
              throw new Error('No meshes found in XML, trying STL/OBJ fallback');
            }
            
            console.log(`Found ${meshes.length} mesh element(s)`);
            
            // Combine all meshes
            const allVertices: number[] = [];
            const allIndices: number[] = [];
            let vertexOffset = 0;
            
            for (let meshIdx = 0; meshIdx < meshes.length; meshIdx++) {
              const mesh = meshes[meshIdx];
              console.log(`Processing mesh ${meshIdx}, children:`, Array.from(mesh.children).map(c => c.tagName));
              
              // Get vertices - try different methods
              let verticesElement = mesh.getElementsByTagName('vertices')[0];
              if (!verticesElement) {
                // Try with namespace
                const namespace = mesh.namespaceURI || root.namespaceURI;
                if (namespace) {
                  verticesElement = mesh.getElementsByTagNameNS(namespace, 'vertices')[0];
                }
              }
              if (!verticesElement) {
                // Try by local name
                for (let i = 0; i < mesh.children.length; i++) {
                  const child = mesh.children[i];
                  if (child.localName === 'vertices' || child.tagName.toLowerCase().endsWith('vertices')) {
                    verticesElement = child as Element;
                    break;
                  }
                }
              }
              
              if (!verticesElement) {
                console.warn('No vertices element found in mesh', meshIdx);
                console.log('Mesh children:', Array.from(mesh.children).map(c => c.tagName));
                continue;
              }
              
              // Get vertex elements
              let vertexElements = verticesElement.getElementsByTagName('vertex');
              if (vertexElements.length === 0) {
                const namespace = verticesElement.namespaceURI;
                if (namespace) {
                  vertexElements = verticesElement.getElementsByTagNameNS(namespace, 'vertex');
                }
              }
              if (vertexElements.length === 0) {
                // Try by local name
                const vertexArray: Element[] = [];
                for (let i = 0; i < verticesElement.children.length; i++) {
                  const child = verticesElement.children[i];
                  if (child.localName === 'vertex' || child.tagName.toLowerCase().endsWith('vertex')) {
                    vertexArray.push(child as Element);
                  }
                }
                vertexElements = vertexArray as any;
              }
              
              console.log(`Found ${vertexElements.length} vertex elements`);
              
              const meshVertices: number[] = [];
              
              for (let i = 0; i < vertexElements.length; i++) {
                const vertex = vertexElements[i];
                const x = parseFloat(vertex.getAttribute('x') || '0');
                const y = parseFloat(vertex.getAttribute('y') || '0');
                const z = parseFloat(vertex.getAttribute('z') || '0');
                if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                  meshVertices.push(x, y, z);
                }
              }
              
              if (meshVertices.length === 0) {
                console.warn('No valid vertices found in mesh', meshIdx);
                // Log first vertex element to see its structure
                if (vertexElements.length > 0) {
                  console.log('Sample vertex element:', vertexElements[0].outerHTML);
                }
                continue;
              }
              
              // Get triangles/faces
              let trianglesElement = mesh.getElementsByTagName('triangles')[0];
              if (!trianglesElement) {
                trianglesElement = mesh.getElementsByTagName('faces')[0];
              }
              if (!trianglesElement) {
                // Try with namespace
                const namespace = mesh.namespaceURI || root.namespaceURI;
                if (namespace) {
                  trianglesElement = mesh.getElementsByTagNameNS(namespace, 'triangles')[0] || 
                                    mesh.getElementsByTagNameNS(namespace, 'faces')[0];
                }
              }
              if (!trianglesElement) {
                // Try by local name
                for (let i = 0; i < mesh.children.length; i++) {
                  const child = mesh.children[i];
                  const tagName = child.localName || child.tagName.toLowerCase();
                  if (tagName === 'triangles' || tagName === 'faces' || tagName.endsWith('triangles') || tagName.endsWith('faces')) {
                    trianglesElement = child as Element;
                    break;
                  }
                }
              }
              
              if (!trianglesElement) {
                console.warn('No triangles or faces element found in mesh', meshIdx);
                continue;
              }
              
              // Get triangle elements
              let triangleElements = trianglesElement.getElementsByTagName('triangle');
              if (triangleElements.length === 0) {
                const namespace = trianglesElement.namespaceURI;
                if (namespace) {
                  triangleElements = trianglesElement.getElementsByTagNameNS(namespace, 'triangle');
                }
              }
              if (triangleElements.length === 0) {
                // Try by local name
                const triangleArray: Element[] = [];
                for (let i = 0; i < trianglesElement.children.length; i++) {
                  const child = trianglesElement.children[i];
                  if (child.localName === 'triangle' || child.tagName.toLowerCase().endsWith('triangle')) {
                    triangleArray.push(child as Element);
                  }
                }
                triangleElements = triangleArray as any;
              }
              
              console.log(`Found ${triangleElements.length} triangle elements`);
              
              const meshIndices: number[] = [];
              
              for (let i = 0; i < triangleElements.length; i++) {
                const triangle = triangleElements[i];
                const v1 = parseInt(triangle.getAttribute('v1') || '-1');
                const v2 = parseInt(triangle.getAttribute('v2') || '-1');
                const v3 = parseInt(triangle.getAttribute('v3') || '-1');
                
                if (v1 >= 0 && v2 >= 0 && v3 >= 0) {
                  allIndices.push(
                    vertexOffset + v1,
                    vertexOffset + v2,
                    vertexOffset + v3
                  );
                }
              }
              
              // Add vertices to the combined array
              allVertices.push(...meshVertices);
              vertexOffset += meshVertices.length / 3;
            }
            
            if (allVertices.length === 0) {
              console.error('No vertices found in 3MF XML model');
              onError?.();
              return;
            }
            
            console.log(`Loaded 3MF XML: ${allVertices.length / 3} vertices, ${allIndices.length / 3} triangles`);
            
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(allVertices, 3));
            if (allIndices.length > 0) {
              geometry.setIndex(allIndices);
            }
            geometry.computeVertexNormals();
            geometry.computeBoundingBox();
            
            if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) {
              console.error('Invalid geometry bounding box');
              onError?.();
              return;
            }
            
            if (!cancelled) {
              onLoad(geometry);
            }
            return;
          } catch (xmlError) {
            console.warn('Error parsing 3MF XML or no meshes found:', xmlError);
            // Fall through to try as STL/OBJ - the file might contain binary data
          }
        }
        
        // Try to parse as STL (binary or ASCII) - either as .stl file or fallback from .model
        // Check if it looks like STL data (binary STL has specific header structure)
        const looksLikeSTL = path.endsWith('.stl') || 
          (uint8Array.length > 84 && (uint8Array[80] < 32 || uint8Array[80] > 126));
        
        if (looksLikeSTL) {
          const isBinary = uint8Array.length > 84 && 
                           (uint8Array[80] < 32 || uint8Array[80] > 126);
          
          if (isBinary) {
            // Binary STL
            const geometry = new THREE.BufferGeometry();
            const view = new DataView(modelData);
            const numTriangles = view.getUint32(80, true);
            
            const vertices: number[] = [];
            const normals: number[] = [];
            let offset = 84;
            
            for (let i = 0; i < numTriangles; i++) {
              if (offset + 50 > uint8Array.length) break;
              
              const nx = view.getFloat32(offset, true);
              const ny = view.getFloat32(offset + 4, true);
              const nz = view.getFloat32(offset + 8, true);
              offset += 12;
              
              for (let j = 0; j < 3; j++) {
                const x = view.getFloat32(offset, true);
                const y = view.getFloat32(offset + 4, true);
                const z = view.getFloat32(offset + 8, true);
                offset += 12;
                
                vertices.push(x, y, z);
                normals.push(nx, ny, nz);
              }
              
              offset += 2;
            }
            
            if (vertices.length === 0) {
              console.error('No vertices found in 3MF binary STL');
              onError?.();
              return;
            }
            
            console.log(`Loaded 3MF binary STL: ${vertices.length / 3} vertices`);
            
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            geometry.computeBoundingBox();
            
            if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) {
              console.error('Invalid geometry bounding box');
              onError?.();
              return;
            }
            
            if (!cancelled) {
              onLoad(geometry);
            }
          } else {
            // ASCII STL
            const text = new TextDecoder().decode(uint8Array);
            const lines = text.split('\n');
            const vertices: number[] = [];
            const normals: number[] = [];
            let currentNormal = [0, 0, 1];
            
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('facet normal')) {
                const parts = trimmed.split(/\s+/);
                if (parts.length >= 5) {
                  currentNormal = [
                    parseFloat(parts[2]),
                    parseFloat(parts[3]),
                    parseFloat(parts[4])
                  ];
                }
              } else if (trimmed.startsWith('vertex')) {
                const parts = trimmed.split(/\s+/);
                if (parts.length >= 4) {
                  const x = parseFloat(parts[1]);
                  const y = parseFloat(parts[2]);
                  const z = parseFloat(parts[3]);
                  if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                    vertices.push(x, y, z);
                    normals.push(...currentNormal);
                  }
                }
              }
            }
            
            if (vertices.length === 0) {
              console.error('No vertices found in 3MF ASCII STL');
              onError?.();
              return;
            }
            
            console.log(`Loaded 3MF ASCII STL: ${vertices.length / 3} vertices`);
            
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            geometry.computeBoundingBox();
            
            if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) {
              console.error('Invalid geometry bounding box');
              onError?.();
              return;
            }
            
            if (!cancelled) {
              onLoad(geometry);
            }
          }
        } else if (path.endsWith('.obj')) {
          // Parse as OBJ
          const text = new TextDecoder().decode(uint8Array);
          const lines = text.split('\n');
          const vertices: number[] = [];
          const faces: number[] = [];
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('v ') && !trimmed.startsWith('vt ') && !trimmed.startsWith('vn ')) {
              const parts = trimmed.split(/\s+/);
              if (parts.length >= 4) {
                const x = parseFloat(parts[1]);
                const y = parseFloat(parts[2]);
                const z = parseFloat(parts[3]);
                if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                  vertices.push(x, y, z);
                }
              }
            } else if (trimmed.startsWith('f ')) {
              const parts = trimmed.split(/\s+/);
              for (let i = 1; i < parts.length; i++) {
                const vertexIndex = parseInt(parts[i].split('/')[0]);
                if (!isNaN(vertexIndex)) {
                  faces.push(vertexIndex - 1);
                }
              }
            }
          }
          
          if (vertices.length === 0) {
            console.error('No vertices found in 3MF OBJ');
            onError?.();
            return;
          }
          
          console.log(`Loaded 3MF OBJ: ${vertices.length / 3} vertices, ${faces.length / 3} faces`);
          
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
          if (faces.length > 0) {
            geometry.setIndex(faces);
          }
          geometry.computeVertexNormals();
          geometry.computeBoundingBox();
          
          if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) {
            console.error('Invalid geometry bounding box');
            onError?.();
            return;
          }
          
          if (!cancelled) {
            onLoad(geometry);
          }
        } else {
          // Last attempt: try to detect format by content and parse accordingly
          console.warn('Unknown file type in 3MF archive:', path);
          console.log('File size:', uint8Array.length, 'bytes');
          
          // Try to detect format by content
          const textStart = new TextDecoder().decode(uint8Array.slice(0, Math.min(100, uint8Array.length)));
          console.log('File start:', textStart.substring(0, 100));
          
          // Check if it might be STL (ASCII STL starts with "solid" or binary STL has header)
          if (textStart.trim().toLowerCase().startsWith('solid') || 
              (uint8Array.length > 84 && (uint8Array[80] < 32 || uint8Array[80] > 126))) {
            console.log('Detected STL-like content, attempting STL parse...');
            // Will be handled by the STL parsing block above if path matches
            // For now, just log and error
          }
          
          // Check if it might be OBJ
          if (textStart.trim().startsWith('v ') || textStart.includes('\nv ') || textStart.includes('\nf ')) {
            console.log('Detected OBJ-like content, attempting OBJ parse...');
            // Will be handled by the OBJ parsing block above if path matches
          }
          
          onError?.(new Error(`Unsupported file type in 3MF archive: ${path}. File may not contain readable mesh data.`));
        }
      } catch (error) {
        console.error('Error loading 3MF:', error);
        onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    };
    
    load3MF();
    
    return () => {
      cancelled = true;
    };
  }, [file, onLoad, onError]);
  
  return null;
}

// Model component that loads and displays the 3D file
function Model({ file, onLoad, onError }: { file: File; onLoad?: () => void; onError?: () => void }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const extension = file.name.toLowerCase().split('.').pop();
  
  const handleLoad = React.useCallback((loadedGeometry: THREE.BufferGeometry) => {
    try {
      // Validate geometry
      if (!loadedGeometry || !loadedGeometry.attributes.position) {
        console.error('Invalid geometry: no position attribute');
      setError('Invalid model file');
      onError?.();
      onLoad?.();
      return;
    }
    
    const positionAttribute = loadedGeometry.attributes.position;
    if (positionAttribute.count === 0) {
      console.error('Invalid geometry: no vertices');
      setError('Model has no vertices');
      onError?.();
      onLoad?.();
      return;
    }
      
      // Center the geometry
      loadedGeometry.center();
      
      // Scale to fit build plate (leave some margin)
      const box = loadedGeometry.boundingBox;
      if (box && !box.isEmpty()) {
        const size = new THREE.Vector3();
        box.getSize(size);
        
        // Check width (x), depth (z), and height (y)
        const maxWidth = Math.max(size.x, size.z); // Use larger of width/depth
        const maxHeight = size.y;
        
        // Scale to fit within build area with margin (400x400x400)
        const widthScale = (BUILD_PLATE_WIDTH * 0.8) / maxWidth;
        const heightScale = (BUILD_PLATE_HEIGHT * 0.8) / maxHeight;
        const scale = Math.min(widthScale, heightScale);
        
        if (scale > 0 && isFinite(scale)) {
          loadedGeometry.scale(scale, scale, scale);
          // Re-center after scaling
          loadedGeometry.center();
        }
      }
      
      // Performance optimization: Add BVH acceleration structure for frustum culling
      // This allows the renderer to skip triangles outside the view frustum,
      // dramatically improving performance for large meshes
      // BVH is most beneficial for meshes with many triangles
      const vertexCount = positionAttribute.count;
      const indexAttr = loadedGeometry.index;
      const triangleCount = indexAttr ? indexAttr.count / 3 : vertexCount / 3;
      
      if (triangleCount > 1000) {
        // Only add BVH for meshes with significant triangle count to avoid overhead
        try {
          addBVHAcceleration(loadedGeometry);
          console.log(`BVH acceleration structure added for mesh with ${triangleCount.toFixed(0)} triangles`);
        } catch (bvhError) {
          console.warn('BVH acceleration failed, continuing without it:', bvhError);
        }
      }
      
      // Recompute bounding box after processing
      loadedGeometry.computeBoundingBox();
      
      setGeometry(loadedGeometry);
      setError(null);
      onLoad?.();
    } catch (err) {
      console.error('Error processing geometry:', err);
      setError('Failed to process model');
      onError?.();
      onLoad?.(); // Still call onLoad to hide loading state
    }
  }, [onLoad, onError]);
  
  const handleError = React.useCallback((err?: Error) => {
    console.error('Error loading model:', err);
    setError('Failed to load model');
    onError?.(); // Notify parent of error
    onLoad?.(); // Hide loading state even on error
  }, [onLoad, onError]);
  
  // Auto-rotate animation (optional - can be disabled)
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.002;
    }
  });
  
  // Cleanup BVH tree on unmount or geometry change to prevent memory leaks
  // IMPORTANT: This hook must be called before any conditional returns
  // to follow the Rules of Hooks
  useEffect(() => {
    const currentGeometry = geometry;
    return () => {
      if (currentGeometry) {
        try {
          // Dispose of the BVH acceleration structure when geometry is no longer needed
          if ((currentGeometry as any).boundsTree) {
            (currentGeometry as any).disposeBoundsTree();
          }
        } catch (error) {
          // Ignore errors during cleanup - geometry may not have BVH tree
        }
      }
    };
  }, [geometry]);
  
  // Error state is handled by parent component, return null here
  if (error) {
    return null;
  }
  
  if (!geometry) {
    return (
      <>
        {extension === 'stl' && <STLLoader file={file} onLoad={handleLoad} />}
        {extension === 'obj' && <OBJLoader file={file} onLoad={handleLoad} />}
        {extension === '3mf' && <ThreeMFLoader file={file} onLoad={handleLoad} onError={handleError} />}
        {extension !== 'stl' && extension !== 'obj' && extension !== '3mf' && (
          <>
            {onError?.()}
            {onLoad?.()}
          </>
        )}
      </>
    );
  }
  
  return (
    <mesh ref={meshRef} geometry={geometry} position={[0, 0, 0]}>
      <meshStandardMaterial 
        color="#ffffff" 
        metalness={0.3}
        roughness={0.4}
      />
    </mesh>
  );
}

// Build plate component
function BuildPlate() {
  const offset = 200; // 200mm offset from center in each direction
  const gridDivisions = 8;
  
  // GridHelper creates a grid in XZ plane by default
  // args: [size, divisions, colorCenterLine, colorGrid]
  // Each plane is 400x400 and offset 200mm from center
  
  return (
    <group>
      {/* Bottom floor grid - extends in X and Z, offset -200 in Y direction */}
      {/* Positioned 200mm below center, flat horizontally (GridHelper is horizontal by default) */}
      <gridHelper 
        args={[BUILD_PLATE_WIDTH, gridDivisions, '#9ca3af', '#6b7280']} 
        position={[0, -offset, 0]}
        rotation={[0, 0, 0]}
      />
      
      {/* Right wall grid - extends in Y and Z, offset +200 in X direction */}
      {/* Positioned 200mm to the right of center, rotated to be vertical */}
      <gridHelper 
        args={[BUILD_PLATE_HEIGHT, gridDivisions, '#9ca3af', '#6b7280']} 
        position={[offset, 0, 0]}
        rotation={[0, 0, -Math.PI / 2]}
      />
      
      {/* Back wall grid - extends in X and Y, offset -200 in Z direction */}
      {/* Positioned 200mm behind center, rotated to be vertical */}
      <gridHelper 
        args={[BUILD_PLATE_WIDTH, gridDivisions, '#9ca3af', '#6b7280']} 
        position={[0, 0, -offset]}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </group>
  );
}

// Lighting setup
function Lights() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      <directionalLight position={[-10, 10, -5]} intensity={0.4} />
      <pointLight position={[0, 20, 0]} intensity={0.3} />
    </>
  );
}

export function ModelViewer({ file, className }: ModelViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  useEffect(() => {
    if (file) {
      setLoading(true);
      setError(false);
    }
  }, [file]);
  
  if (!file) {
    return (
      <div className={`flex items-center justify-center bg-muted/30 rounded-lg border border-dashed ${className || 'h-64'}`}>
        <p className="text-sm text-muted-foreground">Upload a file to preview</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className={`flex items-center justify-center bg-muted/30 rounded-lg border border-dashed ${className || 'h-64'}`}>
        <p className="text-sm text-muted-foreground">PREVIEW not available</p>
      </div>
    );
  }
  
  return (
    <div className={`relative rounded-lg border border-border overflow-hidden bg-black ${className || 'h-64'}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <div className="text-sm text-muted-foreground">Loading model...</div>
        </div>
      )}
      <Canvas>
        <Suspense fallback={null}>
          <PerspectiveCamera makeDefault position={[400, 300, 400]} fov={50} />
          <Lights />
          <BuildPlate />
          <Model file={file} onLoad={() => setLoading(false)} onError={() => setError(true)} />
          <OrbitControls
            enablePan={false}
            minDistance={200}
            maxDistance={1000}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.2}
          />
        </Suspense>
      </Canvas>
      <div className="absolute bottom-2 left-2 text-xs text-muted-foreground bg-black/50 px-2 py-1 rounded">
        {BUILD_PLATE_WIDTH}×{BUILD_PLATE_DEPTH}mm build area
      </div>
      <div className="absolute top-2 right-2 text-xs text-muted-foreground bg-black/50 px-2 py-1 rounded">
        Drag to rotate • Scroll to zoom
      </div>
    </div>
  );
}
