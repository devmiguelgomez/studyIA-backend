# Study Buddy - Backend

Este es el backend de la aplicación Study Buddy, desarrollado con Node.js, Express y MongoDB. Proporciona una API para interactuar con la IA de Gemini y gestionar cuestionarios y sesiones de estudio.

## Tecnologías utilizadas

- **Node.js**: Entorno de ejecución para JavaScript del lado del servidor
- **Express 4.18**: Framework web rápido y minimalista para Node.js
- **MongoDB y Mongoose 8.1**: Base de datos NoSQL y ODM para modelado de datos
- **Google Generative AI 0.3**: SDK oficial para interactuar con la API de Gemini
- **Multer 1.4**: Middleware para manejo de subida de archivos
- **pdf-parse 1.1**: Biblioteca para extraer texto de documentos PDF
- **mammoth 1.6**: Biblioteca para extraer texto de documentos Word
- **tesseract.js 5.0**: Implementación JavaScript de Tesseract OCR para extraer texto de imágenes
- **dotenv 16.4**: Carga de variables de entorno desde archivo .env
- **cors 2.8**: Middleware para habilitar CORS (Cross-Origin Resource Sharing)

## Características principales

- **API REST completa**: Endpoints para crear y gestionar cuestionarios y sesiones
- **Integración con Google Gemini**: Utiliza modelos de IA generativa para crear cuestionarios personalizados
- **Procesamiento de documentos**: Extracción de texto de PDFs, documentos Word e imágenes
- **Gestión de cuota de API**: Sistema de monitoreo y límites para controlar el uso de la API de Gemini
- **Sistema de reintentos**: Manejo inteligente de errores y límites de tasa con reintentos exponenciales
- **Persistencia de datos**: Almacenamiento de sesiones y conversaciones en MongoDB

## Estructura del proyecto

```
backend/
├── controllers/
│   └── chatController.js      # Controladores para la API de chat y cuestionarios
├── models/
│   ├── Conversation.js        # Modelo para conversaciones
│   └── Session.js             # Modelo para sesiones de estudio
├── routes/
│   └── chatRoutes.js          # Rutas de la API
├── utils/
│   └── quotaMonitor.js        # Monitoreo de cuota de API
├── uploads/                   # Directorio para archivos subidos (temporal)
├── test/
│   └── data/                  # Datos de prueba
├── logs/                      # Registros de uso de API
├── .env.example               # Ejemplo de variables de entorno
├── create-test-dirs.js        # Script para crear directorios de prueba
├── check-dependencies.js      # Script para verificar dependencias
├── package.json               # Dependencias y scripts
├── server.js                  # Punto de entrada principal
└── vercel.json                # Configuración para despliegue en Vercel
```

## Requisitos previos

- Node.js v14 o superior
- MongoDB (local o remoto)
- Clave API de Google Gemini

## Configuración

1. Clona el repositorio
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Crea un archivo `.env` basado en `.env.example` y configura tus variables de entorno:
   ```
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/study-buddy-app
   GEMINI_API_KEY=tu-api-key-de-gemini-aqui
   ```

## Ejecución

### Modo desarrollo:
```bash
npm run dev
```

### Modo producción:
```bash
npm start
```

## Principales endpoints

- **POST /api/chat/quiz**: Genera un nuevo cuestionario
- **POST /api/chat/validate**: Valida la respuesta de un usuario
- **GET /api/chat/sessions**: Obtiene todas las sesiones
- **GET /api/chat/history**: Obtiene el historial de conversaciones de una sesión
- **DELETE /api/chat/sessions/:sessionId**: Elimina una sesión

## Despliegue

Este backend puede desplegarse en plataformas como:

- **Vercel**: Configurado para despliegue automático con `vercel.json`
- **Heroku**: Compatible con Node.js
- **DigitalOcean App Platform**: Despliegue sencillo con soporte para MongoDB

## Seguridad y rendimiento

- **Rate limiting**: Control de frecuencia de solicitudes para evitar abusos
- **Error handling**: Manejo robusto de errores con respuestas informativas
- **Monitoreo de cuota**: Sistema para evitar exceder los límites de la API de Gemini
- **Limpieza automática**: Eliminación de archivos temporales después del procesamiento# studyIA-backend
