// =====================================================================
// Configuración pública (estas dos claves son públicas por diseño;
// la seguridad la dan el login + RLS). La API key de Claude NO va aquí.
// Rellénalas con: Supabase → Project Settings → API.
// =====================================================================
export const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
export const SUPABASE_ANON_KEY = "TU-ANON-O-PUBLISHABLE-KEY";

export const FREETALK_TOPICS = [
  { id: "my job in IT: servers, backups and incidents", label: "💻 Mi trabajo IT" },
  { id: "cycling, triathlon and training", label: "🚴 Triatlón y bici" },
  { id: "my family and home", label: "👨‍👩‍👧 Familia" },
  { id: "my weekend", label: "📅 Fin de semana" },
  { id: "travel and holidays", label: "✈️ Viajes" },
  { id: "food and restaurants", label: "🍽️ Comida" },
  { id: "football and sports on TV", label: "⚽ Fútbol" },
];

export const ROLEPLAY_TOPICS = [
  { id: "hotel", label: "🏨 Check-in en hotel" },
  { id: "airport", label: "🛫 Aeropuerto" },
  { id: "restaurante", label: "🍝 Restaurante" },
  { id: "soporte", label: "📞 Llamada a soporte" },
  { id: "proveedor", label: "🤝 Reunión con proveedor" },
  { id: "reunion", label: "🧑‍💻 Reunión de equipo" },
];
