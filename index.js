require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 1. Configuración de Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Usamos el modelo Lite que vimos en tu panel para evitar errores de cuota
const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });

// 2. Base de conocimientos del ITEC 2
const DATA_ITEC = `
Eres el asistente virtual del ITEC N° 2 de Posadas, Misiones.
Ubicación: Av. Zapiola y Calle 74, Chacra 112.

Oferta Académica:
Auxiliar en Higiene y Seguridad Laboral, Peluquería, Reparación de PC y Redes, Carpintero de Obra Fina, Cocinero, Confeccionista a Medida, Instalador de Sistemas de Frío, Operador de Informática, Inglés, Montador Electricista, Montador de Gas, Operario Hortícola, Pastelero, Pintura sobre Tela, SiPTeD (Secundaria) y Soldador Básico.

REGLAS CRÍTICAS DE RESPUESTA:
- NO te presentes en cada mensaje. Si el usuario ya te saludó o la charla sigue, responde DIRECTO a la pregunta. 
- Prohibido empezar con "Hola, soy el asistente" si no es la primera vez que escriben.
- Si preguntan ubicación, da este link: https://maps.app.goo.gl/A8gd4s9W49L2nbPa7
- Tono: Breve, amable y misionero formal.
`;

// 3. Inicialización de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        handleSIGINT: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// QR y Ready
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('--- ESCANEA EL QR PARA VINCULAR ---');
});

client.on('ready', () => {
    console.log('¡El asistente del ITEC 2 está ONLINE!');
});

// --- SOLUCIÓN: RECHAZAR LLAMADAS AUTOMÁTICAMENTE ---
client.on('call', async (call) => {
    console.log('Llamada recibida, rechazando...');
    await call.reject();
});

// 4. Lógica de respuesta (SOLO CHAT DE TEXTO)
client.on('message', async (msg) => {
    
    // FILTROS DE SEGURIDAD
    if (msg.from === 'status@broadcast') return; // Ignora estados de WhatsApp
    if (msg.fromMe) return; // No se responde a sí mismo
    
    const chat = await msg.getChat();
    if (chat.isGroup) return; // No responde en grupos
    if (msg.type !== 'chat') return; // Ignora audios, fotos, stickers y videos

    try {
        // Prompt mejorado para evitar repeticiones de saludo
        const prompt = `${DATA_ITEC}\n\nINSTRUCCIÓN: El usuario ya está conversando contigo. No vuelvas a presentarte. Responde de forma directa y natural a esto: ${msg.body}`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Enviar respuesta única
        await msg.reply(text);
        
    } catch (error) {
        if (error.status === 429) {
            console.log('Límite de velocidad (429). Esperando para responder...');
        } else {
            console.error('Error al procesar con Gemini:', error);
        }
    }
});

client.initialize();