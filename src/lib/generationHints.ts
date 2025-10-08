export const GENERATION_HINT_OPTIONS = [
  {
    value: 'introduction',
    label: 'Introduction',
    description:
      'Pose le contexte, expose la promesse et accroche immédiatement ton audience.',
  },
  {
    value: 'agenda',
    label: 'Sommaire',
    description: 'Structure les sections clés du deck sous forme de liste claire.',
  },
  {
    value: 'section_break',
    label: 'Transition',
    description: 'Crée une slide de rupture audacieuse pour annoncer la prochaine partie.',
  },
  {
    value: 'dashboard',
    label: 'Dashboard',
    description: 'Mets en scène des KPIs et graphiques percutants avec une hiérarchie nette.',
  },
  {
    value: 'timeline',
    label: 'Timeline',
    description: 'Déroule des étapes dans le temps avec une frise élégante.',
  },
  {
    value: 'process',
    label: 'Process',
    description: 'Expose un workflow étape par étape avec pictos et micro-descriptions.',
  },
  {
    value: 'comparison',
    label: 'Comparatif',
    description: 'Compare des options côte à côte et souligne les différences majeures.',
  },
  {
    value: 'persona',
    label: 'Persona',
    description: 'Dresse le portrait d’une audience cible avec besoins et pain points.',
  },
  {
    value: 'swot',
    label: 'SWOT',
    description:
      'Analyse forces, faiblesses, opportunités et menaces avec un quadrillage soigné.',
  },
  {
    value: 'budget',
    label: 'Budget',
    description: 'Présente allocations financières, projections et points d’attention.',
  },
  {
    value: 'technology',
    label: 'Technologie',
    description: 'Visualise l’architecture ou la stack technique avec un schéma clair.',
  },
  {
    value: 'quote',
    label: 'Citation',
    description: 'Met en lumière une punchline ou un témoignage puissant.',
  },
  {
    value: 'faq',
    label: 'FAQ',
    description: 'Réponds aux questions fréquentes avec une mise en page accessible.',
  },
  {
    value: 'conclusion',
    label: 'Conclusion',
    description: 'Synthétise les messages clés et prépare le terrain pour la suite.',
  },
  {
    value: 'call_to_action',
    label: 'Call to action',
    description: 'Termine avec des actions concrètes à mener et les contacts utiles.',
  },
] as const;

export type GenerationHintValue = (typeof GENERATION_HINT_OPTIONS)[number]['value'];

export const GENERATION_HINT_CONFIDENCE = ['low', 'medium', 'high'] as const;
export type GenerationHintConfidence = (typeof GENERATION_HINT_CONFIDENCE)[number];

const optionMap = new Map<GenerationHintValue, (typeof GENERATION_HINT_OPTIONS)[number]>(
  GENERATION_HINT_OPTIONS.map((option) => [option.value, option]),
);

export const sanitizeHints = (hints?: string[] | null): GenerationHintValue[] => {
  if (!Array.isArray(hints)) return [];
  const unique: GenerationHintValue[] = [];
  const seen = new Set<GenerationHintValue>();

  for (const rawHint of hints) {
    const normalized = rawHint?.toLowerCase?.() as GenerationHintValue;
    if (optionMap.has(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      unique.push(normalized);
    }
  }

  return unique;
};

export const generationHintLabel = (hint: string): string =>
  optionMap.get(hint as GenerationHintValue)?.label ?? hint;

export const generationHintDescription = (hint: string): string | undefined =>
  optionMap.get(hint as GenerationHintValue)?.description;

export const getGenerationHintDetails = (hint: string) =>
  optionMap.get(hint as GenerationHintValue);

export interface GenerationHintSuggestion {
  value: GenerationHintValue;
  rationale: string;
  confidence: GenerationHintConfidence;
}
