# Impulso

Aplicación privada para desarrollar proyectos de emprendimiento con una guía en ChatGPT. Cada proyecto tiene una pregunta vigente, una próxima acción y una bitácora de supuestos, fuentes, entrevistas, experimentos, decisiones, tareas y documentos. El Lean Canvas reutiliza variables con la sintaxis `{{clave}}`.

## Uso

1. Crea un proyecto y cuenta la idea en tus propias palabras.
2. Abre **Guía en ChatGPT** y copia el prompt con el contexto del proyecto.
3. Debate qué falta comprobar. La guía puede enviar propuestas a **Por revisar**. También puedes importar el JSON desde la interfaz.
4. Revisa la propuesta y aplica los cambios. Cada registro puede enlazar otros registros del mismo proyecto.

## Desarrollo

Interfaz en HTML, CSS y JavaScript. Node.js 22+ para las pruebas. La vista previa usa SQLite local con el adaptador D1 y un usuario de prueba. No requiere instalar dependencias.

```sh
node scripts/preview.mjs 4173
node --test scripts/flow.test.mjs
node scripts/build.mjs
```

## Publicación

- **Vercel.** El proyecto vinculado usa `api/router.js`, un Vercel Blob privado y las variables `BLOB_READ_WRITE_TOKEN` e `IMPULSO_SETUP_TOKEN`. El código de activación se usa una sola vez para elegir una contraseña. La guía usa una clave separada para acciones. La variable de activación también firma las sesiones y la clave de la guía. Los cambios de dominio deben reflejarse en la URL del esquema de acciones.
- **Sites.** `node scripts/build.mjs` genera un Worker ESM sin dependencias en `dist/server/index.js`. La migración inicial está en `drizzle/`. Sites provee la identidad y el enlace D1 `DB`. El Worker expone los comandos de la guía por MCP en `/mcp`.
