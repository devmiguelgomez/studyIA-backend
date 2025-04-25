import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { router as chatRoutes } from './routes/chatRoutes.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtener el directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno
dotenv.config();

// Verificar si estamos en Vercel
const isVercel = process.env.VERCEL === '1';

// Función para crear directorios
const createDirectory = (dir) => {
  // En Vercel, no intentamos crear directorios que no están permitidos
  if (isVercel) {
    console.log(`Ejecutando en Vercel: No se creará el directorio ${dir}`);
    return;
  }

  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`✅ Directorio creado: ${dir}`);
    } catch (err) {
      console.error(`❌ Error creando directorio ${dir}:`, err);
    }
  }
};

// Verificar y crear directorios necesarios (solo si no estamos en Vercel)
const uploadsDir = path.join(__dirname, 'uploads');
const tempDir = '/tmp'; // Directorio temporal para Vercel
const testDataDir = path.join(__dirname, 'test', 'data');

// Crear directorios necesarios
createDirectory(uploadsDir);
createDirectory(testDataDir);

// Crear archivo PDF de prueba si no existe (solo si no estamos en Vercel)
if (!isVercel) {
  const testPdfPath = path.join(testDataDir, '05-versions-space.pdf');
  if (!fs.existsSync(testPdfPath)) {
    try {
      fs.writeFileSync(testPdfPath, '%PDF-1.3\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
      console.log(`✅ Archivo PDF de prueba creado: ${testPdfPath}`);
    } catch (err) {
      console.error(`❌ Error creando archivo PDF de prueba:`, err);
    }
  }
}

// Verificar configuración de Gemini
if (!process.env.GEMINI_API_KEY) {
  console.warn('\x1b[33m%s\x1b[0m', '⚠️  ADVERTENCIA: No se encontró la variable GEMINI_API_KEY');
  console.log('\x1b[36m%s\x1b[0m', 'Para configurar la API key de Gemini:');
  console.log('1. Crea un archivo .env en la carpeta backend');
  console.log('2. Añade la línea: GEMINI_API_KEY=tu-api-key-de-gemini');
  console.log('3. Reinicia el servidor\n');
  
  // Verificar si existe el archivo .env
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.log('\x1b[31m%s\x1b[0m', 'No se encontró el archivo .env');
    
    // Crear archivo .env.example si no existe
    const envExamplePath = path.join(__dirname, '.env.example');
    if (!fs.existsSync(envExamplePath)) {
      try {
        fs.writeFileSync(envExamplePath, 'PORT=5000\nMONGODB_URI=mongodb://localhost:27017/study-buddy-app\nGEMINI_API_KEY=tu-api-key-de-gemini-aqui\n');
        console.log(`✅ Archivo .env.example creado: ${envExamplePath}`);
        console.log('Por favor, copia este archivo a .env y agrega tu API key de Gemini');
      } catch (err) {
        console.error(`❌ Error creando archivo .env.example:`, err);
      }
    }
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/study-buddy-app';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.error('❌ Error de conexión a MongoDB:', err));

// Rutas
app.use('/api/chat', chatRoutes);

// Ruta para probar el servidor
app.get('/', (req, res) => {
  res.json({ 
    message: 'API de Study Buddy funcionando correctamente',
    status: 'Gemini configurado correctamente',
    environment: isVercel ? 'Vercel' : 'Desarrollo local'
  });
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
  console.log(`🌎 Entorno: ${isVercel ? 'Vercel (producción)' : 'Desarrollo local'}`);
});
