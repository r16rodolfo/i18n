import type { LanguageCode } from "@/lib/languages";

// Interface language. The R16 team uses Portuguese; guests (Paraguayan
// clients) see Spanish by default. Only the screens guests can reach need
// both languages; team-only screens are written in Portuguese directly.
export type UiLang = "pt" | "es";

export function uiLangFor(spokenLanguage: LanguageCode): UiLang {
  return spokenLanguage === "pt" ? "pt" : "es";
}

const LANGUAGE_NAMES: Record<UiLang, Record<LanguageCode, string>> = {
  pt: {
    en: "Inglês",
    es: "Espanhol",
    pt: "Português",
    fr: "Francês",
    de: "Alemão",
    it: "Italiano",
    ja: "Japonês",
    ko: "Coreano",
    zh: "Chinês",
    ar: "Árabe",
  },
  es: {
    en: "Inglés",
    es: "Español",
    pt: "Portugués",
    fr: "Francés",
    de: "Alemán",
    it: "Italiano",
    ja: "Japonés",
    ko: "Coreano",
    zh: "Chino",
    ar: "Árabe",
  },
};

export function languageName(code: LanguageCode, lang: UiLang): string {
  return LANGUAGE_NAMES[lang][code] ?? code.toUpperCase();
}

const TEXT = {
  pt: {
    joinEyebrow: "[ ENTRAR NA REUNIÃO ]",
    joinTitle: "Reunião R16",
    joinSubtitle: "Informe seu nome e os idiomas",
    yourName: "Seu nome",
    yourNamePlaceholder: "Digite seu nome",
    iSpeak: "Eu vou falar em",
    iHear: "Quero ouvir em",
    selectLanguage: "Escolha o idioma",
    loading: "Carregando...",
    joining: "Entrando...",
    joinCall: "Entrar na chamada",
    summary: (speak: string, hear: string) =>
      `Você vai falar em ${speak} e ouvir os outros em ${hear}`,
    joinFailed: "Não foi possível entrar na chamada",
    waitingTitle: "Aguardando o anfitrião",
    waitingText:
      "Avisamos a equipe que você quer entrar. Mantenha esta página aberta.",
    waitingCancel: "Desistir",
    entryDenied: "O anfitrião não autorizou a sua entrada.",
    roomLocked: "Esta reunião não aceita mais entradas.",
    invalidLink: "Este link não é válido ou a reunião já terminou.",
    joiningCall: "Entrando na chamada...",
    hearingIn: (language: string) => `Ouvindo em ${language}`,
    shareLink: "Compartilhar link da reunião",
    mute: "Desligar microfone",
    unmute: "Ligar microfone",
    cameraOff: "Desligar câmera",
    cameraOn: "Ligar câmera",
    leave: "Sair da chamada",
    speaking: "falando...",
    waitingForSpeech: "Aguardando fala...",
    translating: "traduzindo...",
    transcriptTitle: "Transcrição ao vivo",
    allSpeakers: "Todos",
    transcriptShow: "Mostrar transcrição",
    transcriptHide: "Esconder transcrição",
    agentTitle: "Agente de IA",
    agentClear: "Limpar conversa com o agente",
    transcriptEmptyHint: "O que cada pessoa falar aparece aqui, na sua língua",
    askAgent: "Pergunte sobre a reunião...",
    secondsAgo: (s: number) => `há ${s} s`,
    minutesAgo: (m: number) => `há ${m} min`,
    captionsShow: "Mostrar legenda",
    captionsHide: "Esconder legenda",
    floorTake: "Falar",
    floorRelease: "Terminei",
    floorBusy: (name: string) => `${name} está falando`,
    floorHolder: (name: string) => `${name} está com a palavra`,
    floorYouHold: "Você está com a palavra. Clique em Terminei quando acabar.",
    floorFree: "Para falar, clique em Falar",
    floorLockOn: "Trava de fala ligada (clique para desligar)",
    floorLockOff: "Trava de fala desligada (clique para ligar)",
    captionsError:
      "A transcrição não está funcionando. Tente sair e entrar de novo.",
  },
  es: {
    joinEyebrow: "[ UNIRSE A LA REUNIÓN ]",
    joinTitle: "Reunión R16",
    joinSubtitle: "Escribe tu nombre y elige los idiomas",
    yourName: "Tu nombre",
    yourNamePlaceholder: "Escribe tu nombre",
    iSpeak: "Voy a hablar en",
    iHear: "Quiero escuchar en",
    selectLanguage: "Elige el idioma",
    loading: "Cargando...",
    joining: "Entrando...",
    joinCall: "Unirse a la llamada",
    summary: (speak: string, hear: string) =>
      `Vas a hablar en ${speak} y escuchar a los demás en ${hear}`,
    joinFailed: "No fue posible unirse a la llamada",
    waitingTitle: "Esperando al anfitrión",
    waitingText:
      "Avisamos al equipo que quieres entrar. Mantén esta página abierta.",
    waitingCancel: "Cancelar",
    entryDenied: "El anfitrión no autorizó tu entrada.",
    roomLocked: "Esta reunión ya no acepta nuevas entradas.",
    invalidLink: "Este enlace no es válido o la reunión ya terminó.",
    joiningCall: "Entrando a la llamada...",
    hearingIn: (language: string) => `Escuchando en ${language}`,
    shareLink: "Compartir enlace de la reunión",
    mute: "Apagar micrófono",
    unmute: "Encender micrófono",
    cameraOff: "Apagar cámara",
    cameraOn: "Encender cámara",
    leave: "Salir de la llamada",
    speaking: "hablando...",
    waitingForSpeech: "Esperando que alguien hable...",
    translating: "traduciendo...",
    transcriptTitle: "Transcripción en vivo",
    allSpeakers: "Todos",
    transcriptShow: "Mostrar transcripción",
    transcriptHide: "Ocultar transcripción",
    agentTitle: "Agente de IA",
    agentClear: "Borrar conversación con el agente",
    transcriptEmptyHint: "Lo que diga cada persona aparece aquí, en tu idioma",
    askAgent: "Pregunta sobre la reunión...",
    secondsAgo: (s: number) => `hace ${s} s`,
    minutesAgo: (m: number) => `hace ${m} min`,
    captionsShow: "Mostrar subtítulos",
    captionsHide: "Ocultar subtítulos",
    floorTake: "Hablar",
    floorRelease: "Terminé",
    floorBusy: (name: string) => `${name} está hablando`,
    floorHolder: (name: string) => `${name} tiene la palabra`,
    floorYouHold: "Tienes la palabra. Haz clic en Terminé cuando acabes.",
    floorFree: "Para hablar, haz clic en Hablar",
    floorLockOn: "Turno de palabra activado (clic para desactivar)",
    floorLockOff: "Turno de palabra desactivado (clic para activar)",
    captionsError:
      "La transcripción no está funcionando. Intenta salir y volver a entrar.",
  },
} satisfies Record<UiLang, Record<string, unknown>>;

export type UiText = (typeof TEXT)["pt"];

export function uiText(lang: UiLang): UiText {
  return TEXT[lang];
}
