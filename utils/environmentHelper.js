import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Mejorar la detección de Vercel usando múltiples métodos
export const isVercel = () => {
  // Verificación principal - variable de entorno configurada en Vercel
  if (process.env.VERCEL === '1') return true;
  
  // Verificación secundaria - rutas específicas de Vercel
  const currentDir = process.cwd();
  if (currentDir.includes('/var/task')) return true;
  
  // Verificación adicional - variables de entorno de AWS Lambda (usado por Vercel)
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return true;
  
  return false;
};

// Obtener ruta base de la aplicación
export const getAppRoot = () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, '..');
};

// Obtener la ruta adecuada para guardar archivos
export const getUploadPath = () => {
  return isVercel() ? '/tmp' : path.join(getAppRoot(), 'uploads');
};

// Verificar si una ruta parece estar en un entorno Vercel
export const isVercelPath = (filePath) => {
  return filePath.includes('/var/task') || filePath.includes('/var/runtime');
};

// Garantizar que un directorio existe (solo en entorno local)
export const ensureDirectoryExists = (dirPath) => {
  // Si parece un entorno Vercel (aunque no lo hayamos detectado por otras vías)
  if (isVercel() || isVercelPath(dirPath)) {
    console.log(`Detectado entorno Vercel: No se creará el directorio ${dirPath}`);
    return false;
  }

  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`✅ Directorio creado: ${dirPath}`);
      return true;
    } catch (err) {
      console.error(`❌ Error creando directorio ${dirPath}:`, err);
      return false;
    }
  }
  return true;
};

// Ruta segura para archivos temporales
export const getSafeTempPath = (filename) => {
  // Siempre usar /tmp en Vercel o paths que parecen Vercel
  if (isVercel() || process.cwd().includes('/var/task')) {
    return path.join('/tmp', filename);
  }
  return path.join(getAppRoot(), 'uploads', filename);
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
