import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const quotaLogPath = path.join(__dirname, '../logs/quota.json');

// Asegurar que el directorio de logs existe
const ensureLogDir = () => {
  const logDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
};

// Inicializar el archivo de registro de cuota si no existe
const initQuotaLog = () => {
  ensureLogDir();
  
  if (!fs.existsSync(quotaLogPath)) {
    const initialData = {
      requestsToday: 0,
      requestsThisMinute: 0,
      lastMinuteTimestamp: Date.now(),
      dailyReset: new Date().toISOString().split('T')[0],
      minuteQuota: 15, // Cuota API Gemini Flash - más alta que la de Pro
      dailyQuota: 120, // Estimado conservador para tier gratuito de Flash
      quotaExceededCount: 0,
      lastUpdate: new Date().toISOString(),
      history: []
    };
    
    fs.writeFileSync(quotaLogPath, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  
  // Si el archivo existe, actualizamos los valores de cuota para el modelo flash
  const data = JSON.parse(fs.readFileSync(quotaLogPath, 'utf8'));
  // Actualizar a los límites del modelo flash si estaban configurados para otro modelo
  if (data.minuteQuota < 15) {
    data.minuteQuota = 15;  // Flash tiene mayor cuota por minuto
    data.dailyQuota = 120;  // Y mayor cuota diaria
    fs.writeFileSync(quotaLogPath, JSON.stringify(data, null, 2));
  }
  
  return data;
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
  
  // Guardar datos actualizados
  fs.writeFileSync(quotaLogPath, JSON.stringify(quotaData, null, 2));
  
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
