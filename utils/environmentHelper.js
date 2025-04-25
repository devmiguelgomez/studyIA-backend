import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Detectar si estamos en Vercel
export const isVercel = process.env.VERCEL === '1';

// Obtener ruta base de la aplicación
export const getAppRoot = () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, '..');
};

// Obtener la ruta adecuada para guardar archivos
export const getUploadPath = () => {
  return isVercel ? '/tmp' : path.join(getAppRoot(), 'uploads');
};

// Garantizar que un directorio existe (solo en entorno local)
export const ensureDirectoryExists = (dirPath) => {
  if (isVercel) {
    console.log(`Ejecutando en Vercel: No se creará el directorio ${dirPath}`);
    return;
  }

  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`✅ Directorio creado: ${dirPath}`);
    } catch (err) {
      console.error(`❌ Error creando directorio ${dirPath}:`, err);
    }
  }
};

// Registrar información de archivo
export const logFileInfo = (file) => {
  if (!file) return;
  
  console.log('Información del archivo:');
  console.log(`- Nombre original: ${file.originalname}`);
  console.log(`- Nombre asignado: ${file.filename}`);
  console.log(`- Ruta: ${file.path}`);
  console.log(`- Tipo MIME: ${file.mimetype}`);
  console.log(`- Tamaño: ${file.size} bytes`);
};
