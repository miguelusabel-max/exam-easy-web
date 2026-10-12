# Web de captura del alumno

Página estática para el móvil del alumno. Se abre desde el QR del examen; el QR lleva en la URL el profesor, curso, asignatura, parcial, examen y el enlace del formulario de Google de entrega:

```
https://miguelusabel-max.github.io/exam-easy-web/?p=PROFESOR&c=3_ESO&a=FYQ&x=PARCIAL_1&e=EXAM_1&f=https%3A%2F%2Fforms.gle%2F...
```

Qué hace, todo en el móvil y sin servidor:

- Cámara en bucle: foto, comprobación, siguiente.
- Comprobaciones: borrosa (varianza del laplaciano), oscura (luminancia media) y hoja cortada (bordes del encuadre llenos de papel). Cada aviso ofrece "Repetir la foto" o "Usar igualmente".
- Genera un único PDF `EXAM_n__Apellidos_Nombre.pdf` (jsPDF, imágenes JPEG a 1600 px de lado mayor) y lo guarda en el móvil.
- Botón que abre el formulario de Google del profesor; el alumno entra con su cuenta del colegio y sube el PDF.

Ficheros: `index.html`, `styles.css`, `app.js`. Sin dependencias salvo jsPDF desde cdnjs.

Publicación: `scripts\publicar_web.ps1` copia esta carpeta al repositorio público `exam-easy-web` y lo sube; GitHub Pages lo sirve en la URL de arriba. La URL base que usan los QR está en `kit.json`.
