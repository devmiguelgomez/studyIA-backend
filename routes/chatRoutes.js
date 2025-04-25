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

const router = express.Router();

// Verificar si estamos en Vercel
const isVercel = process.env.VERCEL === '1';

// Configurar almacenamiento para archivos subidos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../uploads');

// Crear el directorio de uploads si no existe y no estamos en Vercel
if (!isVercel && !fs.existsSync(uploadsDir)) {
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
    // En Vercel, usar un directorio temporal
    const destDir = isVercel ? '/tmp' : uploadsDir;
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
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
  // Si estamos en Vercel y la ruta es para subir archivos, rechazar la solicitud
  if (isVercel && req.path === '/quiz') {
    return res.status(400).json({
      error: "La carga de archivos no está disponible en este entorno de despliegue. Por favor, utilice la opción de tema en lugar de subir archivos."
    });
  }

  const multerSingle = upload.single('document');
  
  multerSingle(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      // Error de multer
      return res.status(400).json({
        error: `Error al subir el archivo: ${err.message}`
      });
    } else if (err) {
      // Error desconocido
      return res.status(500).json({
        error: `Error al procesar el archivo: ${err.message}`
      });
    }
    // No hay error, continuar
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
