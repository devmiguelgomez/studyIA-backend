import { GoogleGenerativeAI } from "@google/generative-ai";
import Conversation from '../models/Conversation.js';
import Session from '../models/Session.js';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createWorker } from 'tesseract.js';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { trackApiRequest, checkQuotaAvailable } from '../utils/quotaMonitor.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Crear el directorio de uploads si no existe
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`✅ Directorio de uploads creado: ${uploadsDir}`);
  } catch (err) {
    console.error(`❌ Error creando directorio de uploads:`, err);
  }
}

// Configurar Gemini con manejo de errores mejorado
let genAI;
try {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('⚠️ Error: La variable de entorno GEMINI_API_KEY no está definida');
    console.log('📝 Asegúrate de crear un archivo .env con tu clave API de Gemini');
  } else {
    genAI = new GoogleGenerativeAI(apiKey);
    console.log('✅ Gemini AI configurado correctamente');
  }
} catch (error) {
  console.error('❌ Error al inicializar Gemini:', error);
}

// Almacena las sesiones de chat activas
const activeSessions = new Map();

// Gestión de límites de tasa para Gemini API
const rateLimiter = {
  queue: [],
  processing: false,
  lastRequestTime: 0,
  minTimeBetweenRequests: 30000, // 30 segundos entre solicitudes
  maxRetries: 3,
  
  // Añadir solicitud a la cola
  addToQueue: function(promiseFunction, retryCount = 0) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        promiseFunction,
        resolve,
        reject,
        retryCount
      });
      
      if (!this.processing) {
        this.processQueue();
      }
    });
  },
  
  // Procesar la cola de solicitudes
  processQueue: async function() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }
    
    this.processing = true;
    const { promiseFunction, resolve, reject, retryCount } = this.queue.shift();
    
    // Calcular el tiempo de espera necesario
    const currentTime = Date.now();
    const timeToWait = Math.max(0, this.lastRequestTime + this.minTimeBetweenRequests - currentTime);
    
    if (timeToWait > 0) {
      console.log(`Esperando ${timeToWait}ms antes de la siguiente solicitud`);
      await new Promise(r => setTimeout(r, timeToWait));
    }
    
    try {
      this.lastRequestTime = Date.now();
      const result = await promiseFunction();
      resolve(result);
    } catch (error) {
      console.error('Error en solicitud a Gemini API:', error);
      
      // Comprobar si es un error de límite de tasa
      if (error.message && error.message.includes('429 Too Many Requests')) {
        let retryDelay = 30000; // Por defecto 30 segundos
        
        // Extraer el tiempo de espera sugerido por la API si está disponible
        const retryDelayMatch = error.message.match(/retryDelay:"(\d+)s"/);
        if (retryDelayMatch && retryDelayMatch[1]) {
          retryDelay = parseInt(retryDelayMatch[1]) * 1000;
        }
        
        // Añadir backoff exponencial
        retryDelay = retryDelay * Math.pow(2, retryCount);
        
        if (retryCount < this.maxRetries) {
          console.log(`Reintento ${retryCount + 1}/${this.maxRetries} después de ${retryDelay/1000}s`);
          
          // Esperar y reintentar
          setTimeout(() => {
            this.addToQueue(promiseFunction, retryCount + 1)
              .then(resolve)
              .catch(reject);
          }, retryDelay);
        } else {
          reject(new Error('Se alcanzó el número máximo de reintentos debido a límites de tasa'));
        }
      } else {
        reject(error);
      }
    }
    
    // Procesar la siguiente solicitud en la cola
    setTimeout(() => this.processQueue(), 100);
  }
};

