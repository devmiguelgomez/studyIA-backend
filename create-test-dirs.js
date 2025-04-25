import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Crear directorios para pruebas de pdf-parse
const testDataDir = path.join(__dirname, 'test', 'data');

// Crear directorios de forma recursiva
function mkdirRecursive(dir) {
  if (fs.existsSync(dir)) return;
  
  try {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Directorio creado: ${dir}`);
  } catch (err) {
    console.error(`❌ Error creando directorio ${dir}:`, err);
    throw err;
  }
}

// Crear directorio para uploads
const uploadsDir = path.join(__dirname, 'uploads');
mkdirRecursive(uploadsDir);

// Crear directorio de prueba para pdf-parse
mkdirRecursive(testDataDir);

// Crear un archivo PDF vacío para evitar el error
const emptyPdfPath = path.join(testDataDir, '05-versions-space.pdf');
try {
  // Crear un archivo PDF vacío (en realidad solo es un archivo con extensión .pdf)
  fs.writeFileSync(emptyPdfPath, '%PDF-1.3\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
  console.log(`✅ Archivo PDF de prueba creado: ${emptyPdfPath}`);
} catch (err) {
  console.error(`❌ Error creando archivo PDF de prueba:`, err);
}

console.log('✨ Directorios de prueba creados correctamente');
