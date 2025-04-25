import fs from 'fs';
import path from 'path';
import os from 'os';

// Función para diagnosticar acceso a sistemas de archivos en Vercel
export const runDiagnostic = () => {
  const isVercel = process.env.VERCEL === '1' || process.cwd().includes('/var/task');
  console.log(`Ejecutando diagnóstico para entorno: ${isVercel ? 'Vercel' : 'Desarrollo local'}`);
  
  // Información del sistema
  const sysInfo = {
    platform: os.platform(),
    release: os.release(),
    type: os.type(),
    cwd: process.cwd(),
    tmpdir: os.tmpdir(),
    homedir: os.homedir(),
    freemem: `${(os.freemem() / 1024 / 1024).toFixed(2)} MB`,
    totalmem: `${(os.totalmem() / 1024 / 1024).toFixed(2)} MB`,
    env: {
      VERCEL: process.env.VERCEL,
      NODE_ENV: process.env.NODE_ENV,
      AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
      AWS_REGION: process.env.AWS_REGION
    }
  };
  
  // Directorios a probar
  const dirsToTest = [
    '/tmp',
    '/var/task',
    '/var/task/uploads',
    process.cwd(),
    path.join(process.cwd(), 'uploads'),
    os.tmpdir()
  ];
  
  const dirResults = [];
  
  // Probar acceso de escritura en cada directorio
  dirsToTest.forEach(dir => {
    const result = {
      directory: dir,
      exists: false,
      writable: false,
      error: null
    };
    
    try {
      console.log(`Verificando directorio: ${dir}`);
      
      // Verificar si existe
      result.exists = fs.existsSync(dir);
      console.log(`- Existe: ${result.exists ? 'Sí' : 'No'}`);
      
      // Intentar crear si no existe
      if (!result.exists) {
        try {
          fs.mkdirSync(dir, { recursive: true });
          result.exists = true;
          console.log(`- Directorio creado exitosamente`);
        } catch (err) {
          result.error = `No se pudo crear: ${err.message}`;
          console.log(`- ${result.error}`);
        }
      }
      
      // Intentar escribir un archivo temporal
      if (result.exists) {
        try {
          const testFilePath = path.join(dir, `test-${Date.now()}.tmp`);
          fs.writeFileSync(testFilePath, 'test');
          result.writable = true;
          console.log(`- Escritura exitosa: ${testFilePath}`);
          
          // Limpiar archivo de prueba
          try {
            fs.unlinkSync(testFilePath);
            console.log(`- Archivo de prueba eliminado`);
          } catch (unlinkErr) {
            console.log(`- No se pudo eliminar archivo de prueba: ${unlinkErr.message}`);
          }
        } catch (writeErr) {
          result.error = `No se pudo escribir: ${writeErr.message}`;
          console.log(`- ${result.error}`);
        }
      }
      
      dirResults.push(result);
    } catch (err) {
      result.error = `Error: ${err.message}`;
      console.log(`- Error accediendo a ${dir}: ${err.message}`);
      dirResults.push(result);
    }
  });
  
  return {
    isVercel,
    system: sysInfo,
    directories: dirResults,
    diagnóstico: 'Verificación de directorios completada'
  };
};