// Función para extraer texto de diferentes tipos de documentos
const extractTextFromDocument = async (filePath, fileType) => {
  try {
    // Verificar que el archivo existe
    if (!fs.existsSync(filePath)) {
      throw new Error(`El archivo no existe en la ruta: ${filePath}`);
    }

    if (fileType === 'application/pdf') {
      // Extraer texto de PDF
      try {
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        return pdfData.text;
      } catch (pdfError) {
        console.error('Error al procesar PDF:', pdfError);
        throw new Error('No se pudo extraer texto del PDF. Formato no compatible o documento corrupto.');
      }
    } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
               fileType === 'application/msword') {
      // Extraer texto de Word
      try {
        const dataBuffer = fs.readFileSync(filePath);
        const result = await mammoth.extractRawText({ buffer: dataBuffer });
        return result.value;
      } catch (wordError) {
        console.error('Error al procesar documento Word:', wordError);
        throw new Error('No se pudo extraer texto del documento Word. Formato no compatible o documento corrupto.');
      }
    } else if (fileType.startsWith('image/')) {
      // Extraer texto de imágenes usando OCR
      try {
        const worker = await createWorker();
        await worker.loadLanguage('spa');
        await worker.initialize('spa');
        const { data } = await worker.recognize(filePath);
        await worker.terminate();
        return data.text;
      } catch (ocrError) {
        console.error('Error al procesar imagen con OCR:', ocrError);
        throw new Error('No se pudo extraer texto de la imagen. Formato no compatible o imagen corrupta.');
      }
    }
    return '';
  } catch (error) {
    console.error('Error al extraer texto del documento:', error);
    throw new Error(`No se pudo procesar el documento: ${error.message}`);
  } finally {
    // Intentar eliminar el archivo temporal en caso de error
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Archivo temporal eliminado: ${filePath}`);
      }
    } catch (cleanupError) {
      console.error('Error al limpiar archivo temporal:', cleanupError);
    }
  }
};

// Función para crear respuestas predefinidas para preguntas tipo multiple-choice y true-false
const getLocalAnswerValidation = (questionType, userAnswer, correctAnswer, explanation) => {
  let isCorrect;
  
  // Corregir la comparación para preguntas verdadero/falso
  if (questionType === 'true-false') {
    // Normalizar la respuesta del usuario y la respuesta correcta
    const normalizedUserAnswer = userAnswer.toLowerCase() === 'true';
    const normalizedCorrectAnswer = correctAnswer === 'true' || correctAnswer === true;
    isCorrect = normalizedUserAnswer === normalizedCorrectAnswer;
  } else {
    // Para otros tipos de preguntas, comparación directa
    isCorrect = userAnswer === correctAnswer;
  }
  
  if (questionType === 'multiple-choice') {
    return {
      isCorrect,
      feedback: isCorrect 
        ? `¡Correcto! 👏 ${explanation || 'Muy bien hecho.'}` 
        : `Incorrecto. 😕 La respuesta correcta es ${correctAnswer}. ${explanation || 'Intenta de nuevo.'}`
    };
  } else if (questionType === 'true-false') {
    return {
      isCorrect,
      feedback: isCorrect 
        ? `¡Correcto! 👏 ${explanation || 'Bien hecho.'}` 
        : `Incorrecto. 😕 La respuesta correcta es ${correctAnswer === 'true' || correctAnswer === true ? 'Verdadero' : 'Falso'}. ${explanation || 'Intenta de nuevo.'}`
    };
  }
};

// Generar cuestionario basado en el contenido
export const generateQuiz = async (req, res) => {
  try {
    const { topic, questionType, questionCount, sessionId, documentContent } = req.body;
    
    if (!genAI) {
      return res.status(500).json({ 
        error: 'No se ha configurado correctamente la API de Gemini',
        message: 'Error interno del servidor: API key de Gemini no configurada. Verifica el archivo .env'
      });
    }
    
    let content = documentContent || '';
    let prompt = '';
    let currentSessionId = sessionId;
    let sessionTitle = topic || 'Cuestionario sin título';
    
    // Si hay un documento subido, procesarlo
    if (req.file) {
      const filePath = req.file.path;
      const fileType = req.file.mimetype;
      
      try {
        console.log(`Procesando documento: ${filePath} (${fileType})`);
        content = await extractTextFromDocument(filePath, fileType);
        console.log(`Texto extraído exitosamente (${content.length} caracteres)`);
      } catch (error) {
        console.error('Error procesando el documento:', error);
        return res.status(400).json({ error: error.message });
      }
    }
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    // Verificar cuota antes de generar
    const quotaStatus = checkQuotaAvailable();
    
    if (quotaStatus.isQuotaExceeded) {
      console.log(`Cuota de API excedida. Tiempo estimado para reinicio: ${Math.ceil(quotaStatus.timeToReset/1000)}s`);
      return res.status(429).json({ 
        error: 'La API está experimentando alta demanda',
        message: `Por favor, intenta de nuevo en ${Math.ceil(quotaStatus.timeToReset/1000)} segundos`,
        retryAfter: Math.ceil(quotaStatus.timeToReset/1000)
      });
    }
    
    // Registrar el uso de la API
    trackApiRequest();
    
    // Construir el prompt según el tipo de cuestionario
    if (questionType === 'multiple-choice') {
      prompt = `Actúa como un profesor que crea un cuestionario de opción múltiple sobre "${topic}". 
      ${content ? 'Basándote en el siguiente contenido: ' + content.substring(0, 5000) : ''}
      Genera ${questionCount || 5} preguntas de opción múltiple con 4 opciones cada una (a, b, c, d). 
      Para cada pregunta, marca claramente la respuesta correcta y proporciona una explicación de por qué es correcta.
      Usa emojis para hacer el contenido más atractivo.
      Formatea tu respuesta como un objeto JSON con esta estructura exacta:
      {
        "questions": [
          {
            "question": "¿Pregunta 1?",
            "options": ["opción a", "opción b", "opción c", "opción d"],
            "correctAnswer": "a",
            "explanation": "Explicación de por qué esta respuesta es correcta"
          }
        ]
      }`;
    } else if (questionType === 'true-false') {
      prompt = `Actúa como un profesor que crea un cuestionario de verdadero/falso sobre "${topic}". 
      ${content ? 'Basándote en el siguiente contenido: ' + content.substring(0, 5000) : ''}
      Genera ${questionCount || 5} afirmaciones y especifica si cada una es verdadera o falsa.
      Para cada afirmación, proporciona una explicación de por qué es verdadera o falsa.
      Usa emojis para hacer el contenido más atractivo.
      Formatea tu respuesta como un objeto JSON con esta estructura exacta:
      {
        "questions": [
          {
            "statement": "Afirmación 1",
            "isTrue": true/false,
            "explanation": "Explicación de por qué esta afirmación es verdadera/falsa"
          }
        ]
      }`;
    } else { // open-ended
      prompt = `Actúa como un profesor que crea un cuestionario de preguntas abiertas sobre "${topic}". 
      ${content ? 'Basándote en el siguiente contenido: ' + content.substring(0, 5000) : ''}
      Genera ${questionCount || 5} preguntas que requieran respuestas explicativas.
      Para cada pregunta, proporciona una respuesta modelo que sea completa y detallada.
      Usa emojis para hacer el contenido más atractivo.
      Formatea tu respuesta como un objeto JSON con esta estructura exacta:
      {
        "questions": [
          {
            "question": "¿Pregunta 1?",
            "modelAnswer": "Respuesta modelo detallada para esta pregunta"
          }
        ]
      }`;
    }
    
    // Crear una nueva sesión en la BD si es necesario
    if (!sessionId) {
      const newSession = new Session({
        title: sessionTitle,
        type: 'quiz',
        questionType: questionType,
        topic: topic,
        createdAt: new Date()
      });
      
      const savedSession = await newSession.save();
      currentSessionId = savedSession._id.toString();
    }
    
    // Generar el cuestionario con Gemini usando el rate limiter
    const generateQuizContent = async () => {
      const result = await model.generateContent(prompt);
      return result.response.text();
    };
    
    const response = await rateLimiter.addToQueue(generateQuizContent);
    
    // Intentar parsear la respuesta como JSON
    let parsedResponse;
    try {
      // Extraer el JSON de la respuesta (por si Gemini añade texto adicional)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No se encontró un formato JSON válido en la respuesta');
      }
    } catch (error) {
      console.error('Error al parsear la respuesta JSON:', error);
      // Si hay error al parsear, devolvemos la respuesta como texto
      parsedResponse = { 
        raw: response,
        error: 'No se pudo generar un cuestionario estructurado. Por favor, intente de nuevo.'
      };
    }
    
    // Guardar el cuestionario en la base de datos
    const conversation = new Conversation({
      sessionId: currentSessionId,
      prompt: JSON.stringify({
        topic,
        questionType,
        questionCount,
        hasDocument: !!req.file
      }),
      response: JSON.stringify(parsedResponse),
      timestamp: new Date()
    });
    
    await conversation.save();
    
    res.json({
      sessionId: currentSessionId,
      sessionTitle,
      quiz: parsedResponse
    });
  } catch (error) {
    console.error('Error al generar el cuestionario:', error);
    res.status(500).json({ 
      error: 'Error al procesar la solicitud',
      details: error.message 
    });
  }
};

// Validar respuesta del usuario
export const validateAnswer = async (req, res) => {
  try {
    const { sessionId, questionIndex, userAnswer, question, correctAnswer, questionType } = req.body;
    
    if (!genAI) {
      return res.status(500).json({ 
        error: 'No se ha configurado correctamente la API de Gemini',
        message: 'Error interno del servidor: API key de Gemini no configurada. Verifica el archivo .env'
      });
    }
    
    // Para preguntas de opción múltiple o verdadero/falso, la validación es directa
    if (correctAnswer !== undefined) {
      let isCorrect;
      
      // Corregir la comparación para preguntas verdadero/falso
      if (questionType === 'true-false') {
        // Normalizar valores para la comparación
        const normalizedUserAnswer = userAnswer.toLowerCase() === 'true';
        const normalizedCorrectAnswer = correctAnswer === 'true' || correctAnswer === true;
        isCorrect = normalizedUserAnswer === normalizedCorrectAnswer;
      } else {
        // Para otras preguntas, comparación directa
        isCorrect = userAnswer === correctAnswer;
      }
      
      // Usar validación local con la comparación corregida
      const result = getLocalAnswerValidation(
        questionType, 
        userAnswer, 
        correctAnswer, 
        question.explanation
      );
      
      // Guardar la respuesta del usuario en la base de datos
      await Conversation.findOneAndUpdate(
        { sessionId },
        { 
          $push: { 
            userAnswers: {
              questionIndex,
              userAnswer,
              correct: isCorrect
            }
          }
        }
      );
      
      return res.json(result);
    }
    
    // Para preguntas abiertas, verificar cuota antes de usar Gemini
    const quotaStatus = checkQuotaAvailable();
    
    // Si la cuota está excedida, usar evaluación local
    if (quotaStatus.isQuotaExceeded) {
      console.log(`Cuota de API excedida. Tiempo estimado para reinicio: ${Math.ceil(quotaStatus.timeToReset/1000)}s`);
      
      // Crear una respuesta genérica para preguntas abiertas
      const fallbackResponse = {
        isCorrect: null,
        score: 5,
        feedback: "El sistema está experimentando alta demanda. No podemos evaluar tu respuesta detalladamente en este momento. Por favor, compara tu respuesta con la respuesta modelo proporcionada. 🧠"
      };
      
      // Guardar en la base de datos
      await Conversation.findOneAndUpdate(
        { sessionId },
        { 
          $push: { 
            userAnswers: {
              questionIndex,
              userAnswer,
              correct: null,
              score: 5
            }
          }
        }
      );
      
      return res.json(fallbackResponse);
    }
    
    // Registrar el uso de la API
    trackApiRequest();
    
    // Para preguntas abiertas, usar Gemini con gestión de límites de tasa
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `Actúa como un profesor que evalúa respuestas a preguntas abiertas.
    
    La pregunta es: "${question.question}"
    
    La respuesta modelo es: "${question.modelAnswer}"
    
    La respuesta del estudiante es: "${userAnswer}"
    
    Evalúa si la respuesta del estudiante cubre los puntos clave de la respuesta modelo.
    No es necesario que sea exactamente igual, pero debe mostrar comprensión del tema.
    Utiliza emojis para hacer más amigable tu feedback.
    
    Formatea tu respuesta como un objeto JSON con esta estructura:
    {
      "isCorrect": true/false,
      "score": (un número del 0 al 10),
      "feedback": "Explicación detallada para el estudiante, comentando lo que está bien y lo que podría mejorar"
    }`;
    
    const generateResponse = async () => {
      const result = await model.generateContent(prompt);
      return result.response.text();
    };
    
    // Usar el rate limiter para la solicitud
    const response = await rateLimiter.addToQueue(generateResponse);
    
    // Intentar parsear la respuesta como JSON
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const evaluation = JSON.parse(jsonMatch[0]);
        
        // Guardar la respuesta del usuario en la base de datos
        await Conversation.findOneAndUpdate(
          { sessionId },
          { 
            $push: { 
              userAnswers: {
                questionIndex,
                userAnswer,
                correct: evaluation.isCorrect,
                score: evaluation.score
              }
            }
          }
        );
        
        return res.json(evaluation);
      } else {
        // Si no podemos obtener un JSON válido, crear una respuesta genérica
        const fallbackResponse = {
          isCorrect: null,
          score: 5,
          feedback: "No se pudo evaluar con precisión tu respuesta. Sin embargo, recuerda que lo importante es que hayas comprendido el concepto. Revisa la respuesta modelo a continuación. 🧠"
        };
        
        return res.json(fallbackResponse);
      }
    } catch (error) {
      console.error('Error al evaluar la respuesta:', error);
      
      // Si hay un error al parsear o procesar, enviamos una respuesta fallback
      return res.json({
        isCorrect: null,
        score: 5,
        feedback: "Debido a problemas técnicos, no podemos evaluar detalladamente tu respuesta en este momento. Por favor, compara tu respuesta con la respuesta modelo para autoevaluarte. 🔍"
      });
    }
  } catch (error) {
    console.error('Error al validar la respuesta:', error);
    res.status(500).json({ 
      error: 'Error al procesar la solicitud',
      details: error.message,
      fallbackResponse: {
        isCorrect: null,
        score: 5,
        feedback: "Debido a problemas técnicos, no podemos evaluar tu respuesta en este momento. Por favor, intenta de nuevo más tarde. 🕒"
      }
    });
  }
};

// Obtener historial de conversaciones de una sesión específica
export const getConversationHistory = async (req, res) => {
  try {
    const { sessionId } = req.query;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Se requiere ID de sesión' });
    }
    
    const conversations = await Conversation.find({ sessionId })
      .sort({ timestamp: 1 })
      .exec();
      
    res.json(conversations);
  } catch (error) {
    console.error('Error al obtener el historial:', error);
    res.status(500).json({ error: 'Error al obtener el historial de conversaciones' });
  }
};

// Obtener todas las sesiones disponibles
export const getSessions = async (req, res) => {
  try {
    const sessions = await Session.find()
      .sort({ createdAt: -1 }) // Ordenar por más reciente primero
      .limit(20) // Limitar a las 20 sesiones más recientes
      .exec();
      
    res.json(sessions);
  } catch (error) {
    console.error('Error al obtener las sesiones:', error);
    res.status(500).json({ error: 'Error al obtener las sesiones de chat' });
  }
};

// Eliminar una sesión
export const deleteSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Se requiere ID de sesión' });
    }
    
    // Eliminar la sesión y sus conversaciones
    await Session.findByIdAndDelete(sessionId);
    await Conversation.deleteMany({ sessionId });
    
    // Eliminar del mapa de sesiones activas si existe
    if (activeSessions.has(sessionId)) {
      activeSessions.delete(sessionId);
    }
    
    res.json({ success: true, message: 'Sesión eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar la sesión:', error);
    res.status(500).json({ error: 'Error al eliminar la sesión de chat' });
  }
};
