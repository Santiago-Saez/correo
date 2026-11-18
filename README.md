# Correo — cliente de 10.000 mensajes

Cliente de correo de demostración, sin dependencias. Lista virtualizada de
10.000 mensajes generados localmente, navegación completa por teclado,
selección múltiple con acciones en lote + deshacer, y estados de carga /
vacío / error diseñados.

## Arranque rápido

Sin build ni `npm`. Cualquier servidor estático sirve:

```bash
cd /home/santiago/proyectos/correo
python3 -m http.server 8099
# abrir http://localhost:8099
```

## Estructura

| Archivo      | Contenido                                                        |
|--------------|------------------------------------------------------------------|
| `index.html` | Layout: topbar, sidebar, lista, lector, toast, overlays, ayuda   |
| `styles.css` | Tema, filas, esqueletos, tarjetas vacío/error, HUD de perf      |
| `app.js`     | Datos falsos, virtualización, teclado, lote+undo, filtros, perf |

## Funciones

- **Lista virtualizada (10.000 mensajes, 60 fps):** altura de fila fija
  (`ROW_H = 76px`), `spacer` de `10.000 × 76px`, pool reciclado de ~30 nodos
  posicionados con `transform: translateY()`. Scroll pasivo →
  `requestAnimationFrame(renderList)`. Solo se reescribe el `innerHTML` del
  slot cuando cambia el `id` del mensaje. `OVERSCAN = 8` filas arriba/abajo.
- **Teclado:** `j/k` o `↓/↑` mover foco, `Shift+j/k` extender selección,
  `x` toggle, `*` seleccionar todo, `Enter` abrir, `e` archivar,
  `/` buscar, `Esc` salir/limpiar, `Ctrl+Z` deshacer, `?` ayuda.
  Click + `Shift` extiende; `Ctrl/Cmd+click` selecciona.
- **Selección múltiple y lote:** barra contextual con Marcar leído / No leído /
  Archivar / Eliminar / Limpiar + checkbox de seleccionar todo con estado
  indeterminado.
- **Deshacer con temporizador:** toast inferior con barra y cuenta regresiva de
  5 s (`UNDO_MS = 5000`). Guarda `{msg, from}` para restaurar carpeta y orden.
- **Búsqueda:** filtra remitente + asunto + snippet + email con debounce de
  120 ms; muestra conteo y tiempo de filtrado.
- **Carpetas:** Recibidos (10.000), Destacados (derivado de `star`),
  Enviados (800), Spam (240), Archivados y Papelera (empiezan vacías).
- **Estados:** esqueletos con shimmer al arrancar y al entrar a Spam, tarjeta
  de vacío con variantes (sin resultados / archivo vacío / papelera vacía),
  tarjeta de error 503 con Reintentar / Ver copia local + detalle técnico.
  Forzables desde la sidebar: Datos / Carga / Vacío / Error.

## Medir el renderizado en scroll rápido

Panel negro sobre la lista (siempre visible):

- `FPS` por contador `requestAnimationFrame` (verde ≥ 55, ámbar ≥ 30).
- `render último / media / p95` en ms, medidos con `performance.now()`
  alrededor de `renderList`.
- Ventana `start–end / total`, filas visibles, velocidad en `px/s`, tamaño del pool.
- Barras de los últimos 60 renders (azul < 3,5 ms, ámbar < 8 ms, rojo > 8 ms).

Botón **⚡ Scroll test** (topbar): anima scroll de 0 → final en ~2,2 s y deja el
resumen en la barra inferior + consola, p. ej.:

> `⚡ Scroll test: 759.000px en 2.61s · 140 frames · render medio 1.20ms · p95 2.80ms · máx 6.10ms · FPS 58 · 10.000 mensajes`

La métrica a mirar es el **p95**: debe quedar < 8 ms para sostener 60 fps.

## Datos falsos

Generador determinista (`mulberry32(42)`) en `app.js`: nombres, dominios,
20 asuntos, 10 snippets, 3 cuerpos, etiquetas, adjuntos, estrellas y fechas de
los últimos 30 días, ordenados descendentemente. Todo vive en memoria
(`store.inbox/sent/spam/archive/trash`); archivar/eliminar mueve entre
carpetas, deshacer lo revierte.

## Personalización rápida

- `ROW_H`, `OVERSCAN`, `TOTAL`, `UNDO_MS` arriba de `app.js`.
- Cambiar volumen: `makeMessages(TOTAL, "inbox")` y `store`.
- Cambiar demora de carga: `setTimeout(..., 1100)` en `simulateLoad`.
