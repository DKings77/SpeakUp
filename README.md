# Speak Up 🎙️ · v2

App personal para aprender inglés **hablando**, de A1 a B2, con un tutor de IA ("Sam").
Funciona como **app de iPhone** (Capacitor, instalada con Sideloadly) y como **web en el PC**.

## Apartados

| Pestaña | Qué hace |
|---|---|
| 🏠 **Hoy** | Plan diario de 30 min: repaso (5) → lección (10) → escucha (8) → hablar (7). Racha, minutos y progreso hacia el B2. |
| 📚 **Curso** | 56 unidades + 4 exámenes de nivel (A1, A2, B1, B2). Cada unidad: explicación en español → vocabulario → pronunciación → frases para decir en inglés → test (aprobado ≥70%). |
| 🎧 **Escuchar** | Audio generado a tu nivel (diálogo o monólogo). Lo escuchas sin texto, respondes **hablando**, haces un dictado y al final ves la transcripción. |
| 🗣️ **Hablar** | Conversación con Sam que te corrige: practicar la unidad actual, **Mis temas** (los tuyos), temas libres y role-plays. |
| 🔁 **Repaso** | Tarjetas con repetición espaciada de tus errores y vocabulario (sin IA, coste 0). |

Las lecciones las genera Claude **la primera vez** que abres cada unidad y se guardan en Supabase (no se vuelven a pagar).

## Estructura

```
speak-up/
├── public/                        ← la app (web y contenido de la app de iPhone)
│   ├── index.html, css/, icons/, manifest.webmanifest, sw.js
│   └── js/
│       ├── config.js              ← URL + clave publishable de Supabase (RELLENAR)
│       ├── app.js                 ← arranque, pestañas, Hoy, Hablar, Ajustes
│       ├── curriculum.js          ← temario A1 → B2
│       ├── state.js               ← perfil, progreso, plan diario
│       ├── speech.js              ← voz: iPhone nativo / navegador / Whisper + TTS
│       ├── tutor.js               ← llamadas al backend
│       ├── ui.js
│       └── modes/ course.js · listening.js · conversation.js · review.js
├── supabase/
│   ├── migrations/001_init.sql, 002_course_listening.sql
│   └── functions/tutor/           ← Edge Function (Claude + Whisper opcional)
├── assets/                        ← icono y splash de la app de iPhone
├── capacitor.config.json, package.json, package-lock.json
└── .github/workflows/ios.yml      ← compila el .ipa en un Mac de GitHub
```

## Puesta en marcha

### 1. Supabase (una vez)
1. Crea el proyecto `speak-up` (región Europa).
2. **SQL Editor** → ejecuta `001_init.sql` y después `002_course_listening.sql`.
3. **Authentication → Users → Add user** (tu email + contraseña, *Auto Confirm*).
4. **Authentication → Sign In / Providers** → desactiva *Allow new users to sign up*.
5. **Project Settings → API** → copia *Project URL* y *publishable/anon key* en `public/js/config.js`.

### 2. Backend (PowerShell, en la carpeta del proyecto)
```powershell
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy tutor
```
Opcional: `OPENAI_API_KEY` solo si quieres Whisper (en la app de iPhone **no hace falta**: usa el reconocimiento de Apple, gratis).

### 3. App de iPhone (Sideloadly)
0. **Solo la primera vez**: mueve el workflow a su sitio (PowerShell, en la carpeta del proyecto):
   ```powershell
   New-Item -ItemType Directory -Force .github\workflows | Out-Null; Move-Item ios-workflow.yml .github\workflows\ios.yml -Force
   ```
1. Sube la carpeta a un repo **privado** de GitHub (`git push` a `main`).
2. GitHub → **Actions** → *iOS IPA (Sideloadly)* → se ejecuta sola (o *Run workflow*). Tarda ~10 min.
3. Al terminar: entra en la ejecución → **Artifacts → SpeakUp-ipa** → descarga y descomprime.
4. Abre **Sideloadly**, arrastra `SpeakUp.ipa`, pon tu Apple ID y *Start*.
5. En el iPhone: Ajustes → General → VPN y gestión de dispositivos → confía en tu Apple ID.
6. La primera vez que hables, acepta **Micrófono** y **Reconocimiento de voz**.
7. Cada 7 días: vuelve a instalar el mismo `.ipa` con Sideloadly (tus datos están en Supabase, no se pierden).

> Con Apple ID gratuito puedes tener 3 apps instaladas por sideload a la vez (ya tienes MotoTest).

### 4. En el PC (opcional)
```powershell
npx serve public      # http://localhost:3000 → usa Edge (voces "Natural")
```
O publícalo en Netlify (directorio `public`) para tener una URL.

## Voz
- **iPhone (app)**: reconocimiento de voz de Apple + voces de iOS. Para que Sam suene mejor: Ajustes → Accesibilidad → Contenido leído → Voces → Inglés → descarga una voz *mejorada/premium* (Ava, Evan…) y elígela en Ajustes de la app.
- **PC**: Web Speech API en Edge/Chrome (gratis).
- Mantén pulsado 🎤 mientras hablas (en el PC también vale la barra espaciadora en la conversación).

## Costes estimados (30 min/día)
| Concepto | €/mes |
|---|---|
| Conversación (Claude Haiku) | ~2-4 |
| Lecciones (una vez por unidad, ~60 en total) | ~1 en total |
| Escucha (generar audio + corregir respuestas) | ~1-2 |
| Reconocimiento de voz en iPhone | 0 |
| GitHub Actions (repo privado: 200 min de Mac gratis/mes ≈ 15-20 compilaciones) | 0 |

Pon un **límite de gasto** en console.anthropic.com.

## Seguridad
- La clave de Anthropic solo existe como *secret* de Supabase; nunca en la app.
- La Edge Function exige tu login y todas las tablas tienen RLS (`user_id = auth.uid()`).
- Registro de usuarios desactivado.
