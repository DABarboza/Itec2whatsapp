require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 1. Configuración de Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Usamos el modelo Lite que vimos en tu panel para evitar errores de cuota
const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });

const courseMap = {
  higiene: "auxiliar_higiene_seguridad.txt",
  seguridad: "auxiliar_higiene_seguridad.txt",
  peluquería: "peluqueria.txt",
  peluqueria: "peluqueria.txt",
  pc: "reparacion_pc_redes.txt",
  computadora: "reparacion_pc_redes.txt",
  redes: "reparacion_pc_redes.txt",
  carpintero: "carpintero_obra_fina.txt",
  "obra fina": "carpintero_obra_fina.txt",
  cocinero: "cocinero.txt",
  cocina: "cocinero.txt",
  confeccionista: "confeccionista_medida.txt",
  ropa: "confeccionista_medida.txt",
  frío: "instalador_sistemas_frio.txt",
  refrigeracion: "instalador_sistemas_frio.txt",
  informática: "operador_informatica.txt",
  informatica: "operador_informatica.txt",
  inglés: "ingles.txt",
  ingles: "ingles.txt",
  electricista: "montador_electricista.txt",
  eléctrico: "montador_electricista.txt",
  gas: "montador_gas.txt",
  hortícola: "operario_horticola.txt",
  horticola: "operario_horticola.txt",
  huerta: "operario_horticola.txt",
  pastelero: "pastelero.txt",
  repostería: "pastelero.txt",
  pintura: "pintura_tela.txt",
  arte: "pintura_tela.txt",
  secundaria: "sipted_secundaria.txt",
  sipted: "sipted_secundaria.txt",
  soldador: "soldador_basico.txt",
  soldadura: "soldador_basico.txt",
};

// 3. Inicialización de WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  authTimeoutMs: 60000, // Le damos más tiempo para procesar el vínculo
  puppeteer: {
    executablePath: "/usr/bin/chromium", // Usar Chromium del sistema
    handleSIGINT: false,
    headless: true, // Asegurar modo headless
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
      "--disable-extensions",
      "--no-first-run",
      "--ignore-certificate-errors",
      "--ignore-ssl-errors",
      // Actualizar user-agent a Chrome más reciente
      "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ],
  },
});

// QR y Ready
client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("--- ESCANEA EL QR PARA VINCULAR ---");
});

client.on("ready", () => {
  console.log("¡El asistente del ITEC 2 está ONLINE!");
});

// --- SOLUCIÓN: RECHAZAR LLAMADAS AUTOMÁTICAMENTE ---
client.on("call", async (call) => {
  console.log("Llamada recibida, rechazando...");
  await call.reject();
});

// 4. Lógica de respuesta (SOLO CHAT DE TEXTO)
client.on("message", async (msg) => {
  // FILTROS DE SEGURIDAD
  if (msg.from === "status@broadcast") return; // Ignora estados de WhatsApp
  if (msg.fromMe) return; // No se responde a sí mismo

  const chat = await msg.getChat();
  if (chat.isGroup) return; // No responde en grupos
  if (msg.type !== "chat") return; // Ignora audios, fotos, stickers y videos

  try {
    // Cargar datos base
    let data = fs.readFileSync(
      path.join(__dirname, "data", "general.txt"),
      "utf8",
    );

    // Buscar si la consulta menciona un curso específico
    const lowerBody = msg.body.toLowerCase();
    for (const [key, file] of Object.entries(courseMap)) {
      if (lowerBody.includes(key)) {
        const courseData = fs.readFileSync(
          path.join(__dirname, "data", file),
          "utf8",
        );
        data += "\n\n" + courseData;
        break;
      }
    }

    // Prompt mejorado para evitar repeticiones de saludo
    const prompt = `${data}\n\nINSTRUCCIÓN: El usuario ya está conversando contigo. No vuelvas a presentarte. Responde de forma directa y natural a esto: ${msg.body}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Enviar respuesta única
    await msg.reply(text);
  } catch (error) {
    if (error.status === 429) {
      console.log("Límite de velocidad (429). Esperando para responder...");
    } else {
      console.error("Error al procesar con Gemini:", error);
    }
  }
});

client.initialize();

// --- AUTOMATIC DEPLOYMENT VIA GITHUB WEBHOOK ---
// añade a tu .env la variable WEBHOOK_SECRET con el mismo valor que configures
// en el webhook de GitHub (Settings → Webhooks → Add webhook).
// El servidor escucha en el puerto 3000 y ejecuta un git pull + pm2 reload cuando
// recibe un push a la rama main.

const http = require("http");
const crypto = require("crypto");
const { exec } = require("child_process");

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const PROJECT_DIR = __dirname; // ruta del proyecto en la netbook
const PORT = process.env.WEBHOOK_PORT || 3000;

function verifySignature(req, body) {
  const signature = req.headers["x-hub-signature-256"] || "";
  const hmac =
    "sha256=" +
    crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
  } catch (e) {
    return false;
  }
}

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url === "/github-webhook") {
      let data = "";
      req.on("data", (chunk) => {
        data += chunk;
      });
      req.on("end", () => {
        if (!WEBHOOK_SECRET || !verifySignature(req, data)) {
          res.writeHead(401);
          return res.end("invalid signature");
        }
        let payload;
        try {
          payload = JSON.parse(data);
        } catch (e) {
          payload = {};
        }
        // sólo actuamos sobre pushes a main
        if (payload.ref === "refs/heads/main") {
          console.log("Webhook recibido: actualizando código...");
          exec(
            `cd ${PROJECT_DIR} && git pull origin main && npm install && pm2 reload all`,
            (err, stdout, stderr) => {
              if (err) console.error("Error en despliegue:", err);
              else console.log("Despliegue automático completado.");
            },
          );
        }
        res.writeHead(200);
        res.end("ok");
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  })
  .listen(PORT, () => {
    console.log(`Servidor de webhook escuchando en el puerto ${PORT}`);
  });
