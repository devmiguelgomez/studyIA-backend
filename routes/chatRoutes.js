import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { 
  generateQuiz, 
  validateAnswer,
  getConversationHistory, 
  getSessions,
  deleteSession
} from '../controllers/chatController.js';
import { checkQuotaAvailable } from '../utils/quotaMonitor.js';
import { isVercel, isVercelPath, getUploadPath, getSafeTempPath } from '../utils/environmentHelper.js';

const router = express.Router();

// Verificación mejorada del entorno Vercel
const vercelEnvironment = isVercel() || process.cwd().includes('/var/task');
console.log(`Entorno detectado por chatRoutes: ${vercelEnvironment ? 'Vercel (producción)' : 'Desarrollo local'}`);
console.log(`Directorio actual: ${process.cwd()}`);

// Configurar almacenamiento para archivos subidos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../uploads');
const tempDir = '/tmp';

console.log(`Directorio de uploads: ${uploadsDir}`);
console.log(`Directorio temporal: ${tempDir}`);

// Crear el directorio de uploads si no existe y no estamos en Vercel
if (!vercelEnvironment && !fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`✅ Directorio de uploads creado desde routes: ${uploadsDir}`);
  } catch (err) {
    console.error(`❌ Error creando directorio de uploads:`, err);
  }
}

// Configurar multer para subida de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Siempre usar /tmp si estamos en un entorno que parece ser Vercel
    const isVercelEnv = vercelEnvironment || isVercelPath(process.cwd());
    const destDir = isVercelEnv ? tempDir : uploadsDir;
    console.log(`Usando directorio para upload: ${destDir} (isVercelEnv: ${isVercelEnv})`);
    
    // Verificar si el directorio existe antes de usarlo
    if (!fs.existsSync(destDir)) {
      try {
        fs.mkdirSync(destDir, { recursive: true });
        console.log(`Directorio de destino creado: ${destDir}`);
      } catch (mkdirErr) {
        console.error(`Error al crear directorio de destino: ${mkdirErr.message}`);
        // En caso de error, intentar usar /tmp como fallback
        if (destDir !== tempDir) {
          console.log(`Intentando usar directorio temporal ${tempDir} como alternativa`);
          if (!fs.existsSync(tempDir)) {
            try {
              fs.mkdirSync(tempDir, { recursive: true });
            } catch (tempErr) {
              console.error(`Error al crear directorio temporal: ${tempErr.message}`);
            }
          }
          return cb(null, tempDir);
        }
      }
    }
    
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname);
    console.log(`Nombre de archivo generado: ${filename}`);
    cb(null, filename);
  }
});

// Filtrar tipos de archivos permitidos
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf', 
    'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/jpg'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Formato de archivo no soportado. Por favor sube PDF, Word, JPG o PNG.'), false);
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB máximo
});

// Ruta para manejar errores de multer
const uploadMiddleware = (req, res, next) => {
  console.log(`Procesando solicitud de upload, vercelEnvironment=${vercelEnvironment}, ruta=${req.path}`);
  console.log(`Directorio actual: ${process.cwd()}`);
  
  // Si la ruta parece de Vercel pero no hemos detectado la variable de entorno
  if (!vercelEnvironment && process.cwd().includes('/var/task')) {
    console.log('⚠️ Advertencia: Detectado entorno similar a Vercel pero variable VERCEL no configurada');
    console.log('Forzando uso de directorio temporal /tmp');
    process.env.VERCEL = '1'; // Forzar el flag de Vercel para el resto de la aplicación
  }

  const multerSingle = upload.single('document');
  
  multerSingle(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      console.error(`Error de Multer: ${err.message}`);
      return res.status(400).json({
        error: `Error al subir el archivo: ${err.message}`
      });
    } else if (err) {
      console.error(`Error en uploadMiddleware: ${err.message}`);
      
      // Si el error es de tipo "no such file or directory" en /var/task
      if (err.code === 'ENOENT' && err.message.includes('/var/task')) {
        console.log('Detectado error de archivo en entorno Vercel - ajustando configuración...');
        // En este punto, informamos al usuario que hay una limitación
        return res.status(400).json({
          error: "La carga de archivos no está disponible en este entorno. Por favor, utilice el campo de tema o texto en lugar de subir archivos."
        });
      }
      
      return res.status(500).json({
        error: `Error al procesar el archivo: ${err.message}`
      });
    }
    
    // No hay error, continuar
    if (req.file) {
      console.log(`Archivo subido correctamente:`, {
        filename: req.file.filename,
        path: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
    }
    next();
  });
};

// Ruta para generar cuestionarios
router.post('/quiz', uploadMiddleware, generateQuiz);

// Ruta para validar respuestas
router.post('/validate', validateAnswer);

// Ruta para obtener el historial de conversaciones por sessionId
router.get('/history', getConversationHistory);

// Ruta para obtener todas las sesiones disponibles
router.get('/sessions', getSessions);

// Ruta para eliminar una sesión
router.delete('/sessions/:sessionId', deleteSession);

// Endpoint para verificar el estado de la API
router.get('/api-status', (req, res) => {
  const quotaStatus = checkQuotaAvailable();
  
  res.json({
    status: quotaStatus.isQuotaExceeded ? 'limited' : 'available',
    requestsThisMinute: quotaStatus.quotaData.requestsThisMinute,
    minuteQuota: quotaStatus.quotaData.minuteQuota,
    requestsToday: quotaStatus.quotaData.requestsToday,
    dailyQuota: quotaStatus.quotaData.dailyQuota,
    timeToReset: quotaStatus.timeToReset,
    message: quotaStatus.isQuotaExceeded 
      ? `La API está experimentando alta demanda. Por favor, intenta de nuevo en ${Math.ceil(quotaStatus.timeToReset/1000)} segundos.`
      : 'API disponible'
  });
});

export { router };
