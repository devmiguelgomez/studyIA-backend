import mongoose from 'mongoose';
import { isVercel } from './environmentHelper.js';

// Opciones por defecto para la conexión de MongoDB
const MONGODB_OPTIONS = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  // No definimos serverSelectionTimeoutMS a nivel global para permitir la configuración por entorno
};

// Clase para gestionar la conexión a MongoDB
class MongoConnector {
  constructor() {
    this.isConnecting = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
    this.retryDelay = 3000;
    this.vercelEnvironment = isVercel() || process.cwd().includes('/var/task');
    
    // En Vercel, usamos un tiempo de espera más corto para la selección del servidor
    this.serverSelectionTimeout = this.vercelEnvironment ? 5000 : 30000;
  }
  
  // Conectar a MongoDB con reintento automático
  async connect(uri) {
    // Si ya estamos en proceso de conexión, salir
    if (this.isConnecting) return;
    
    this.isConnecting = true;
    this.connectionAttempts++;
    
    try {
      console.log(`Intentando conectar a MongoDB (intento ${this.connectionAttempts}/${this.maxConnectionAttempts})`);
      
      // Conectar con opciones específicas según el entorno
      await mongoose.connect(uri, {
        ...MONGODB_OPTIONS,
        serverSelectionTimeoutMS: this.serverSelectionTimeout
      });
      
      console.log('✅ MongoDB conectado correctamente');
      this.isConnecting = false;
      this.connectionAttempts = 0;
    } catch (error) {
      this.isConnecting = false;
      
      console.error('❌ Error al conectar a MongoDB:', error.message);
      
      // Mostrar mensajes de ayuda específicos según el error
      if (error.name === 'MongooseServerSelectionError') {
        console.log('💡 Posibles causas:');
        console.log('  - La IP no está en la lista blanca de MongoDB Atlas');
        console.log('  - Hay un problema de red o firewall');
        console.log('  - La URI de conexión no es correcta');
        
        if (this.vercelEnvironment) {
          console.log('⚠️ Al ejecutarse en Vercel, debes añadir 0.0.0.0/0 a la lista blanca de MongoDB Atlas');
          console.log('   para permitir conexiones desde cualquier IP');
        }
      }
      
      // Reintentar si no hemos superado el máximo de intentos
      if (this.connectionAttempts < this.maxConnectionAttempts) {
        console.log(`Reintentando conexión en ${this.retryDelay/1000} segundos...`);
        setTimeout(() => this.connect(uri), this.retryDelay);
      } else {
        console.error(`Máximo de intentos de conexión alcanzado (${this.maxConnectionAttempts}). No se pudo conectar a MongoDB.`);
        this.connectionAttempts = 0;
      }
    }
  }
  
  // Método para comprobar si la conexión está activa
  isConnected() {
    return mongoose.connection.readyState === 1;
  }
  
  // Cerrar conexión
  async disconnect() {
    if (this.isConnected()) {
      await mongoose.disconnect();
      console.log('Desconectado de MongoDB');
    }
  }
}

export default new MongoConnector();
