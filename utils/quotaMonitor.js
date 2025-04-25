import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isVercel, isVercelPath } from './environmentHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Verificar si estamos en Vercel con detección mejorada
const vercelEnvironment = isVercel() || process.cwd().includes('/var/task');

// Siempre usar /tmp en Vercel para cualquier archivo
const quotaLogPath = vercelEnvironment 
  ? '/tmp/quota.json' 
  : path.join(__dirname, '../logs/quota.json');

console.log(`Monitor de cuotas - Usando ruta: ${quotaLogPath} (Vercel: ${vercelEnvironment})`);

// Asegurar que el directorio de logs existe (solo si no estamos en Vercel)
const ensureLogDir = () => {
  if (vercelEnvironment) return; // En Vercel, saltamos la creación de directorios
  
  const logDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
      console.log(`✅ Directorio de logs creado: ${logDir}`);
    } catch (err) {
      console.error(`❌ Error creando directorio de logs:`, err);
    }
  }
};

// Función para guardar datos con manejo de errores
const saveQuotaData = (data) => {
  try {
    fs.writeFileSync(quotaLogPath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error al escribir en ${quotaLogPath}:`, error);
    // En caso de error al guardar, simplemente continuamos la ejecución
    return false;
  }
};

// Inicializar el archivo de registro de cuota si no existe o memoria temporal
let inMemoryQuotaData = null;
const initQuotaLog = () => {
  // Si ya tenemos datos en memoria, usarlos (especialmente útil en Vercel con errores de escritura)
  if (inMemoryQuotaData) return inMemoryQuotaData;
  
  ensureLogDir();
  
  // Valores iniciales por defecto
  const initialData = {
    requestsToday: 0,
    requestsThisMinute: 0,
    lastMinuteTimestamp: Date.now(),
    dailyReset: new Date().toISOString().split('T')[0],
    minuteQuota: 15, // Cuota API Gemini Flash
    dailyQuota: 120, // Estimado para tier gratuito de Flash
    quotaExceededCount: 0,
    lastUpdate: new Date().toISOString(),
    history: []
  };
  
  // Intentar leer el archivo de cuotas
  if (!fs.existsSync(quotaLogPath)) {
    // Si no existe, intentar crearlo
    saveQuotaData(initialData);
    inMemoryQuotaData = initialData;
    return initialData;
  }
  
  try {
    // Si el archivo existe, actualizar los límites de cuota para el modelo flash
    const data = JSON.parse(fs.readFileSync(quotaLogPath, 'utf8'));
    
    // Actualizar a los límites del modelo flash si estaban configurados para otro modelo
    if (data.minuteQuota < 15) {
      data.minuteQuota = 15;
      data.dailyQuota = 120;
      saveQuotaData(data);
    }
    
    inMemoryQuotaData = data;
    return data;
  } catch (error) {
    console.error(`Error al leer o parsear ${quotaLogPath}:`, error);
    console.log('Usando configuración de cuota predeterminada');
    inMemoryQuotaData = initialData;
    return initialData;
  }
};

// Registrar una solicitud y verificar si estamos dentro de los límites
export const trackApiRequest = () => {
  let quotaData = initQuotaLog();
  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];
  
  // Reiniciar contadores diarios si es un nuevo día
  if (quotaData.dailyReset !== today) {
    quotaData.dailyReset = today;
    quotaData.requestsToday = 0;
    // Mantener un registro del día anterior
    quotaData.history.push({
      date: quotaData.dailyReset,
      requests: quotaData.requestsToday,
      quotaExceeds: quotaData.quotaExceededCount
    });
    
    // Limitar el historial a los últimos 30 días
    if (quotaData.history.length > 30) {
      quotaData.history = quotaData.history.slice(-30);
    }
    
    quotaData.quotaExceededCount = 0;
  }
  
  // Reiniciar contador de minutos si ha pasado un minuto
  if (now - quotaData.lastMinuteTimestamp >= 60000) {
    quotaData.lastMinuteTimestamp = now;
    quotaData.requestsThisMinute = 0;
  }
  
  // Incrementar contadores
  quotaData.requestsToday++;
  quotaData.requestsThisMinute++;
  quotaData.lastUpdate = new Date().toISOString();
  
  // Verificar si excedemos cuota
  const isQuotaExceeded = quotaData.requestsThisMinute > quotaData.minuteQuota ||
                        quotaData.requestsToday >= quotaData.dailyQuota;
  
  if (isQuotaExceeded) {
    quotaData.quotaExceededCount++;
  }
  
  // Guardar datos actualizados (en archivo si es posible, y también en memoria)
  saveQuotaData(quotaData);
  inMemoryQuotaData = quotaData;
  
  return {
    isQuotaExceeded,
    quotaData,
    timeToReset: isQuotaExceeded ? 
      Math.max(0, 60000 - (now - quotaData.lastMinuteTimestamp)) : 0
  };
};

// Verificar si tenemos cuota disponible sin registrar una solicitud
export const checkQuotaAvailable = () => {
  let quotaData = initQuotaLog();
  const now = Date.now();
  
  // Reiniciar contador de minutos si ha pasado un minuto
  if (now - quotaData.lastMinuteTimestamp >= 60000) {
    return {
      isQuotaExceeded: false,
      quotaData,
      timeToReset: 0
    };
  }
  
  // Verificar si excedemos cuota
  const isQuotaExceeded = quotaData.requestsThisMinute >= quotaData.minuteQuota;
  
  return {
    isQuotaExceeded,
    quotaData,
    timeToReset: isQuotaExceeded ? 
      Math.max(0, 60000 - (now - quotaData.lastMinuteTimestamp)) : 0
  };
};

export default {
  trackApiRequest,
  checkQuotaAvailable
};
