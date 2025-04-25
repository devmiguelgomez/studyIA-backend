import fs from 'fs';
import path from 'path';

// Función para diagnosticar acceso a sistemas de archivos en Vercel
export const runDiagnostic = () => {
  const isVercel = process.env.VERCEL === '1';
  console.log(`Ejecutando diagnóstico para entorno: ${isVercel ? 'Vercel' : 'Desarrollo local'}`);
  
  // Directorios a probar
  const dirsToTest = [
    '/tmp',
    '/var/task',
    '/var/task/uploads',
    process.cwd(),
    path.join(process.cwd(), 'uploads')
  ];
  
  // Probar acceso de escritura en cada directorio
  dirsToTest.forEach(dir => {
    try {
      console.log(`Verificando directorio: ${dir}`);
      
      // Verificar si existe
      const exists = fs.existsSync(dir);
      console.log(`- Existe: ${exists ? 'Sí' : 'No'}`);
      
      // Intentar crear si no existe
      if (!exists) {
        try {
          fs.mkdirSync(dir, { recursive: true });
          console.log(`- Directorio creado exitosamente`);
        } catch (err) {
          console.log(`- No se pudo crear: ${err.message}`);
        }
      }
      
      // Intentar escribir un archivo temporal
      const testFilePath = path.join(dir, `test-${Date.now()}.tmp`);
      fs.writeFileSync(testFilePath, 'test');
      console.log(`- Escritura exitosa: ${testFilePath}`);
      
      // Limpiar archivo de prueba
      fs.unlinkSync(testFilePath);
      console.log(`- Archivo de prueba eliminado`);
    } catch (err) {
      console.log(`- Error accediendo a ${dir}: ${err.message}`);
    }
  });
  
  return {
    isVercel,
    diagnóstico: 'Verificación de directorios completada'
  };
};
