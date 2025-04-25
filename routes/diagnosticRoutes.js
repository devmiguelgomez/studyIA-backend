import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import mongoose from 'mongoose';
import { isVercel } from '../utils/environmentHelper.js';
import mongoConnector from '../utils/mongoConnector.js';

const router = express.Router();

// Ruta para diagnóstico completo del sistema
router.get('/', (req, res) => {
  const vercelEnvironment = isVercel() || process.cwd().includes('/var/task');
  
  // Información del sistema
  const systemInfo = {
    platform: os.platform(),
    release: os.release(),
    type: os.type(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: `${Math.round(os.totalmem() / (1024 * 1024))} MB`,
    freeMemory: `${Math.round(os.freemem() / (1024 * 1024))} MB`,
    uptime: `${Math.round(os.uptime() / 60)} minutos`,
    cwd: process.cwd(),
    tmpdir: os.tmpdir(),
    nodeVersion: process.version,
    env: process.env.NODE_ENV || 'development'
  };
  
  // Comprobar acceso a directorios clave
  const directories = [
    { path: '/tmp', writable: false },
    { path: process.cwd(), writable: false },
    { path: os.tmpdir(), writable: false }
  ];
  
  // Verificar acceso de escritura
  directories.forEach(dir => {
    try {
      const testFile = path.join(dir.path, `test-${Date.now()}.tmp`);
      fs.writeFileSync(testFile, 'test');
      dir.writable = true;
      fs.unlinkSync(testFile);
    } catch (err) {
      dir.writable = false;
      dir.error = err.message;
    }
  });
  
  // Estado de MongoDB
  const mongoStatus = {
    connected: mongoConnector.isConnected(),
    connectionState: mongoose.connection.readyState,
    stateDesc: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown'
  };
  
  res.json({
    timestamp: new Date().toISOString(),
    vercelEnvironment,
    system: systemInfo,
    directories,
    mongo: mongoStatus,
    envVars: {
      VERCEL: process.env.VERCEL || 'no definido',
      MONGODB_URI: process.env.MONGODB_URI ? 'definido' : 'no definido',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'definido' : 'no definido'
    }
  });
});

// Ruta para probar la escritura en /tmp
router.get('/test-tmp', (req, res) => {
  try {
    const filename = `test-${Date.now()}.json`;
    const filepath = path.join('/tmp', filename);
    
    // Escribir archivo de prueba
    fs.writeFileSync(filepath, JSON.stringify({ test: true, time: Date.now() }));
    
    // Leer el archivo para verificar
    const content = fs.readFileSync(filepath, 'utf8');
    
    // Eliminar archivo de prueba
    fs.unlinkSync(filepath);
    
    res.json({
      success: true,
      filepath,
      content: JSON.parse(content)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

export { router as diagnosticRouter };
